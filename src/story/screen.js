/* The ultrawide on my desk, drawn on a canvas: a lock screen (the Mumbai GP car as wallpaper, the visitor's
   own local time), then an editor window where chub-guard flags an outdated API call, then a log window where
   the anomaly pipeline catches an attack. Illustrative — the real projects are described in the cards. */
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
export function setWallpaper(url) { const im = new Image(); im.onload = () => { wall = im; for (const k in walls) delete walls[k]; wallpaper(0.35); drawLock(); screenTex.needsUpdate = true; last = -1; }; im.src = url; }
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
  // menu bar
  g.fillStyle = 'rgba(20,22,26,.55)'; g.fillRect(0, 0, W, 34);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `600 18px ${SANS}`; g.fillText('Rhea L', 24, 23);
  const now = new Date(); g.textAlign = 'right'; g.fillText(now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }), W - 24, 23); g.textAlign = 'left';
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

let last = -1;
/** mode: 'lock' | 'code' | 'logs'; t seconds, k 0–1 progress through the beat. Redraws only when something
    visible changes: the lock screen twice a minute, the editor 4×/s (typing, cursor), the logs 6×/s. */
export function drawScreen(mode, t, k) {
  const rate = mode === 'lock' ? 0 : mode === 'logs' ? 6 : 4;
  const tick = (mode === 'lock' ? Math.floor(Date.now() / 30000) : Math.floor(t * rate)) * 7 + (mode === 'logs' ? 1e7 : mode === 'code' ? 2e7 : 0) + Math.round(k * 30) * 1e3;
  if (tick === last) return;
  last = tick;
  if (mode === 'lock') drawLock();
  else if (mode === 'logs') window_('auth.log — anomaly monitor', logsBody, t, k, null);
  else window_('summarise.py — chub-guard', codeBody, t, k, null);
  screenTex.needsUpdate = true;
}
drawLock();
