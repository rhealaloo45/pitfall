/* The laptop's screen in my room, drawn on a canvas: first an editor where chub-guard flags an
   outdated API call, then a log stream where the anomaly pipeline catches an attack. Illustrative —
   the real projects are described in the cards beside it. */
import * as THREE from 'three';

const W = 1024, H = 640;
const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const g = canvas.getContext('2d');
export const screenTex = new THREE.CanvasTexture(canvas);
screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 4;

const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';
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

function chrome(title) {
  g.fillStyle = '#16181d'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#22252b'; g.fillRect(0, 0, W, 44);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(24 + i * 22, 22, 7, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#9a9ca3'; g.font = `600 17px ${MONO}`; g.textAlign = 'center'; g.fillText(title, W / 2, 28); g.textAlign = 'left';
}

/** t: seconds (for the cursor and the stream); k: 0–1 how far the scene has got. */
function drawCode(t, k) {
  chrome('summarise.py — chub-guard');
  g.font = `500 21px ${MONO}`;
  const typed = Math.min(code.length, Math.floor(k * 3 * code.length) + 2);
  code.slice(0, typed).forEach((line, i) => {
    const y = 96 + i * 36;
    g.fillStyle = '#4b4f58'; g.fillText(String(i + 1).padStart(2, ' '), 18, y);
    let x = 62;
    for (const [c, s] of line) { g.fillStyle = COL[c]; g.fillText(s, x, y); x += g.measureText(s).width; }
  });
  if (k > 0.35) {
    // the flagged call: a squiggle under it, and chub-guard's note
    const y = 96 + 3 * 36 + 8, x0 = 62 + g.measureText('    resp = ').width, x1 = x0 + g.measureText('openai.ChatCompletion.create(').width;
    g.strokeStyle = '#ffcc33'; g.lineWidth = 2.5; g.beginPath();
    for (let x = x0; x <= x1; x += 6) g.lineTo(x, y + ((x - x0) / 6 % 2 ? 4 : 0));
    g.stroke();
    const a = Math.min(1, (k - 0.35) * 4);
    g.globalAlpha = a;
    g.fillStyle = '#2a2510'; g.strokeStyle = '#ffcc33'; g.lineWidth = 2;
    roundRect(x0 - 6, y + 16, 560, 104, 10); g.fill(); g.stroke();
    g.fillStyle = '#ffcc33'; g.font = `700 19px ${MONO}`; g.fillText('⚠ chub-guard · outdated API', x0 + 12, y + 46);
    g.fillStyle = '#efe6c8'; g.font = `500 17px ${MONO}`;
    g.fillText('ChatCompletion.create was removed in openai 1.x', x0 + 12, y + 76);
    g.fillText('→ client.chat.completions.create(...)', x0 + 12, y + 104);
    g.globalAlpha = 1;
  }
  if (Math.floor(t * 2) % 2) { g.fillStyle = '#e8e8ea'; g.fillRect(62 + 4, 96 + (typed - 1) * 36 + 6, 11, 4); }
}

const ips = ['10.4.2.17', '10.4.2.31', '172.16.8.4', '10.4.3.9', '192.168.1.20'];
function drawLogs(t, k) {
  chrome('auth.log — anomaly monitor');
  g.font = `500 17px ${MONO}`;
  const n = 15, scroll = Math.floor(t * 9);
  for (let i = 0; i < n; i++) {
    const idx = scroll + i, bad = k > 0.25 && idx % 3 !== 0;
    const ts = `21:${String(4 + (idx >> 6) % 50).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}`;
    const msg = bad ? `sshd: Failed password for admin from 203.0.113.${(idx * 7) % 250}` : `sshd: Accepted publickey for rhea from ${ips[idx % ips.length]}`;
    const y = 80 + i * 30;
    if (bad && k > 0.45) { g.fillStyle = 'rgba(255,51,64,.16)'; g.fillRect(14, y - 21, 620, 28); }
    g.fillStyle = '#5c6068'; g.fillText(ts, 22, y);
    g.fillStyle = bad ? (k > 0.45 ? '#ff6b74' : '#e8e8ea') : '#9fd8a6'; g.fillText(msg.slice(0, 52), 118, y);
  }
  // the model's verdict: anomaly score, why (SHAP), what (LLM)
  const a = Math.max(0, Math.min(1, (k - 0.45) * 3));
  if (a > 0) {
    g.globalAlpha = a;
    g.fillStyle = '#1e1013'; g.strokeStyle = '#ff3340'; g.lineWidth = 2; roundRect(650, 64, 356, 548, 12); g.fill(); g.stroke();
    g.fillStyle = '#ff6b74'; g.font = `700 20px ${MONO}`; g.fillText('ANOMALY 0.97', 670, 100);
    g.fillStyle = '#c9c2c4'; g.font = `600 15px ${MONO}`; g.fillText('Isolation Forest + Autoencoder', 670, 126);
    g.fillStyle = '#e8e8ea'; g.font = `700 16px ${MONO}`; g.fillText('Why (SHAP)', 670, 170);
    [['failed logins / min', 0.92], ['new source IPs', 0.71], ['user = admin', 0.48], ['off-hours', 0.3]].forEach(([l, v], i) => {
      const y = 200 + i * 44;
      g.fillStyle = '#b7b0b2'; g.font = `500 14px ${MONO}`; g.fillText(l, 670, y);
      g.fillStyle = '#2a1a1d'; g.fillRect(670, y + 8, 300, 12);
      g.fillStyle = '#ff3340'; g.fillRect(670, y + 8, 300 * v * Math.min(1, a * 1.4), 12);
    });
    g.fillStyle = '#e8e8ea'; g.font = `700 16px ${MONO}`; g.fillText('What (LLM)', 670, 400);
    g.fillStyle = '#f3d6d9'; g.font = `500 15px ${MONO}`;
    ['Likely a brute-force login', 'attempt against admin from', 'rotating external IPs.', '', '→ block range, alert on-call'].forEach((l, i) => g.fillText(l, 670, 430 + i * 24));
    g.globalAlpha = 1;
  }
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

let last = -1;
/** mode: 'code' | 'logs'; redraws at ~12 fps. */
export function drawScreen(mode, t, k) {
  const tick = Math.floor(t * 12) + (mode === 'logs' ? 1e6 : 0) + Math.round(k * 50) * 1e3;
  if (tick === last) return;
  last = tick;
  if (mode === 'logs') drawLogs(t, k); else drawCode(t, k);
  screenTex.needsUpdate = true;
}
drawCode(0, 0);
