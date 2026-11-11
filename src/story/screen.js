/* The ultrawide on my desk, drawn on a canvas: a lock screen (the car as wallpaper, the visitor's own local time),
   then one window per beat of the story: the legal assistant answering from its documents, the editor where
   chub-guard flags an outdated API call, an agent driving a browser, and the log window where the anomaly pipeline
   catches an attack. Illustrative (made-up documents, brands and logs) — the real projects are in the cards. */
import * as THREE from 'three';

const W = 1600, H = 672;   // ~21:9
const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const g = canvas.getContext('2d');
export const screenTex = new THREE.CanvasTexture(canvas);
screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 8;

const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';
const SANS = '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif';
// the wallpaper is painted once (per dimming level) into its own canvas, then just copied each redraw
let wall = null;
const walls = {};
export function setWallpaper(url) { const im = new Image(); im.onload = () => { wall = im; for (const k in walls) delete walls[k]; wallpaper(0.35); drawLock(); screenTex.needsUpdate = true; last = ''; }; im.src = url; }
function wallpaper(dim = 0) {
  if (!walls[dim]) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    if (wall) { const s = Math.max(W / wall.width, H / wall.height), iw = wall.width * s, ih = wall.height * s; x.drawImage(wall, (W - iw) * 0.62, (H - ih) * 0.55, iw, ih); }
    else { const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2b3a55'); gr.addColorStop(1, '#8a3a2a'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    if (dim) { x.fillStyle = `rgba(6,8,12,${dim})`; x.fillRect(0, 0, W, H); }
    if (wall) walls[dim] = c; else { g.drawImage(c, 0, 0); return; }
  }
  g.drawImage(walls[dim], 0, 0);
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- lock screen ---------- */
const S = W / 2048;
function drawLock() {
  wallpaper(0.08);
  g.save(); g.scale(S, S);
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]m/i, '');
  const W = 2048, H = 860;
  g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.92)';
  g.font = `600 44px ${SANS}`; g.fillText(date, W / 2, 190);
  g.font = `300 200px ${SANS}`; g.fillText(time, W / 2, 380);
  // avatar
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(W / 2, H - 170, 44, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9a6e8'; g.beginPath(); g.arc(W / 2, H - 170, 40, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1d16'; g.beginPath(); g.arc(W / 2, H - 182, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2d2b8'; g.beginPath(); g.arc(W / 2, H - 176, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.95)'; g.font = `600 28px ${SANS}`; g.fillText('Rhea L', W / 2, H - 92);
  g.textAlign = 'left';
  g.restore();
}

/* ---------- an app window on the desktop; content drawn in a 1024×640 design space ---------- */
function window_(title, body, t, k, tint) {
  wallpaper(0.35);
  g.save(); g.scale(S, S);
  const W = 2048, H = 860;
  const ww = 1240, wh = 760, x = (W - ww) / 2, y = (H - wh) / 2 + 10;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
  roundRect(x, y, ww, wh, 18); g.fillStyle = '#16181d'; g.fill();
  g.restore();
  g.save(); roundRect(x, y, ww, wh, 18); g.clip();
  g.fillStyle = '#22252b'; g.fillRect(x, y, ww, 50);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x + 28 + i * 24, y + 25, 8, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#9a9ca3'; g.font = `600 19px ${MONO}`; g.textAlign = 'center'; g.fillText(title, x + ww / 2, y + 32); g.textAlign = 'left';
  if (tint) { g.fillStyle = tint; g.fillRect(x, y + 50, ww, wh - 50); }
  g.translate(x, y + 50); g.scale(ww / 1024, (wh - 50) / 590);
  body(t, k);
  g.restore();
  // the Dock
  const icons = [['#1e1f24', '>_'], ['#2f6fed', '{ }'], ['#f2f2f2', '✎'], ['#34c759', '▶'], ['#ff9f0a', '♪'], ['#5e5ce6', '◐'], ['#ff375f', '♥'], ['#8e8e93', '⚙']];
  const is = 58, gap = 12, dw = icons.length * is + (icons.length + 1) * gap, dx = (W - dw) / 2, dy = H - is - 22;
  roundRect(dx, dy - gap, dw, is + gap * 2, 22); g.fillStyle = 'rgba(255,255,255,.2)'; g.fill();
  icons.forEach(([c, glyph], i) => {
    const ix = dx + gap + i * (is + gap); roundRect(ix, dy, is, is, 14); g.fillStyle = c; g.fill();
    g.fillStyle = c === '#f2f2f2' ? '#333' : '#fff'; g.font = `700 24px ${SANS}`; g.textAlign = 'center'; g.fillText(glyph, ix + is / 2, dy + is / 2 + 8);
  });
  g.fillStyle = 'rgba(255,255,255,.8)'; [0, 1].forEach(i => { g.beginPath(); g.arc(dx + gap + i * (is + gap) + is / 2, dy + is + 7, 2.5, 0, Math.PI * 2); g.fill(); });
  g.textAlign = 'left';
  // menu bar
  g.fillStyle = 'rgba(20,22,26,.55)'; g.fillRect(0, 0, W, 34);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `700 18px ${SANS}`; g.fillText('Rhea L', 24, 23);
  g.font = `500 18px ${SANS}`; g.fillStyle = 'rgba(255,255,255,.78)'; ['File', 'Edit', 'View', 'Go', 'Window', 'Help'].reduce((x, m) => { g.fillText(m, x, 23); return x + g.measureText(m).width + 26; }, 104);
  const now = new Date(); g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(now.toLocaleTimeString('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit' }), W - 24, 23); g.textAlign = 'left';
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.strokeRect(W - 190, 11, 30, 14); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(W - 187, 14, 20, 8); g.fillRect(W - 159, 15, 3, 6);
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W - 222, 26, 5 + i * 5, -Math.PI * 0.75, -Math.PI * 0.25); g.stroke(); }
  g.restore();
}

