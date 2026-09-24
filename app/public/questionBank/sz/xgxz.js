import { questions } from './xgxz-data.js';
import { STORAGE_KEY, createState, restoreState, changeMode, selectOption, submitAnswer, revealAnswer, retryQuestion, getStats } from './xgxz-core.js';

const $ = id => document.getElementById(id);
const modeNames = { sequence: '顺序练习', shuffle: '随机练习', wrong: '错题专练' };
const statusNames = { draft: '已选未提交', correct: '答对', wrong: '答错', revealed: '已看答案' };
const byId = new Map(questions.map(q => [q.id, q]));
const optionButtons = [...document.querySelectorAll('.option')];
const modeButtons = [...document.querySelectorAll('[data-mode]')];
let state = createState(questions);
let storageAvailable = true;
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try { state = restoreState(JSON.parse(saved), questions); }
        catch { $('saveStatus').textContent = '旧进度无法读取，已开始新练习'; }
    }
} catch { storageAvailable = false; }

function updateSaveStatus() {
    $('saveStatus').classList.toggle('is-error', !storageAvailable);
    if (!storageAvailable) $('saveStatus').textContent = '本机保存不可用，刷新会丢失本次进度';
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        storageAvailable = true;
        $('saveStatus').textContent = '进度已保存在本机';
    } catch { storageAvailable = false; }
    updateSaveStatus();
}

function currentQuestion() { return byId.get(state.order[state.cursor]); }
function isDone(id) { const r = state.records[id]; return r && r.status !== 'draft'; }

function update(next, { focus = false } = {}) {
    if (next === state) return;
    state = next;
    $('summary').hidden = true;
    save();
    render();
    if (focus) $('questionText').focus({ preventScroll: true });
}

function goTo(cursor) {
    if (cursor < 0 || cursor >= state.order.length) return;
    const viewportX = window.scrollX;
    const viewportY = window.scrollY;
    update({ ...state, cursor }, { focus: true });
    // 移动端切题时保持页面纵向位置，避免按钮点击后视口突然跳到题干顶部。
    window.scrollTo(viewportX, viewportY);
    requestAnimationFrame(() => window.scrollTo(viewportX, viewportY));
}

function render() {
    const q = currentQuestion();
    const record = state.records[q.id];
    const done = isDone(q.id);
    const stats = getStats(state);
    $('questionText').textContent = q.stem;
    // 新题从题干开头显示，但不影响页面本身的滚动位置。
    $('questionText').scrollTop = 0;
    $('sourceNumber').textContent = `原题第 ${q.id} 题`;
    $('progress').textContent = `${state.cursor + 1} / ${state.order.length}`;
    $('questionHint').textContent = state.wrong.includes(q.id) ? '本题在错题本中，独立作答正确后自动移出。' : '选择一个选项，提交后查看结果。';
    optionButtons.forEach((button, index) => {
        const selected = record?.selected === index;
        const correct = done && index === q.answer;
        const wrong = done && record.status === 'wrong' && selected;
        button.querySelector('.content').textContent = q.options[index];
        button.querySelector('.option-state').textContent = correct ? '正确答案' : wrong ? '你的选择' : selected ? '已选' : '';
        button.setAttribute('aria-pressed', String(selected));
        // 保留选项的键盘焦点，状态逻辑拒绝重复选择。
        button.setAttribute('aria-disabled', String(!!done));
        button.classList.toggle('is-correct', !!correct);
        button.classList.toggle('is-wrong', !!wrong);
    });
    // 保留反馈区域的高度，即使尚未作答也不会把底部按钮向上推移。
    $('feedback').hidden = false;
    $('feedback').className = `feedback ${done ? record.status : 'is-empty'}`;
    if (done) {
        const answer = `${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}`;
        $('feedback').textContent = record.status === 'correct' ? `回答正确！${answer}`
            : record.status === 'wrong' ? `本题已加入错题本。正确答案：${answer}`
                : `正确答案：${answer}。本题标记为“已看答案”，不计入正确率。`;
    } else $('feedback').textContent = '';
    $('submitAnswer').disabled = !!done || record?.selected == null;
    $('submitAnswer').textContent = done ? '已查看答案' : '提交答案';
    if (done && record.status !== 'revealed') $('submitAnswer').textContent = '已提交';
    $('revealAnswer').hidden = !!done;
    $('retryQuestion').hidden = !record;
    $('retryQuestion').textContent = done ? '重新作答' : '清除选择';
    $('previousQuestion').disabled = state.cursor === 0;
    $('nextQuestion').textContent = state.cursor === state.order.length - 1 ? '查看本轮小结' : '下一题 →';
    modeButtons.forEach(button => {
        const active = button.dataset.mode === state.mode;
        button.setAttribute('aria-pressed', String(active));
        button.disabled = button.dataset.mode === 'wrong' && state.wrong.length === 0 && !active;
    });
    $('wrongCount').textContent = state.wrong.length;
    $('modeName').textContent = modeNames[state.mode];
    $('completedCount').textContent = stats.completed;
    $('totalCount').textContent = `/ ${stats.total} 题`;
    $('progressBar').max = stats.total;
    $('progressBar').value = stats.completed;
    $('correctCount').textContent = stats.correct;
    $('incorrectCount').textContent = stats.wrong;
    $('accuracy').textContent = stats.accuracy === null ? '—' : `${stats.accuracy}%`;
    $('nextUnanswered').disabled = stats.completed === stats.total;
    $('sheetHint').textContent = state.mode === 'wrong' ? '本轮错题列表固定，答对后不会跳题。' : '显示原题号，点击即可跳转。';
    renderSheet();
}

