// Screenshots web pages into raw-shots/<name>.png at 1440x900 using your
// installed Chrome (or Edge). It waits in real time, so sites with loaders work.
//
//   npm run shoot -- moonshot=https://example.com  other=https://example.org
//   npm run shoot -- --wait=12000 slowsite=https://example.net
//   npm run shoot -- --mobile name=https://example.com   (phone-sized)
//   npm run mocks      (screenshots the 12 demo sites in scripts/mock-sites)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'raw-shots');
fs.mkdirSync(outDir, { recursive: true });

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) throw new Error('No Chrome or Edge found. Set CHROME_PATH to your browser.');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(name, url, wait) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shoot-'));
  const proc = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank',
  ]);
  try {
    let tabs;
    for (let i = 0; i < 60 && !tabs; i++) {
      try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
    }
    const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = {};
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; }
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Emulation.setDeviceMetricsOverride', MOBILE
      ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
      : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    if (MOBILE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url });
    await sleep(wait);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
    ws.close();
    console.log(`raw-shots/${name}.png  <-  ${url}`);
  } finally {
    proc.kill();
  }
}

const args = process.argv.slice(2);
const MOBILE = args.includes('--mobile'); // phone-sized capture (390x844 @2x)
let wait = Number((args.find((a) => a.startsWith('--wait=')) || '--wait=8000').slice(7));
let jobs = args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => {
  const i = a.indexOf('=');
  return [a.slice(0, i), a.slice(i + 1)];
});

let server;
if (args.includes('--mocks')) {
  // serve the mock sites locally and shoot every one
  const { createServer } = await import('node:http');
  const html = fs.readFileSync(path.join(root, 'scripts', 'mock-sites', 'index.html'));
  server = createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); }).listen(0);
  const port = server.address().port;
  const ids = [...html.toString().matchAll(/^\s{2}\/\* \d+\. [^*]+\*\/\s*\n\s{2}(\w+): \(\)/gm)].map((m) => m[1]);
  jobs = ids.map((n) => [n, `http://127.0.0.1:${port}/?site=${n}`]);
  wait = Math.min(wait, 3500);
}
if (!jobs.length) {
  console.log('Usage: npm run shoot -- name=https://url [name2=https://url2] [--wait=ms]');
  process.exit(1);
}

// three at a time
for (let i = 0; i < jobs.length; i += 3) {
  await Promise.all(jobs.slice(i, i + 3).map(([n, u]) => shoot(n, u, wait).catch((e) => console.error(`${n}: ${e.message}`))));
}
server?.close();