const code = [
  [['kw', 'import'], ['tx', ' openai']],
  [],
  [['kw', 'def'], ['fn', ' summarise'], ['tx', '(text):']],
  [['tx', '    resp = '], ['tx', 'openai.ChatCompletion.create(']],
  [['tx', '        model='], ['st', '"gpt-4o-mini"'], ['tx', ',']],
  [['tx', '        messages=[{'], ['st', '"role"'], ['tx', ': '], ['st', '"user"'], ['tx', ', '], ['st', '"content"'], ['tx', ': text}],']],
  [['tx', '    )']],
  [['kw', '    return'], ['tx', ' resp.choices[0].message.content']],
];
const COL = { kw: '#ff7ab2', fn: '#6bdfff', st: '#fc6a5d', tx: '#e8e8ea' };
function codeBody(t, k) {
  g.font = `500 21px ${MONO}`;
  const typed = Math.min(code.length, Math.floor(k * 3 * code.length) + 2);
  code.slice(0, typed).forEach((line, i) => {
    const y = 52 + i * 36;
    g.fillStyle = '#4b4f58'; g.fillText(String(i + 1).padStart(2, ' '), 18, y);
    let x = 62;
    for (const [c, s] of line) { g.fillStyle = COL[c]; g.fillText(s, x, y); x += g.measureText(s).width; }
  });
  if (k > 0.35) {
    const y = 52 + 3 * 36 + 8, x0 = 62 + g.measureText('    resp = ').width, x1 = x0 + g.measureText('openai.ChatCompletion.create(').width;
    g.strokeStyle = '#ffcc33'; g.lineWidth = 2.5; g.beginPath();
    for (let x = x0; x <= x1; x += 6) g.lineTo(x, y + ((x - x0) / 6 % 2 ? 4 : 0));
    g.stroke();
    g.globalAlpha = Math.min(1, (k - 0.35) * 4);
    g.fillStyle = '#2a2510'; g.strokeStyle = '#ffcc33'; g.lineWidth = 2;
    roundRect(x0 - 6, y + 16, 560, 104, 10); g.fill(); g.stroke();
    g.fillStyle = '#ffcc33'; g.font = `700 19px ${MONO}`; g.fillText('⚠ chub-guard · outdated API', x0 + 12, y + 46);
    g.fillStyle = '#efe6c8'; g.font = `500 17px ${MONO}`;
    g.fillText('ChatCompletion.create was removed in openai 1.x', x0 + 12, y + 76);
    g.fillText('→ client.chat.completions.create(...)', x0 + 12, y + 104);
    g.globalAlpha = 1;
  }
  if (Math.floor(t * 2) % 2) { g.fillStyle = '#e8e8ea'; g.fillRect(66, 52 + (typed - 1) * 36 + 6, 11, 4); }
}
/* ---------- the legal assistant: a question, the clauses it retrieved, a grounded answer ---------- */
const DOCS = ['Master Services Agreement', 'Shareholders’ Agreement', 'Non-Disclosure Agreement', 'Licence Agreement', 'Lease Deed', 'Supply Agreement', 'Employment Policy'];
const CLAUSES = [
  [0, 'cl. 14.2', 'BM25 + semantic', [['Neither party may '], ['assign', 1], [' this Agreement without the prior written '], ['consent', 1], [' of the other.']]],
  [1, 'cl. 9.1', 'semantic', [['Transfers to an '], ['Affiliate', 1], [' do not require '], ['consent', 1], [', on written notice.']]],
  [3, 'cl. 6.4', 'BM25', [['Any purported '], ['assignment', 1], [' in breach of this clause is void.']]],
];
const QUESTION = 'Can either party assign the agreement without consent?';
const ANSWER = 'No. Assignment needs the other party’s prior written consent [1], and an assignment made without it is void [3]. The exception is a transfer to an Affiliate, which needs written notice only [2].';
/** Draw text made of [string, highlighted?] parts, wrapped to maxW; returns the y of the last line. */
function rich(parts, x, y, maxW, lh, color, hi) {
  let cx = x;
  for (const [text, mark] of parts) for (const w of text.split(/(?<= )/)) {
    const ww = g.measureText(w).width;
    if (cx + ww > x + maxW && cx > x) { cx = x; y += lh; }
    if (mark) { g.fillStyle = hi; g.fillRect(cx - 2, y - lh * 0.72, g.measureText(w.trimEnd()).width + 4, lh * 0.92); }
    g.fillStyle = color; g.fillText(w, cx, y); cx += ww;
  }
  return y;
}
function ragBody(t, k) {
  // the library, down the left
  g.fillStyle = '#1b1d22'; g.fillRect(0, 0, 268, 590);
  g.fillStyle = '#8b8e96'; g.font = `700 14px ${SANS}`; g.fillText('LIBRARY', 22, 34);
  g.font = `500 12px ${MONO}`; g.textAlign = 'right'; g.fillText('1,500 docs', 248, 34); g.textAlign = 'left';
  const found = k > 0.26;
  DOCS.forEach((d, i) => {
    const y = 68 + i * 44, hit = found && CLAUSES.some(c => c[0] === i);
    if (hit) { g.fillStyle = 'rgba(57,212,255,.12)'; roundRect(10, y - 24, 248, 36, 8); g.fill(); g.fillStyle = '#39d4ff'; g.fillRect(10, y - 24, 4, 36); }
    g.fillStyle = hit ? '#e8f8ff' : '#a9acb3'; g.font = `${hit ? 600 : 500} 15px ${SANS}`; g.fillText(d, 26, y);
  });
  // the four modes, Ask selected
  let tx = 300;
  ['Ask', 'Review', 'Compare', 'Draft'].forEach((m, i) => {
    g.font = `600 16px ${SANS}`; const w = g.measureText(m).width + 28;
    if (!i) { g.fillStyle = '#2f6fed'; roundRect(tx, 16, w, 32, 16); g.fill(); }
    g.fillStyle = i ? '#8b8e96' : '#fff'; g.fillText(m, tx + 14, 38); tx += w + 8;
  });
  // the question, typed
  g.font = `600 21px ${SANS}`;
  const q = QUESTION.slice(0, Math.ceil(QUESTION.length * Math.min(1, k / 0.2)));
  g.fillStyle = '#f1efea'; g.fillText(q, 300, 92);
  if (k < 0.22 && Math.floor(t * 2) % 2) g.fillRect(302 + g.measureText(q).width, 76, 2, 20);
  // what retrieval found: three clauses, each with the words that matched
  if (k > 0.22) {
    g.fillStyle = '#8b8e96'; g.font = `700 13px ${SANS}`; g.fillText('RETRIEVED · 3 CLAUSES OF 1,500 DOCUMENTS', 300, 130);
    CLAUSES.forEach(([doc, cl, how, parts], i) => {
      const a = Math.max(0, Math.min(1, (k - 0.24 - i * 0.07) * 9)); if (!a) return;
      const y = 146 + i * 84; g.globalAlpha = a;
      g.fillStyle = '#1e2026'; g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; roundRect(300, y, 700, 74, 10); g.fill(); g.stroke();
      g.fillStyle = '#39d4ff'; g.font = `700 14px ${MONO}`; g.fillText(`[${i + 1}]`, 314, y + 25);
      g.fillStyle = '#c9ccd3'; g.font = `600 14px ${SANS}`; g.fillText(`${DOCS[doc]} · ${cl}`, 348, y + 25);
      g.textAlign = 'right'; g.fillStyle = '#7d8088'; g.font = `500 12px ${MONO}`; g.fillText(how, 986, y + 25); g.textAlign = 'left';
      g.font = `500 16px ${SANS}`; rich(parts, 314, y + 54, 672, 22, '#e8e8ea', 'rgba(255,204,51,.3)');
      g.globalAlpha = 1;
    });
  }
  // the answer, streamed, citing the clauses
  if (k > 0.5) {
    g.fillStyle = '#8b8e96'; g.font = `700 13px ${SANS}`; g.fillText('ANSWER', 300, 424);
    g.font = `500 18px ${SANS}`;
    const shown = ANSWER.slice(0, Math.ceil(ANSWER.length * Math.min(1, (k - 0.5) / 0.3)));
    rich(shown.split(/(\[\d\])/).filter(Boolean).map(x => [x, /^\[\d\]$/.test(x) ? 1 : 0]), 300, 452, 700, 26, '#f1efea', 'rgba(57,212,255,.28)');
  }
  // and the check that every claim in it is in a cited clause
  if (k > 0.84) {
    g.globalAlpha = Math.min(1, (k - 0.84) * 9);
    g.fillStyle = 'rgba(52,199,89,.14)'; g.strokeStyle = 'rgba(52,199,89,.6)'; g.lineWidth = 1.5; roundRect(300, 532, 700, 40, 10); g.fill(); g.stroke();
    g.fillStyle = '#7fe0a0'; g.font = `700 15px ${SANS}`; g.fillText('✓  Grounding check: 3 of 3 claims supported by the cited clauses', 316, 558);
    g.globalAlpha = 1;
  }
}

