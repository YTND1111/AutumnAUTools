/* Headless smoke + interaction test for the offline site. */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:8765/";
const OUT = path.resolve(__dirname, "..", "..", "tmp", "test-export.docx");
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
  const message = String(error && error.message ? error.message : error);
  if (!/scrollTo/i.test(message)) errors.push(message);
});
virtualConsole.on("error", (...args) => errors.push(args.join(" ")));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dom = await JSDOM.fromURL(BASE, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  await wait(150);
  const document = window.document;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const results = [];
  const check = (name, condition, detail) => {
    results.push({ name, ok: Boolean(condition), detail });
    if (!condition) console.error("FAIL:", name, detail || "");
  };

  check("vocabulary loaded", window.CET6_WORDS && window.CET6_WORDS.length === 6405, window.CET6_WORDS && window.CET6_WORDS.length);
  check("hero count", $("#heroWordCount").textContent.trim() === "6,405", $("#heroWordCount").textContent);
  check("four options", $$(".option").length === 4, $$(".option").length);
  check("word visible", $("#wordText").textContent.trim().length > 1, $("#wordText").textContent);
  check("pos visible", $("#posText").textContent.trim().length > 0, $("#posText").textContent);
  check("example visible", $("#exampleEn").textContent.trim().length > 0, $("#exampleEn").textContent);
  check("defaults to core mode", $("#quizMode").textContent.trim() === "六级核心", $("#quizMode").textContent);
  check("example label", ["EXAMPLE", "PHRASE", "英文释义"].includes($("#exampleLabel").textContent.trim()), $("#exampleLabel").textContent);

  $("#quizMode").click();
  await wait(40);
  check("switches to all words", $("#quizMode").textContent.trim() === "全部词库", $("#quizMode").textContent);
  $("#quizMode").click();
  await wait(40);
  check("switches back to core", $("#quizMode").textContent.trim() === "六级核心", $("#quizMode").textContent);

  const optionMeanings = $$(".option-meaning").map((node) => node.textContent.trim());
  check("unique option meanings", new Set(optionMeanings).size === 4, optionMeanings.join(" | "));
  check("option words hidden initially", $$(".option-word").every((node) => window.getComputedStyle(node).display === "none"));

  // Answer deliberately with a wrong option, then inspect the reveal.
  const correctIndex = Number($("#options .option")?.dataset.option || -1);
  const targetWord = $("#wordText").textContent.trim();
  const targetMeaning = window.CET6_WORDS.find((word) => word.word === targetWord)?.brief;
  const wrong = $$(".option").find((button) => button.querySelector(".option-meaning").textContent.trim() !== targetMeaning);
  check("found wrong option", Boolean(wrong), optionMeanings.join(" | "));
  wrong.click();
  await wait(80);
  check("all option words revealed", $$(".option-word").every((node) => window.getComputedStyle(node).display !== "none"));
  check("answer panel shown", !$("#answerPanel").hidden);
  check("wrong choice word shown", $("#answerPanel").textContent.includes(wrong.querySelector(".option-word").textContent.trim().split(" · ")[0]));
  check("word auto-marked", $("#markBtn").getAttribute("aria-pressed") === "true");
  check("nav count 1", $("#navCount").textContent.trim() === "1", $("#navCount").textContent);

  // Next question works and the mark survives.
  $("#nextBtn").click();
  await wait(60);
  check("next question has four options", $$(".option").length === 4);
  check("question number advanced", Number($("#questionNo").textContent.trim()) > 1, $("#questionNo").textContent);

  // Open the unfamiliar-word library.
  $('[data-view-link="library"]').click();
  await wait(60);
  check("library view active", !$("#view-library").hidden);
  check("library has one card", $$(".word-card").length === 1, $$(".word-card").length);
  check("library count", $("#libraryCount").textContent.trim() === "1", $("#libraryCount").textContent);
  check("library card shows pos", $(".word-card .pos-tag").textContent.trim().length > 0);
  check("library card shows meaning", $(".word-card .card-meaning").textContent.trim().length > 0);

  // Build a real .docx through the same code path used by the export button.
  const sample = window.CET6_WORDS.slice(0, 4).map((word, index) => Object.assign({}, word, { markedAt: Date.now() - index * 1000 }));
  const bytes = window.CET6WordExport.buildDocxBytes(sample);
  fs.writeFileSync(OUT, Buffer.from(bytes));
  check("docx written", fs.statSync(OUT).size > 5000, fs.statSync(OUT).size);

  // Search and clear.
  $("#searchInput").value = "zzzzzz-no-such-word";
  $("#searchInput").dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(30);
  check("empty search state", !$("#emptyState").hidden);
  $("#emptyCta").click();
  await wait(30);
  check("reset search", $("#searchInput").value === "");

  // Browse 40 random questions and validate option uniqueness.
  $('[data-view-link="quiz"]').click();
  await wait(30);
  for (let round = 0; round < 40; round += 1) {
    const meanings = $$(".option-meaning").map((node) => node.textContent.trim());
    if (new Set(meanings).size !== 4) {
      check("unique options round " + round, false, meanings.join(" | "));
      break;
    }
    $('[data-option="0"]').click();
    await wait(5);
    $("#nextBtn").click();
    await wait(5);
  }
  check("40 random rounds", true);

  console.log(JSON.stringify({ passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, errors, results: results.filter((item) => !item.ok) }, null, 2));
  dom.window.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
