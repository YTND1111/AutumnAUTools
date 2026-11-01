/* Visual + responsive verification through the Edge DevTools Protocol. */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DEBUG_HOST = "http://127.0.0.1:9223";
const SITE = "http://127.0.0.1:8765/";
const OUT = path.resolve(__dirname, "..", "..", "tmp");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const targets = await (await fetch(DEBUG_HOST + "/json/list")).json();
  const page = targets.find((target) => target.type === "page" && target.url.startsWith(SITE)) ||
    targets.find((target) => target.type === "page" && !/^(edge|devtools):/.test(target.url));
  if (!page) throw new Error("No debuggable page");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  const errors = [];

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
      return;
    }
    const handlers = listeners.get(message.method) || [];
    handlers.forEach((handler) => handler(message.params));
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const handler = (params) => {
        cleanup();
        resolve(params);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for " + method));
      }, timeout);
      const cleanup = () => {
        clearTimeout(timer);
        const handlers = (listeners.get(method) || []).filter((item) => item !== handler);
        listeners.set(method, handlers);
      };
      listeners.set(method, (listeners.get(method) || []).concat(handler));
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Evaluation failed");
    }
    return result.result.value;
  }

  async function screenshot(name) {
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, "base64"));
  }

  async function setViewport(width, height, mobile) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async function navigate(url) {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url });
    await loaded;
    await sleep(700);
  }

  await ready;
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Runtime.enable");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Runtime.addBinding", { name: "__cdpReport" }).catch(() => {});
  listeners.set("Runtime.exceptionThrown", [(params) => {
    errors.push(params.exceptionDetails.text + " " + (params.exceptionDetails.exception?.description || ""));
  }]);
  listeners.set("Runtime.consoleAPICalled", [(params) => {
    if (params.type === "error") {
      errors.push(params.args.map((arg) => arg.value || arg.description || "").join(" "));
    }
  }]);

  const report = { mobile: {}, desktop: {}, errors };

  /* ---------- mobile ---------- */
  await setViewport(390, 844, true);
  await navigate(SITE);
  report.mobile.before = await evaluate(`(() => {
    const all = Array.from(document.querySelectorAll("body *")).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 50), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    });
    return {
      innerWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bad: all.filter((item) => item.right > innerWidth + 1 || item.left < -1).slice(0, 25),
      options: document.querySelectorAll(".option").length,
      mode: document.getElementById("quizMode").textContent.trim(),
      word: document.getElementById("wordText").textContent.trim(),
      exampleType: document.getElementById("exampleLabel").textContent.trim(),
      caption: document.querySelector(".stage-caption").textContent.replace(/\\s+/g, " ").trim(),
      captionIndex: document.getElementById("captionIndex").textContent,
      captionColor: getComputedStyle(document.getElementById("captionIndex")).color,
    };
  })()`);
  await screenshot("mobile-before.png");

  report.mobile.answer = await evaluate(`(() => {
    const word = document.getElementById("wordText").textContent.trim();
    const entry = window.CET6_WORDS.find((item) => item.word === word);
    const correct = entry.brief;
    const wrong = Array.from(document.querySelectorAll(".option")).find((button) => {
      return button.querySelector(".option-meaning").textContent.trim() !== correct;
    });
    if (wrong) wrong.click();
    return {
      word,
      correct,
      wrongWord: wrong ? wrong.querySelector(".option-meaning").textContent.trim() : null,
      optionWords: Array.from(document.querySelectorAll(".option-word")).map((el) => el.textContent.trim()),
      marked: document.getElementById("markBtn").getAttribute("aria-pressed"),
      answerPanel: !document.getElementById("answerPanel").hidden,
    };
  })()`);
  await sleep(350);
  await screenshot("mobile-answer.png");

  await evaluate(`document.querySelector('[data-view-link="library"]').click()`);
  await sleep(400);
  report.mobile.library = await evaluate(`(() => ({
    cards: document.querySelectorAll(".word-card").length,
    count: document.getElementById("libraryCount").textContent.trim(),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: innerWidth,
    bad: Array.from(document.querySelectorAll("body *")).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 50), right: Math.round(r.right), left: Math.round(r.left) };
    }).filter((item) => item.right > innerWidth + 1 || item.left < -1).slice(0, 25),
  }))()`);
  await screenshot("mobile-library.png");

  /* ---------- desktop ---------- */
  await setViewport(1440, 1000, false);
  await navigate(SITE);
  await evaluate(`document.querySelector('[data-view-link="library"]').click()`);
  await sleep(300);
  await screenshot("desktop-library.png");
  report.desktop.library = await evaluate(`(() => ({
    cards: document.querySelectorAll(".word-card").length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: innerWidth,
  }))()`);

  /* ---------- direct file:// launch (double-click experience) ---------- */
  const fileUrl = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;
  await setViewport(1440, 1000, false);
  await navigate(fileUrl);
  report.file = await evaluate(`(() => {
    const before = document.querySelectorAll(".option").length;
    const word = document.getElementById("wordText").textContent.trim();
    const entry = window.CET6_WORDS.find((item) => item.word === word);
    const wrong = Array.from(document.querySelectorAll(".option")).find((button) => {
      return button.querySelector(".option-meaning").textContent.trim() !== entry.brief;
    });
    if (wrong) wrong.click();
    let stored = null;
    try { stored = localStorage.getItem("cixi-cet6-state-v1"); } catch (error) { stored = "ERR:" + error.message; }
    return {
      options: before,
      mode: document.getElementById("quizMode").textContent.trim(),
      marked: document.getElementById("markBtn").getAttribute("aria-pressed"),
      count: document.getElementById("navCount").textContent.trim(),
      localStorage: stored ? stored.slice(0, 80) : stored,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: innerWidth,
    };
  })()`);
  await screenshot("file-desktop-answer.png");

  /* ---------- real click-through Word download ---------- */
  const downloadDir = path.join(OUT, "downloads-" + Date.now());
  fs.mkdirSync(downloadDir, { recursive: true });
  await navigate(SITE);
  await evaluate(`document.getElementById("markBtn").click()`);
  await evaluate(`document.querySelector('[data-view-link="library"]').click()`);
  await sleep(250);
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  await evaluate(`document.getElementById("exportBtn").click()`);
  await sleep(1600);
  const downloads = fs.readdirSync(downloadDir);
  report.export = {
    files: downloads,
    sizes: downloads.map((name) => fs.statSync(path.join(downloadDir, name)).size),
  };

  console.log(JSON.stringify(report, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