let sheetOrder = '';
function renderSheet() {
    const signature = state.order.join(',');
    // 仅题序改变时重建，作答时保留题号按钮的焦点和滚动位置。
    if (signature !== sheetOrder) {
        const fragment = document.createDocumentFragment();
        state.order.forEach((id, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = id;
            button.addEventListener('click', () => goTo(index));
            fragment.append(button);
        });
        $('questionGrid').replaceChildren(fragment);
        sheetOrder = signature;
    }
    [...$('questionGrid').children].forEach((button, index) => {
        const id = state.order[index];
        const status = state.records[id]?.status;
        button.className = status || '';
        button.setAttribute('aria-current', String(index === state.cursor));
        button.setAttribute('aria-label', `第 ${id} 题，${statusNames[status] || '未答'}`);
        button.title = button.getAttribute('aria-label');
    });
}

function showSummary() {
    const stats = getStats(state);
    $('summaryTitle').textContent = stats.completed === stats.total ? '本轮已完成，辛苦了！' : '还有题目等你完成';
    $('summaryText').textContent = `共 ${stats.total} 题：答对 ${stats.correct} 题，答错 ${stats.wrong} 题，已看答案 ${stats.revealed} 题，未答 ${stats.total - stats.completed} 题。${stats.answered ? `正确率 ${stats.accuracy}%。` : '完成独立作答后显示正确率。'}`;
    $('resumeQuestion').hidden = stats.completed === stats.total;
    $('summary').hidden = false;
    $('summary').focus();
}

function nextQuestion() {
    if (state.cursor === state.order.length - 1) showSummary();
    else goTo(state.cursor + 1);
}

function nextUnanswered() {
    for (let offset = 1; offset <= state.order.length; offset++) {
        const cursor = (state.cursor + offset) % state.order.length;
        if (!isDone(state.order[cursor])) { goTo(cursor); return; }
    }
    showSummary();
}

optionButtons.forEach((button, index) => button.addEventListener('click', () => update(selectOption(state, currentQuestion(), index))));
modeButtons.forEach(button => button.addEventListener('click', () => update(changeMode(state, button.dataset.mode, questions), { focus: true })));
$('submitAnswer').addEventListener('click', () => update(submitAnswer(state, currentQuestion())));
$('revealAnswer').addEventListener('click', () => update(revealAnswer(state, currentQuestion())));
$('retryQuestion').addEventListener('click', () => update(retryQuestion(state, currentQuestion().id), { focus: true }));
$('previousQuestion').addEventListener('click', () => goTo(state.cursor - 1));
$('nextQuestion').addEventListener('click', nextQuestion);
$('nextUnanswered').addEventListener('click', nextUnanswered);
$('resumeQuestion').addEventListener('click', nextUnanswered);
document.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    const index = 'abcd'.indexOf(key);
    if ((key.length === 1 && index >= 0) || /^[1-4]$/.test(key)) {
        event.preventDefault();
        update(selectOption(state, currentQuestion(), index >= 0 ? index : Number(key) - 1));
    } else if (key === 'arrowleft' || key === 'arrowright') {
        event.preventDefault();
        if (key === 'arrowleft') goTo(state.cursor - 1); else nextQuestion();
    } else if (key === 'enter' && (!event.target.closest('button, a, summary') || event.target.closest('.option'))) {
        // 选项获得焦点时 Enter 仍提交；导航按钮保留原生 Enter 激活行为。
        event.preventDefault();
        if (isDone(currentQuestion().id)) nextQuestion();
        else update(submitAnswer(state, currentQuestion()));
    }
});

updateSaveStatus();
render();
$('practiceApp').hidden = false;