/* ---------- the agent: Claude computer use working through competitors' sites, with its own tools ---------- */
const STEPS = [
  ['open_url', 'brand-a.example/pricing', 0],
  ['record_page', 'pricing · 3 plans', 0],
  ['save_findings', 'Brand A · entry price, trial', 0],
  ['open_url', 'brand-b.example/pricing', 1],
  ['report_blocked', 'cookie wall · dismissed, retried', 1],
  ['record_page', 'pricing · 4 plans', 1],
  ['save_findings', 'Brand B · entry price, no trial', 1],
  ['open_url', 'brand-c.example/offers', 2],
];
// where the pointer goes for each step, in the page's own space
const AIM = [[330, 58], [300, 330], [470, 330], [330, 58], [318, 300], [130, 330], [470, 330], [330, 58]];
function agentBody(t, k) {
  const at = Math.min(STEPS.length - 0.001, k * STEPS.length), step = Math.floor(at), f = at - step, site = STEPS[step][2];
  // the browser the agent is driving
  g.fillStyle = '#f4f2ee'; roundRect(16, 14, 628, 562, 12); g.fill();
  g.fillStyle = '#e2dfd8'; roundRect(16, 14, 628, 46, 12); g.fill(); g.fillRect(16, 40, 628, 20);
  g.fillStyle = '#fff'; roundRect(96, 22, 468, 30, 15); g.fill();
  g.fillStyle = '#55585f'; g.font = `500 15px ${MONO}`; g.fillText(STEPS[Math.max(0, [...STEPS.keys()].filter(i => i <= step && STEPS[i][0] === 'open_url').pop())][1], 112, 43);
  ['#c9c6bf', '#c9c6bf', '#c9c6bf'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(36 + i * 18, 37, 5.5, 0, Math.PI * 2); g.fill(); });
  // the page: a header, a headline, and pricing cards (a different count on each site)
  const tint = ['#2f6fed', '#d0191f', '#177a41'][site], n = [3, 4, 3][site];
  g.fillStyle = tint; g.fillRect(16, 60, 628, 44);
  g.fillStyle = '#fff'; g.font = `700 17px ${SANS}`; g.fillText('Brand ' + 'ABC'[site], 36, 88);
  g.fillStyle = 'rgba(255,255,255,.7)'; [0, 1, 2].forEach(i => g.fillRect(470 + i * 56, 78, 40, 8));
  g.fillStyle = '#2a2c31'; g.fillRect(36, 132, 300, 20); g.fillStyle = '#b9b6ae'; g.fillRect(36, 164, 420, 10); g.fillRect(36, 182, 360, 10);
  const cw = (588 - (n - 1) * 14) / n;
  for (let i = 0; i < n; i++) {
    const x = 36 + i * (cw + 14);
    g.fillStyle = '#fff'; g.strokeStyle = '#d9d6cf'; g.lineWidth = 1.5; roundRect(x, 226, cw, 250, 10); g.fill(); g.stroke();
    g.fillStyle = '#2a2c31'; g.fillRect(x + 14, 246, cw * 0.5, 12);
    g.fillStyle = tint; g.fillRect(x + 14, 274, cw * 0.36, 24);
    g.fillStyle = '#c9c6bf'; for (let r = 0; r < 4; r++) g.fillRect(x + 14, 322 + r * 22, cw - 28 - (r % 2) * 20, 8);
    g.fillStyle = tint; g.globalAlpha = 0.16; roundRect(x + 14, 428, cw - 28, 30, 8); g.fill(); g.globalAlpha = 1;
  }
  const kind = STEPS[step][0];
  // a cookie wall the agent reports and gets past
  if (kind === 'report_blocked' && f < 0.75) {
    g.fillStyle = 'rgba(20,22,26,.45)'; g.fillRect(16, 60, 628, 516);
    g.fillStyle = '#fff'; roundRect(150, 236, 360, 150, 12); g.fill();
    g.fillStyle = '#2a2c31'; g.font = `700 17px ${SANS}`; g.fillText('We value your privacy', 174, 274);
    g.fillStyle = '#b9b6ae'; g.fillRect(174, 290, 300, 9); g.fillRect(174, 308, 240, 9);
    g.fillStyle = '#2a2c31'; roundRect(174, 334, 130, 34, 8); g.fill(); g.fillStyle = '#fff'; g.font = `600 14px ${SANS}`; g.fillText('Reject all', 206, 356);
  }
  // what it has recorded on this page
  if (kind === 'record_page' || kind === 'save_findings') {
    g.strokeStyle = '#ff5fa8'; g.lineWidth = 3; g.setLineDash([10, 6]); g.lineDashOffset = -t * 30; roundRect(28, 216, 604, 270, 12); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff5fa8'; roundRect(28, 190, 150, 24, 6); g.fill(); g.fillStyle = '#fff'; g.font = `700 13px ${MONO}`; g.fillText(kind === 'record_page' ? 'recording page' : 'saving findings', 38, 207);
  }
  // the pointer: glides to this step's target, and clicks
  const from = AIM[Math.max(0, step - 1)], to = AIM[step], e = Math.min(1, f / 0.55), s2 = e * e * (3 - 2 * e);
  const px = 16 + from[0] + (to[0] - from[0]) * s2, py = 14 + from[1] + (to[1] - from[1]) * s2;
  if (f > 0.55 && f < 0.9) { g.strokeStyle = 'rgba(255,95,168,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, 8 + (f - 0.55) * 60, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#111'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + 22); g.lineTo(px + 6, py + 17); g.lineTo(px + 10, py + 26); g.lineTo(px + 14, py + 24); g.lineTo(px + 10, py + 15); g.lineTo(px + 17, py + 15); g.closePath(); g.fill(); g.stroke();
  // the run, on the right: each tool call, then how much of its allowance it has used
  g.fillStyle = '#1b1d22'; roundRect(660, 14, 348, 562, 12); g.fill();
  g.fillStyle = '#f1efea'; g.font = `700 17px ${SANS}`; g.fillText('Agent run', 680, 46);
  g.fillStyle = '#8b8e96'; g.font = `500 13px ${MONO}`; g.fillText('brand benchmark · computer use', 680, 68);
  STEPS.forEach(([tool, note], i) => {
    if (i > step) return;
    const y = 104 + i * 44, done = i < step || f > 0.9;
    g.fillStyle = i === step ? 'rgba(255,255,255,.07)' : 'transparent'; roundRect(672, y - 20, 324, 38, 8); g.fill();
    g.fillStyle = tool === 'report_blocked' ? '#ffcc33' : '#39d4ff'; g.font = `700 14px ${MONO}`; g.fillText(tool, 684, y - 2);
    g.fillStyle = '#a9acb3'; g.font = `500 12px ${MONO}`; g.fillText(note, 684, y + 13);
    g.textAlign = 'right'; g.font = `700 15px ${SANS}`; g.fillStyle = done ? '#7fe0a0' : '#8b8e96'; g.fillText(done ? '✓' : '…', 984, y + 4); g.textAlign = 'left';
  });
  [['steps', (step + 1) / 40, `${step + 1} of 40`], ['budget', (step + 1) / 40 * 0.9, `${Math.round((step + 1) / 40 * 90)}% used`]].forEach(([label, v, text], i) => {
    const y = 486 + i * 40;
    g.fillStyle = '#8b8e96'; g.font = `600 13px ${SANS}`; g.fillText(label, 680, y); g.textAlign = 'right'; g.fillText(text, 988, y); g.textAlign = 'left';
    g.fillStyle = '#2a2d33'; roundRect(680, y + 8, 308, 8, 4); g.fill(); g.fillStyle = '#39d4ff'; roundRect(680, y + 8, Math.max(8, 308 * v), 8, 4); g.fill();
  });
}

