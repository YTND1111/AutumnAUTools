// 临时样式探针（不属于仓库产物）：测量带边框元素的内边距 + 截图
// 用法: node .tmp-shots/probe.cjs <origin> <path> <outPrefix> [w] [h]
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const origin = process.argv[2] || 'http://127.0.0.1:5199';
const pagePath = process.argv[3] || '/';
const prefix = process.argv[4] || 'probe';
const width = Number(process.argv[5] || 1440);
const height = Number(process.argv[6] || 1000);
const port = 9700 + Math.floor(Math.random() * 90);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autumn-probe-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(tmpDir, 'p'),
    '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let id = 0;
function mk(ws) {
    return (method, params) => new Promise((resolve, reject) => {
        const i = ++id;
        const handler = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === i) { ws.removeEventListener('message', handler); msg.error ? reject(new Error(method + ': ' + msg.error.message)) : resolve(msg.result); }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
}

const PROBE = `(function(){
  const out = [];
  const nodes = Array.from(document.querySelectorAll('div,span,p,a,button,li,input,section'));
  function textRect(el) {
    // 该元素（含后代的直接文本）的文本包围盒
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let rect = null;
    let txt = '';
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(t);
      const rs = Array.from(rg.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5);
      for (const rr of rs) {
        txt += t.textContent.trim();
        rect = rect ? { top: Math.min(rect.top, rr.top), bottom: Math.max(rect.bottom, rr.bottom), left: Math.min(rect.left, rr.left), right: Math.max(rect.right, rr.right) } : { top: rr.top, bottom: rr.bottom, left: rr.left, right: rr.right };
      }
    }
    return rect ? { rect, txt: txt.slice(0, 16) } : null;
  }
  for (const el of nodes) {
    const cs = getComputedStyle(el);
    const bw = { t: parseFloat(cs.borderTopWidth)||0, r: parseFloat(cs.borderRightWidth)||0, b: parseFloat(cs.borderBottomWidth)||0, l: parseFloat(cs.borderLeftWidth)||0 };
    if (cs.borderTopStyle === 'none' || (bw.t + bw.r + bw.b + bw.l) <= 0) continue;
    if (el.closest('.ad-popup') || el.closest('.announcement-bar')) continue;
    const tr = textRect(el);
    if (!tr) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // 文本盒到该元素自身边框内沿的距离（含 padding）
    const gapTop = tr.rect.top - (r.top + bw.t);
    const gapBot = (r.bottom - bw.b) - tr.rect.bottom;
    const gapLeft = tr.rect.left - (r.left + bw.l);
    const gapRight = (r.right - bw.r) - tr.rect.right;
    const cls = (el.className && typeof el.className === 'string') ? el.className : '';
    out.push({
      tag: el.tagName.toLowerCase(), cls: cls.slice(0, 40), id: el.id || '', text: tr.txt,
      pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(v => parseFloat(v)||0).join('/'),
      bd: [bw.t, bw.r, bw.b, bw.l].join('/'),
      h: Math.round(r.height),
      gT: Math.round(gapTop), gB: Math.round(gapBot), gL: Math.round(gapLeft), gR: Math.round(gapRight),
      min: Math.round(Math.min(gapTop, gapBot, gapLeft, gapRight)),
      sh: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 52)
    });
  }
  out.sort((a, b) => a.min - b.min);
  return out;
})()`;

async function main() {
    for (let i = 0; i < 80; i += 1) {
        try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (e) { await sleep(250); }
    }
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    const cdp = mk(ws);
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: origin + pagePath });
    await sleep(2500);
    const info = await cdp('Runtime.evaluate', { expression: `document.title + ' | root=' + !!document.getElementById('root') + ' | rootChildren=' + (document.getElementById('root') ? document.getElementById('root').children.length : -1) + ' | htmlLen=' + document.documentElement.innerHTML.length + ' | url=' + location.href`, returnByValue: true });
    console.log('[页面状态]', info.result.value);
    const res = await cdp('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400));
    const rows = res.result.value || [];
    console.log('=== 元素（按最小边距升序） ===');
    for (const r of rows.slice(0, 46)) {
        console.log(`${String(r.tag).padEnd(6)} ${(r.id ? '#' + r.id + ' ' : '')}.${r.cls}`.padEnd(52)
            + ` | 「${r.text}」 h=${r.h} pad=${r.pad} bd=${r.bd}`
            + ` 距边框 上${r.gT}/下${r.gB}/左${r.gL}/右${r.gR}`
            + (r.sh ? ` sh=${r.sh}` : ''));
    }
    console.log('总带边框含文本元素数:', rows.length);
    const dims = await cdp('Runtime.evaluate', { expression: `JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`, returnByValue: true });
    const d = JSON.parse(dims.result.value);
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: Math.max(height, d.h), deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.max(width, d.w), height: d.h, scale: 1 } });
    const out = path.resolve(`${prefix}.png`);
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('saved', out);
    ws.close();
    edge.kill();
    await sleep(300);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
main().catch((e) => { console.error('探针失败:', e.message); edge.kill(); process.exit(1); });
