// Records a 22s vertical promo of the real game by driving it with scripted input.
// Usage: node record.js [dev-server-url]
const { chromium } = require('playwright-core');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

const URL = process.argv[2] || 'http://localhost:5199';
const OUT = path.join(__dirname, 'out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const KEY = 'merge-rush.save.v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function save(rows, o = {}) {
  const board = rows.flat();
  const tiles = [];
  board.forEach((value, i) => {
    if (value) tiles.push({ id: tiles.length + 1, value, row: Math.floor(i / 4), col: i % 4 });
  });
  return JSON.stringify({
    version: 1,
    game: {
      board, tiles, score: o.score ?? 0, streak: o.streak ?? 0,
      rush: { active: false, remaining: 0 }, rngState: o.seed ?? 11, pendingValue: 2,
      nextTileId: tiles.length + 1, gameOver: false, canUndo: true, undoSnapshot: null,
      celebratedRecord: false,
      powers: { charges: o.charges ?? { bomb: 1, upgrade: 1, shuffle: 1, sweep: 0 }, energy: o.energy ?? 14, earned: 1 },
      rescuesUsed: 0, powerBonus: 0, lastChance: false, reviveUsed: false,
    },
    stats: { best: o.best ?? 24310, highestTile: 1024, gamesPlayed: 12 },
    prefs: { soundOn: true },
  });
}

const SCENES = {
  merge: save([[2, 2, 4, 8], [4, 4, 8, 16], [8, 16, 16, 32], [32, 64, 64, 128]], { score: 2310 }),
  stuck: save([[2, 4, 8, 4], [4, 16, 2, 8], [8, 2, 32, 2], [2, 64, 4, 128]], { score: 18420, charges: { bomb: 2, upgrade: 1, shuffle: 1, sweep: 1 }, energy: 31 }),
  big: save([[1024, 1024, 4, 2], [8, 16, 32, 4], [2, 4, 8, 16], [4, 8, 2, 4]], { score: 61280, best: 61280 }),
};

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Screencast frames from Chrome (no Playwright ffmpeg download needed).
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(OUT, 'frames', String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });

  // Stage a save before the app boots; hide the page until we fade it in.
  await page.addInitScript(({ KEY }) => {
    // Tap everything the game sends to the speakers so it can be mixed into the video.
    (() => {
      const orig = AudioNode.prototype.connect;
      window.__audio = { chunks: [], start: 0, rec: null, tap: null };
      AudioNode.prototype.connect = function (dest, ...a) {
        if (dest instanceof AudioDestinationNode) {
          const A = window.__audio;
          if (!A.tap) {
            A.tap = this.context.createMediaStreamDestination();
            A.rec = new MediaRecorder(A.tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
            A.rec.ondataavailable = (e) => A.chunks.push(e.data);
            A.start = Date.now();
            A.rec.start(200);
          }
          orig.call(this, A.tap);
        }
        return orig.call(this, dest, ...a);
      };
    })();
    if (window.name.startsWith('{')) localStorage.setItem(KEY, window.name);
    const s = document.createElement('style');
    s.textContent = 'html{background:#070a1f}#root{transform:scale(.84);transform-origin:50% 100%}body{opacity:0;transition:opacity 350ms}body.show{opacity:1}' +
      '.cap{position:fixed;left:0;right:0;top:2.5%;z-index:99;text-align:center;font:900 46px/1.12 "Segoe UI",system-ui,sans-serif;font-style:italic;' +
      'color:#fff;text-shadow:0 4px 0 rgba(40,10,90,.7),0 0 28px rgba(139,92,246,.9);padding:0 24px;pointer-events:none;' +
      'opacity:0;transform:scale(.8);transition:opacity 250ms,transform 350ms cubic-bezier(.3,1.6,.5,1)}' +
      '.cap.on{opacity:1;transform:scale(1)}.cap b{color:#ffd34d}' +
      '.endcard{position:fixed;inset:0;z-index:100;display:grid;place-content:center;gap:18px;text-align:center;opacity:0;transition:opacity 500ms;pointer-events:none;' +
      'background:radial-gradient(500px 420px at 50% 35%,rgba(124,58,237,.8),transparent 70%),radial-gradient(500px 500px at 90% 100%,rgba(6,182,212,.5),transparent 70%),#070a1f;font-family:"Segoe UI",system-ui,sans-serif;color:#fff}' +
      '.endcard.on{opacity:1}.endcard h1{margin:0;font:900 84px/1 "Segoe UI",system-ui;font-style:italic;background:linear-gradient(100deg,#c4b5fd,#fff 35%,#67e8f9 65%,#ff9ecf);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 4px 22px rgba(139,92,246,.7));padding-right:10px}' +
      '.endcard p{margin:0;font-size:30px;font-weight:800;letter-spacing:.06em}.endcard .pill{margin:14px auto 0;padding:16px 34px;border-radius:999px;background:linear-gradient(135deg,#9d6bff,#6d3fe6 50%,#3fb8ff);font-size:30px;font-weight:900;box-shadow:0 12px 40px rgba(109,63,230,.6)}';
    document.addEventListener('DOMContentLoaded', () => {
      document.head.appendChild(s);
      const cap = document.createElement('div'); cap.className = 'cap'; cap.id = 'cap'; document.body.appendChild(cap);
      const end = document.createElement('div'); end.className = 'endcard'; end.id = 'end';
      end.innerHTML = '<h1>Merge Rush</h1><p>MERGE · CHAIN · <span style="color:#ffc53d">RUSH</span></p><div class="pill">▶ Free on Google Play</div>';
      document.body.appendChild(end);
    });
  }, { KEY });

  const clips = [];
  fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
  async function flushAudio() {
    const r = await page.evaluate(async () => {
      const A = window.__audio;
      if (!A || !A.rec) return null;
      await new Promise((res) => { A.rec.onstop = res; A.rec.stop(); });
      const blob = new Blob(A.chunks);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      return { start: A.start, b64: btoa(bin) };
    }).catch(() => null);
    if (!r) return;
    const file = path.join(OUT, 'audio', clips.length + '.webm');
    fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
    clips.push({ file, start: r.start });
  }

  async function scene(name) {
    await flushAudio();
    await page.evaluate((s) => { window.name = s; }, SCENES[name]);
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate((s) => { window.name = s; }, SCENES[name]);
    await page.reload({ waitUntil: 'load' });
    await sleep(500);
    await page.evaluate(() => document.body.classList.add('show'));
    await sleep(450);
  }
  const caption = (html) => page.evaluate((h) => { const c = document.getElementById('cap'); c.classList.remove('on'); setTimeout(() => { c.innerHTML = h; c.classList.add('on'); }, 120); }, html);
  const hideCaption = () => page.evaluate(() => document.getElementById('cap').classList.remove('on'));
  const key = async (k, wait = 700) => { await page.keyboard.press(k); await sleep(wait); };

  // ---- Shot 1+2: hook, merges, Rush Mode (0-8s)
  await scene('merge');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await caption('Can you reach <b>2048</b>?');
  await sleep(1400);
  await key('ArrowLeft', 750);
  await caption('Chain 3 merges → <b>RUSH MODE</b>');
  await key('ArrowLeft', 750);
  await key('ArrowLeft', 1500); // third merge -> Rush banner
  await key('ArrowDown', 800);
  await key('ArrowRight', 800);
  await key('ArrowLeft', 900);
  await hideCaption();
  await sleep(300);

  // ---- Shot 3: stuck -> Bomb (8-14s)
  await scene('stuck');
  await caption('Stuck? Blow your way out 💣');
  await sleep(1300);
  await page.keyboard.press('1');
  await sleep(900);
  const target = await page.$$('.tile--pickable');
  const box = await target[5].boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await sleep(500);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(1700);
  await hideCaption();
  await sleep(200);

  // ---- Shot 4: 2048 (14-19s)
  await scene('big');
  await caption('<b>2048</b>… and beyond');
  await sleep(1200);
  await key('ArrowLeft', 2400);
  await sleep(600);

  // ---- End card (19-22s)
  await hideCaption();
  await page.evaluate(() => document.getElementById('end').classList.add('on'));
  await sleep(3000);

  await flushAudio();
  await cdp.send('Page.stopScreencast');
  await page.close();
  await ctx.close();
  await browser.close();

  // Constant-30fps timeline from the variable-rate frames.
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - frames[i].t) : 0.2;
    list.push(`file '${frames[i].file.split(String.fromCharCode(92)).join('/')}'`, `duration ${dur.toFixed(4)}`);
  }
  list.push(`file '${frames[frames.length - 1].file.split(String.fromCharCode(92)).join('/')}'`);
  const listFile = path.join(OUT, 'frames.txt');
  fs.writeFileSync(listFile, list.join(String.fromCharCode(10)));
  const output = path.join(OUT, 'merge-rush-silent.mp4');
  const r = spawnSync(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'scale=1080:1920:flags=lanczos,fps=30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    output,
  ], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr.slice(-1500)); process.exit(1); }
  const t0 = frames[0].t * 1000;
  const total = frames[frames.length - 1].t - frames[0].t;
  const ins = clips.flatMap((c) => ['-i', c.file]);
  const delays = clips.map((c, i) => '[' + (i + 1) + ':a]adelay=' + Math.max(0, Math.round(c.start - t0)) + ':all=1[a' + i + ']');
  const mix = delays.join(';') + ';' + clips.map((_, i) => '[a' + i + ']').join('') + 'amix=inputs=' + clips.length + ':normalize=0,alimiter=limit=0.95,afade=t=out:st=' + (total - 0.8).toFixed(2) + ':d=0.8[a]';
  const final = path.join(OUT, 'merge-rush-promo.mp4');
  const m = spawnSync(ffmpeg, ['-y', '-i', output, ...ins, '-filter_complex', mix, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(2), final], { encoding: 'utf8' });
  if (m.status !== 0) { console.error(m.stderr.slice(-1500)); process.exit(1); }
  console.log('frames', frames.length, 'clips', clips.length, 'done', final);
})();
