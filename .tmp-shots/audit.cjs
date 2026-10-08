// 临时检查（不属于仓库产物）：全量扫描“文字到所属边框”的最小距离，找零距离元素
// 用法: node .tmp-shots/audit.cjs <origin> <path...>
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const origin = process.argv[2];
const paths = process.argv.slice(3);
const port = 9860;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autumn-audit-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(tmpDir, 'p'),
    '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
const mk = (ws) => (method, params) => new Promise((resolve, reject) => {
    const i = ++id;
    const h = (e) => { const m = JSON.parse(e.data); if (m.id === i) { ws.removeEventListener('message', h); m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
});

const AUDIT = `(function(){
  const hits = [];
  const nodes = Array.from(document.querySelectorAll('*'));
  for (const el of nodes) {
    const cs = getComputedStyle(el);
    const bw = [parseFloat(cs.borderTopWidth)||0, parseFloat(cs.borderRightWidth)||0, parseFloat(cs.borderBottomWidth)||0, parseFloat(cs.borderLeftWidth)||0];
    if (cs.borderTopStyle === 'none' || bw[0]+bw[1]+bw[2]+bw[3] <= 0) continue;
    if (['HTML','BODY'].includes(el.tagName)) continue;
    // 仅自身（不含后代边框元素）的直接文本
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let rect = null, txt = '';
    let stop = false;
    while (!stop && walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      for (const rr of Array.from(rg.getClientRects())) {
        if (rr.width < 0.5 || rr.height < 0.5) continue;
        txt += t.textContent.trim();
        rect = rect ? { top: Math.min(rect.top, rr.top), bottom: Math.max(rect.bottom, rr.bottom), left: Math.min(rect.left, rr.left), right: Math.max(rect.right, rr.right) } : { top: rr.top, bottom: rr.bottom, left: rr.left, right: rr.right };
      }
    }
    if (!rect) continue;
    const r = el.getBoundingClientRect();
    const gaps = [rect.top - (r.top + bw[0]), (r.bottom - bw[2]) - rect.bottom, rect.left - (r.left + bw[3]), (r.right - bw[1]) - rect.right];
    const min = Math.min(...gaps);
    if (min <= 2.5) {
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 40);
      hits.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.split(' ').join('.') : ''), txt: txt.slice(0, 18), gaps: gaps.map(v => Math.round(v)), h: Math.round(r.height) });
    }
  }
  return hits;
})()`;

async function main() {
    for (let i = 0; i < 80; i += 1) { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (e) { await sleep(250); } }
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    const cdp = mk(ws);
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const p of paths) {
        await cdp('Page.navigate', { url: origin + p });
        await sleep(2300);
        const res = await cdp('Runtime.evaluate', { expression: AUDIT, returnByValue: true });
        if (res.exceptionDetails) { console.log(p, '异常', JSON.stringify(res.exceptionDetails).slice(0, 200)); continue; }
        const hits = res.result.value || [];
        console.log(`\n### ${p} —— 零/极小间距（<=2.5px）元素：${hits.length}`);
        for (const h of hits) console.log(`   ${h.sel}  「${h.txt}」 上${h.gaps[0]}/下${h.gaps[1]}/左${h.gaps[2]}/右${h.gaps[3]} h=${h.h}`);
    }
    ws.close(); edge.kill(); await sleep(300);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
main().catch((e) => { console.error('审计失败:', e.message); edge.kill(); process.exit(1); });