const ips = ['10.4.2.17', '10.4.2.31', '172.16.8.4', '10.4.3.9', '192.168.1.20'];
function logsBody(t, k) {
  g.font = `500 17px ${MONO}`;
  const scroll = Math.floor(t * 9);
  for (let i = 0; i < 17; i++) {
    const idx = scroll + i, bad = k > 0.25 && idx % 3 !== 0;
    const ts = `21:${String(4 + (idx >> 6) % 50).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}`;
    const msg = bad ? `sshd: Failed password for admin from 203.0.113.${(idx * 7) % 250}` : `sshd: Accepted publickey for rhea from ${ips[idx % ips.length]}`;
    const y = 34 + i * 31;
    if (bad && k > 0.45) { g.fillStyle = 'rgba(255,51,64,.16)'; g.fillRect(14, y - 21, 620, 28); }
    g.fillStyle = '#5c6068'; g.fillText(ts, 22, y);
    g.fillStyle = bad ? (k > 0.45 ? '#ff6b74' : '#e8e8ea') : '#9fd8a6'; g.fillText(msg.slice(0, 52), 118, y);
  }
  const a = Math.max(0, Math.min(1, (k - 0.45) * 3));
  if (a > 0) {
    g.globalAlpha = a;
    g.fillStyle = '#1e1013'; g.strokeStyle = '#ff3340'; g.lineWidth = 2; roundRect(650, 18, 356, 552, 12); g.fill(); g.stroke();
    g.fillStyle = '#ff6b74'; g.font = `700 20px ${MONO}`; g.fillText('ANOMALY 0.97', 670, 54);
    g.fillStyle = '#c9c2c4'; g.font = `600 15px ${MONO}`; g.fillText('Isolation Forest + Autoencoder', 670, 80);
    g.fillStyle = '#e8e8ea'; g.font = `700 16px ${MONO}`; g.fillText('Why (SHAP)', 670, 124);
    [['failed logins / min', 0.92], ['new source IPs', 0.71], ['user = admin', 0.48], ['off-hours', 0.3]].forEach(([l, v], i) => {
      const y = 154 + i * 44;
      g.fillStyle = '#b7b0b2'; g.font = `500 14px ${MONO}`; g.fillText(l, 670, y);
      g.fillStyle = '#2a1a1d'; g.fillRect(670, y + 8, 300, 12);
      g.fillStyle = '#ff3340'; g.fillRect(670, y + 8, 300 * v * Math.min(1, a * 1.4), 12);
    });
    g.fillStyle = '#e8e8ea'; g.font = `700 16px ${MONO}`; g.fillText('What (LLM)', 670, 354);
    g.fillStyle = '#f3d6d9'; g.font = `500 15px ${MONO}`;
    ['Likely a brute-force login', 'attempt against admin from', 'rotating external IPs.', '', '→ block range, alert on-call'].forEach((l, i) => g.fillText(l, 670, 384 + i * 24));
    g.globalAlpha = 1;
  }
}

let last = '';
const RATE = { lock: 0, rag: 8, code: 4, agent: 12, logs: 6 };   // redraws a second while that window is up
const WINDOWS = {
  rag: ['Ask — legal knowledge assistant', ragBody],
  code: ['summarise.py — chub-guard', codeBody],
  agent: ['Agent — brand benchmark', agentBody],
  logs: ['auth.log — anomaly monitor', logsBody],
};
/** mode: 'lock' | 'rag' | 'code' | 'agent' | 'logs'; t seconds, k 0–1 progress through the beat. Redraws only when
    something visible changes: the lock screen twice a minute, the windows a few times a second. */
export function drawScreen(mode, t, k) {
  const tick = mode + '|' + (mode === 'lock' ? Math.floor(Date.now() / 30000) : Math.floor(t * RATE[mode])) + '|' + Math.round(k * 80);
  if (tick === last) return;
  last = tick;
  if (mode === 'lock') drawLock();
  else window_(WINDOWS[mode][0], WINDOWS[mode][1], t, k, null);
  screenTex.needsUpdate = true;
}
drawLock();
