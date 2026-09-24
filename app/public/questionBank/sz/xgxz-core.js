// 刷题状态与页面分离，题号始终对应原题库，随机排序不会改变答案映射。
export const STORAGE_KEY = 'autumn-xgxz-v1';
const MODES = ['sequence', 'shuffle', 'wrong'];
const STATUSES = ['draft', 'correct', 'wrong', 'revealed'];

export function shuffle(source, random = Math.random) {
    const result = [...source];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function createState(questions) {
    return { version: 1, mode: 'sequence', order: questions.map(q => q.id), cursor: 0, records: {}, wrong: [] };
}

export function restoreState(raw, questions) {
    const state = createState(questions);
    if (!raw || raw.version !== 1) return state;
    const byId = new Map(questions.map(q => [q.id, q]));
    // 不信任本地缓存：去重、剔除过期题号、重新校验判题结果。
    if (raw.records && typeof raw.records === 'object') {
        for (const q of questions) {
            const record = raw.records[q.id];
            if (!record || !STATUSES.includes(record.status)) continue;
            const validSelection = Number.isInteger(record.selected) && record.selected >= 0 && record.selected < q.options.length;
            if (!validSelection && record.selected !== null) continue;
            if (['correct', 'wrong'].includes(record.status) && !validSelection) continue;
            state.records[q.id] = {
                selected: record.selected,
                status: ['correct', 'wrong'].includes(record.status)
                    ? (record.selected === q.answer ? 'correct' : 'wrong') : record.status,
            };
        }
    }
    state.wrong = [...new Set(Array.isArray(raw.wrong) ? raw.wrong.filter(id => byId.has(id)) : [])];
    for (const [id, record] of Object.entries(state.records)) {
        if (record.status === 'wrong' && !state.wrong.includes(Number(id))) state.wrong.push(Number(id));
        if (record.status === 'correct') state.wrong = state.wrong.filter(value => value !== Number(id));
    }
    if (MODES.includes(raw.mode)) state.mode = raw.mode;
    const validOrder = Array.isArray(raw.order) && raw.order.length > 0 &&
        new Set(raw.order).size === raw.order.length && raw.order.every(id => byId.has(id));
    if (validOrder && (state.mode === 'wrong' || raw.order.length === questions.length)) {
        state.order = state.mode === 'sequence' ? questions.map(q => q.id) : [...raw.order];
        state.cursor = Number.isInteger(raw.cursor) ? Math.max(0, Math.min(raw.cursor, state.order.length - 1)) : 0;
    } else {
        state.mode = 'sequence';
    }
    return state;
}

export function changeMode(state, mode, questions, random = Math.random) {
    if (!MODES.includes(mode) || mode === state.mode || (mode === 'wrong' && !state.wrong.length)) return state;
    const ids = questions.map(q => q.id);
    const order = mode === 'wrong' ? ids.filter(id => state.wrong.includes(id))
        : mode === 'shuffle' ? shuffle(ids, random) : ids;
    const currentId = state.order[state.cursor];
    const records = { ...state.records };
    // 错题专练使用固定队列；答对移出错题本，但不缩短队列，以免跳题。
    if (mode === 'wrong') order.forEach(id => { delete records[id]; });
    return { ...state, mode, order, cursor: mode === 'sequence' ? Math.max(0, order.indexOf(currentId)) : 0, records };
}

export function selectOption(state, question, selected) {
    if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) return state;
    const record = state.records[question.id];
    if (record && record.status !== 'draft') return state;
    return { ...state, records: { ...state.records, [question.id]: { selected, status: 'draft' } } };
}

export function submitAnswer(state, question) {
    const record = state.records[question.id];
    if (!record || record.status !== 'draft' || record.selected === null) return state;
    const correct = record.selected === question.answer;
    return {
        ...state,
        records: { ...state.records, [question.id]: { ...record, status: correct ? 'correct' : 'wrong' } },
        wrong: correct ? state.wrong.filter(id => id !== question.id) : [...new Set([...state.wrong, question.id])],
    };
}

export function revealAnswer(state, question) {
    const record = state.records[question.id];
    if (record && record.status !== 'draft') return state;
    return { ...state, records: { ...state.records, [question.id]: { selected: record?.selected ?? null, status: 'revealed' } } };
}

export function retryQuestion(state, id) {
    const records = { ...state.records };
    delete records[id];
    // 重做或看答案均不移除错题，只有重新提交正确答案才移除。
    return { ...state, records };
}

export function getStats(state) {
    const records = state.order.map(id => state.records[id]);
    const correct = records.filter(r => r?.status === 'correct').length;
    const wrong = records.filter(r => r?.status === 'wrong').length;
    const revealed = records.filter(r => r?.status === 'revealed').length;
    const answered = correct + wrong;
    return { correct, wrong, revealed, answered, total: state.order.length,
        completed: answered + revealed, accuracy: answered ? Math.round(correct / answered * 100) : null };
}
