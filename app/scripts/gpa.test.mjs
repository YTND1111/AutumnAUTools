import test from "node:test";
import assert from "node:assert/strict";
import { readNumber, parseBands, EXAMPLE_BANDS, calculateGpa, calculateGpaTarget, calculateExamTarget, ceilTarget, formatGpa } from "../src/services/gpa.ts";
import { defaultGpaState, restoreGpaState } from "../src/services/gpaStorage.ts";

const bands = parseBands(EXAMPLE_BANDS, 4).bands;
let nextId = 0;
const course = (credits, grade, rest = {}) => ({ id: String(++nextId), name: "课程", code: "", included: true, credits: String(credits), grade: String(grade), score: String(grade), ...rest });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test("数字输入：空白不当成零，拒绝负数、无穷和非十进制", () => {
  for (const input of ["", " ", "-1", "Infinity", "0xff", "1e3", "abc"]) assert.equal(readNumber(input, 0, 100), null);
  assert.equal(readNumber("0", 0, 100), 0);
  assert.equal(readNumber(".5", 0, 100), .5);
  assert.equal(readNumber(" 100 ", 0, 100), 100);
  assert.equal(readNumber("100.01", 0, 100), null);
});

test("学分加权而非算术平均，零绩点仍计入分母", () => {
  const result = calculateGpa([course(4, 3.7), course(2, 3.3), course(1, 0)], "points", 4, []);
  close(result.gpa, 21.4 / 7);
  assert.equal(result.credits, 7);
  assert.equal(result.count, 3);
});

test("P/N/EX 及手动取消课程不参与分子和分母", () => {
  const result = calculateGpa([course(2, 4), course(3, "p"), course(3, "N"), course("", "EX"), course(5, 1, { included: false })], "points", 4, []);
  assert.equal(result.gpa, 4);
  assert.equal(result.credits, 2);
  assert.equal(result.incompleteCount, 0);
});

test("重修按非空编号取最高：同名不同编号和空编号不能误合并", () => {
  const result = calculateGpa([course(3, 1, { code: "A" }), course(3, 4, { code: "A" }), course(2, 2, { code: "B" }), course(1, 0), course(1, 3)], "points", 4, []);
  assert.equal(result.rows[0].status, "retake");
  assert.equal(result.count, 4);
  close(result.gpa, 19 / 7);
});

test("重复的最高成绩只计一次，不同学分的同编号记录要求核对", () => {
  const equal = calculateGpa([course(3, 4, { code: "A" }), course(3, 4, { code: "A" })], "points", 4, []);
  assert.equal(equal.credits, 3);
  const mismatch = calculateGpa([course(3, 3, { code: "A" }), course(4, 4, { code: "A" })], "points", 4, []);
  assert.equal(mismatch.invalidCount, 2);
  assert.equal(mismatch.gpa, null);
});

test("无效、零学分与未填成绩不混入结果", () => {
  const result = calculateGpa([course(0, 4), course(2, 4.1), course(2, ""), course(2, 3)], "points", 4, []);
  assert.equal(result.invalidCount, 2);
  assert.equal(result.incompleteCount, 1);
  assert.equal(result.gpa, 3);
});

test("自定义分段按阈值匹配，绩点/百分制输入相互独立", () => {
  const inputs = [course(1, 2, { score: "59.99" }), course(1, 2, { score: "60" }), course(1, 2, { score: "89.99" }), course(1, 2, { score: "90" }), course(1, 2, { score: "100" })];
  assert.deepEqual(calculateGpa(inputs, "percent", 4, bands).rows.map((row) => row.points), [0, 1, 3.7, 4, 4]);
  assert.equal(calculateGpa(inputs, "points", 4, bands).gpa, 2);
});

test("无起始档、重复阈值、逆序绩点和超范围规则均拒绝", () => {
  for (const raw of ["", "60=1", "0=0\n60=1\n60=2", "0=2\n60=1", "0=0\n90=5", "0=0\n101=4", "0:0"]) assert.ok(parseBands(raw, 4).error, raw);
  assert.equal(parseBands("90=4\n0=0\n60=1", 4).error, "");
});

test("累计目标正确反推，并区分可达、不可达和已满足", () => {
  close(calculateGpaTarget(60, 60 * 3.2, 20, 3.3, 4).required, 3.6);
  assert.equal(calculateGpaTarget(60, 60 * 3.2, 20, 3.5, 4).status, "impossible");
  assert.equal(calculateGpaTarget(60, 60 * 4, 20, 2, 4).status, "secured");
  assert.equal(calculateGpaTarget(0, 0, 10, 4, 4).status, "possible");
  assert.equal(calculateGpaTarget(60, 192, 0, 3, 4), null);
});

test("期末目标与 0% / 100% 权重边界", () => {
  close(calculateExamTarget(80, 60, 90).required, 96.66666666666667);
  assert.equal(calculateExamTarget(80, 60, 95).status, "impossible");
  assert.equal(calculateExamTarget(80, 0, 80).required, null);
  assert.equal(calculateExamTarget(80, 0, 81).status, "impossible");
  assert.equal(calculateExamTarget(80, 100, 90).required, 90);
  assert.equal(calculateExamTarget(101, 60, 80), null);
});

test("目标成绩向上取整，不低估门槛", () => {
  assert.equal(ceilTarget(96.66666666666667, 2), "96.67");
  assert.equal(ceilTarget(96.66666666666667, 0), "97");
  assert.equal(ceilTarget(3.6000000000000005, 3), "3.600");
  assert.equal(formatGpa(1.005), "1.01");
  assert.equal(formatGpa(3.565), "3.57");
});

test("缓存恢复保留输入；损坏、未知版本、重复 ID 和无效字段安全降级", () => {
  const state = defaultGpaState();
  assert.deepEqual(restoreGpaState(JSON.stringify(state)), state);
  for (const raw of ["broken", "null", JSON.stringify({ ...state, version: 2 }), JSON.stringify({ ...state, scale: 4 }), JSON.stringify({ ...state, courses: [state.courses[0], state.courses[0]] })]) assert.equal(restoreGpaState(raw), null);
});
