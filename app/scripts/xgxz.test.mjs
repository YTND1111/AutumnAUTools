import test from 'node:test';
import assert from 'node:assert/strict';
import { questions } from '../public/questionBank/sz/xgxz-data.js';
import { createState, restoreState, changeMode, selectOption, submitAnswer, revealAnswer, retryQuestion, getStats } from '../public/questionBank/sz/xgxz-core.js';

const first = questions[0];
const second = questions[1];
const answer = (state, q, selected) => submitAnswer(selectOption(state, q, selected), q);
const wrongAnswer = q => (q.answer + 1) % q.options.length;

test('151 道题的题号、选项与答案均有效', () => {
    assert.equal(questions.length, 151);
    assert.equal(new Set(questions.map(q => q.id)).size, 151);
    for (const q of questions) {
        assert.ok(q.stem.length > 0);
        assert.equal(q.options.length, 4);
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
    }
});

test('未选择时不能提交，重复提交及已提交后改选不重复计数', () => {
    const empty = createState(questions);
    assert.equal(submitAnswer(empty, first), empty);
    assert.equal(selectOption(empty, first, 4), empty);
    const done = answer(empty, first, first.answer);
    assert.equal(submitAnswer(done, first), done);
    assert.equal(selectOption(done, first, wrongAnswer(first)), done);
    assert.equal(revealAnswer(done, first), done);
    assert.equal(getStats(done).correct, 1);
});

test('错题去重，重做及看答案不移除，独立答对才移出', () => {
    let state = answer(createState(questions), first, wrongAnswer(first));
    assert.deepEqual(state.wrong, [first.id]);
    state = answer(retryQuestion(state, first.id), first, wrongAnswer(first));
    assert.deepEqual(state.wrong, [first.id]);
    state = revealAnswer(retryQuestion(state, first.id), first);
    assert.deepEqual(state.wrong, [first.id]);
    assert.equal(getStats(state).answered, 0);
    assert.equal(getStats(state).revealed, 1);
    state = answer(retryQuestion(state, first.id), first, first.answer);
    assert.deepEqual(state.wrong, []);
    assert.equal(getStats(state).accuracy, 100);
});

test('看答案不算答对或答错，正确率仅包含真正提交的题', () => {
    let state = answer(createState(questions), first, first.answer);
    state = answer(state, second, wrongAnswer(second));
    state = revealAnswer(state, questions[2]);
    assert.deepEqual(getStats(state), { correct: 1, wrong: 1, revealed: 1, answered: 2, completed: 3, total: 151, accuracy: 50 });
});

test('刷新恢复草稿、判题结果、随机题序与当前位置', () => {
    let state = changeMode(createState(questions), 'shuffle', questions, () => 0.35);
    state = selectOption(state, first, 0);
    state = answer(state, second, second.answer);
    state.cursor = 12;
    assert.equal(new Set(state.order).size, 151);
    assert.notDeepEqual(state.order, questions.map(q => q.id));
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state)), questions), state);
    const sequence = changeMode(state, 'sequence', questions);
    assert.equal(sequence.order[sequence.cursor], state.order[state.cursor]);
});

test('随机练习按原题号判题，不按显示位置取答案', () => {
    let state = changeMode(createState(questions), 'shuffle', questions, () => 0);
    const q = questions.find(q => q.id === state.order[0]);
    assert.notEqual(q.id, first.id);
    state = answer(state, q, q.answer);
    assert.equal(state.records[q.id].status, 'correct');
    assert.equal(state.records[first.id], undefined);
});

test('错题专练不泄露旧答案，答对后不缩短队列、刷新不漏题', () => {
    let state = answer(createState(questions), first, wrongAnswer(first));
    state = answer(state, second, wrongAnswer(second));
    state = changeMode(state, 'wrong', questions);
    assert.deepEqual(state.order, [first.id, second.id]);
    assert.equal(state.records[first.id], undefined);
    state = answer(state, first, first.answer);
    assert.deepEqual(state.wrong, [second.id]);
    assert.deepEqual(state.order, [first.id, second.id]);
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state)), questions), state);
    state = answer({ ...state, cursor: 1 }, second, second.answer);
    const restored = restoreState(JSON.parse(JSON.stringify(state)), questions);
    assert.equal(restored.cursor, 1);
    assert.equal(restored.mode, 'wrong');
    assert.deepEqual(restored.wrong, []);
    assert.equal(getStats(restored).completed, 2);
});

test('空错题不进入专练，重复点击当前模式不重置进度', () => {
    const state = createState(questions);
    assert.equal(changeMode(state, 'wrong', questions), state);
    assert.equal(changeMode(state, 'sequence', questions), state);
});

test('损坏或旧版缓存安全回退，非法题号、选项、重复排序得到处理', () => {
    for (const raw of [null, [], 'bad', 42, { version: 2 }]) {
        assert.deepEqual(restoreState(raw, questions), createState(questions));
    }
    const restored = restoreState({ version: 1, mode: 'wrong', order: [9999], cursor: -99,
        wrong: [1, 1, 9999, '2'], records: {
            1: { selected: first.answer, status: 'wrong' },
            2: { selected: 9, status: 'correct' },
            3: { selected: null, status: 'wrong' },
            4: { selected: 0, status: 'other' },
        } }, questions);
    assert.equal(restored.mode, 'sequence');
    assert.equal(restored.order.length, 151);
    assert.equal(restored.cursor, 0);
    assert.deepEqual(restored.wrong, []);
    assert.deepEqual(restored.records, { 1: { selected: first.answer, status: 'correct' } });
    const duplicate = restoreState({ version: 1, mode: 'shuffle', order: Array(151).fill(1) }, questions);
    assert.equal(duplicate.mode, 'sequence');
});
