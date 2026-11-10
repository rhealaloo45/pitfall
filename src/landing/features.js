/* Landing-page extras, all built from the shared résumé data (src/shared/portfolio-data.js):
   - Quick view: the whole portfolio on one screen, for people short on time (also opens at rhealaloo.com/#quick)
   - Where each skill shows up: tap a highlighted skill in Tech specs to see the work that used it
   - A command menu (⌘K / Ctrl K, or /) to jump anywhere or do anything
   - The chub-guard playground: chub-guard's documentation checks, run on any code, in the browser
   - Recent GitHub activity: the contribution graph and a few chosen repos
   Plain DOM, no framework; works with or without the 3D drive. */
import { check as chubCheck, VERSION as CG_VERSION } from './chub-engine.js?v=2';

const R = window.PORTFOLIO && window.PORTFOLIO.RESUME;
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const techIcon = window.TECH_ICON || (() => '');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// interface icons (Lucide, ISC)
const UI = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  out: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  jump: '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
  panel: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  spin: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
};
const ui = (n, cls = '') => `<svg class="ui ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI[n]}</svg>`;
const chips = list => list && list.length ? `<div class="stack">${list.map(n => `<span>${techIcon(n)}${esc(n)}</span>`).join('')}</div>` : '';

if (R) init();

function init() {
  const usage = buildUsage();
  skills(usage);
  github();
  const open = { quick: openQuick, palette: openPalette, playground: openPlayground };
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o && open[o.dataset.open]) { e.preventDefault(); open[o.dataset.open](); return; }
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); jump(target(j.dataset.jump)); }
  });
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); const p = $('#palette'); p && p.open ? p.close() : openPalette(); }
    else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !typing(e.target) && !$('dialog[open]')) { e.preventDefault(); openPalette(); }
  });
  $$('.kbtn kbd').forEach(k => { k.textContent = isMac ? '⌘K' : 'Ctrl K'; });

  /* ---------- light or dark ---------- */
  // the switch in the top bar (and the command menu); remembered on this device; the 3D drive listens for 'themechange'
  const themeBtn = $('[data-theme-toggle]');
  const isLight = () => document.documentElement.dataset.theme === 'light';
  const labelTheme = () => { if (themeBtn) { const t = isLight() ? 'Switch to dark mode' : 'Switch to light mode'; themeBtn.setAttribute('aria-label', t); themeBtn.title = t; } };
  function setTheme(t) {
    if (t === 'light') document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('theme', t); } catch { /* private mode: it just won't be remembered */ }
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = t === 'light' ? '#f6f3ec' : '#0b0c0f';
    labelTheme();
    dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }
  labelTheme();
  if (themeBtn) themeBtn.addEventListener('click', () => setTheme(isLight() ? 'dark' : 'light'));
  const fromHash = () => { if (location.hash === '#quick') openQuick(); };
  addEventListener('hashchange', fromHash); fromHash();

  /* ---------- where things are ---------- */
  function showcase() {
    const order = R.showcase || [];
    return [...R.stories].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  }
  function target(key) {
    const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
    if (kind === 'story') return $(`#story-${id} .card`);
    if (kind === 'work') return $(`#work-${id}`);
    if (kind === 'role') return $(`#role-${id}`);
    if (kind === 'repo') return $(`#gh-repo-${id}`) || $('#github');
    if (kind === 'skill') return $(`#tools button[data-skill="${CSS.escape(id)}"]`);
    return $('#' + id);
  }
  function jump(el, { flash = true, block = 'center' } = {}) {
    if (!el) return;
    $$('dialog[open]').forEach(d => d.close());
    document.documentElement.classList.remove('modal-open');   // before scrolling: the dialog's close event comes later
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block });
    if (!flash) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2600);
  }

  /* ---------- skills → the work that used them ---------- */
  function buildUsage() {
    const idx = new Map();
    const add = (name, e) => { const l = idx.get(name) || []; if (!l.some(x => x.pid === e.pid)) l.push(e); idx.set(name, l); };
    for (const x of R.experience) {
      for (const w of x.work || []) for (const n of w.stack || []) add(n, { key: 'work:' + w.id, pid: w.id, label: w.name, sub: x.org });
      for (const n of x.stack || []) add(n, { key: 'role:' + x.id, pid: 'role-' + x.id, label: x.org, sub: x.role });
    }
    for (const s of R.stories) for (const n of s.stack || []) add(n, { key: 'story:' + s.id, pid: s.id, label: s.title, sub: s.tag });
    for (const p of R.projects) for (const n of p.stack || []) {
      const s = p.story && R.stories.find(x => x.id === p.story);
      // a project with no card on the page: its repo card in the GitHub section if it has one, else its code on GitHub
      const featured = R.github.featured.includes(p.repo);
      add(n, s ? { key: 'story:' + s.id, pid: s.id, label: s.title, sub: s.tag }
        : featured ? { key: 'repo:' + p.repo, pid: p.repo, label: p.name, sub: 'On GitHub' }
        : { url: `https://github.com/${R.github.user}/${p.repo}`, pid: p.repo, label: p.name, sub: 'Code on GitHub' });
    }
    return idx;
  }
  function skills(usage) {
    const tools = $('#tools'); if (!tools) return;
    for (const span of $$('dd span', tools)) {
      const name = span.textContent.trim(), uses = usage.get(name);
      if (!uses) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'used'; b.dataset.skill = name;
      b.setAttribute('aria-expanded', 'false');
      b.innerHTML = span.innerHTML + `<em aria-label="${uses.length} ${uses.length === 1 ? 'project' : 'projects'}">${uses.length}</em>`;
      span.replaceWith(b);
    }
    const head = $('#specs .head');
    if (head && $('button.used', tools)) head.insertAdjacentHTML('beforeend', '<p class="specs-hint">Highlighted skills link to the work that used them.</p>');
    tools.addEventListener('click', e => { const b = e.target.closest('button.used'); if (b) toggle(b); });
  }
  function toggle(b, forceOpen = false) {
    const wasOpen = b.getAttribute('aria-expanded') === 'true';
    $$('#tools button.used[aria-expanded="true"]').forEach(x => x.setAttribute('aria-expanded', 'false'));
    $$('#tools .usage').forEach(x => x.remove());
    if (wasOpen && !forceOpen) return;
    const name = b.dataset.skill, uses = usage.get(name);
    b.setAttribute('aria-expanded', 'true');
    b.closest('#tools > div').insertAdjacentHTML('beforeend', `<div class="usage"><p>${techIcon(name)}<b>${esc(name)}</b> shows up in</p><div>${uses.map(u =>
      u.url ? `<a href="${esc(u.url)}" target="_blank" rel="noopener"><b>${esc(u.label)}</b><span>${esc(u.sub)}</span>${ui('out')}</a>`
        : `<button type="button" data-jump="${esc(u.key)}"><b>${esc(u.label)}</b><span>${esc(u.sub)}</span>${ui('out')}</button>`).join('')}</div></div>`);
  }
  function showSkill(name) {
    const b = target('skill:' + name);
    if (b) { toggle(b, true); jump(b.closest('#tools > div'), { flash: false }); } else jump($('#specs'), { flash: false, block: 'start' });
  }

  /* ---------- dialogs ---------- */
  function sheet(id, cls, label, html, hash) {
    let d = $('#' + id);
    if (d) return d;
    d = document.createElement('dialog');
    d.id = id; d.className = 'sheet ' + cls; d.setAttribute('aria-label', label); d.innerHTML = html;
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => {
      if (!$('dialog[open]')) document.documentElement.classList.remove('modal-open');
      if (hash && location.hash === '#' + hash) history.replaceState(null, '', location.pathname + location.search);
    });
    document.body.append(d);
    return d;
  }
  function show(d) {
    $$('dialog[open]').forEach(o => { if (o !== d) o.close(); });
    if (!d.open) d.showModal();
    document.documentElement.classList.add('modal-open');
  }

  /* ---------- quick view ---------- */
  function openQuick() {
    const C = R.contact, E = R.education;
    const years = w => (String(w).match(/\d{4}/g) || []).join('–') + (/present/i.test(w) ? '–now' : '');
    const stats = $$('#hello .stat').map(s => `<div>${s.innerHTML}</div>`).join('');
    const exp = R.experience.map(x => `<li><div class="qv-row"><b>${esc(x.org)}</b><span>${esc(years(x.when))}</span></div><div class="qv-sub">${esc(x.role)}</div>` +
      (x.work ? `<p>${x.work.map(w => `<button type="button" class="qv-link" data-jump="work:${esc(w.id)}">${esc(w.name)}</button>`).join(' · ')}. ${esc((x.short || [])[0] || '')}</p>`
        : `<p>${esc((x.short || x.points).slice(0, 2).join('. '))}.</p>`) + '</li>').join('');
    const edu = [E.college, E.junior, E.school].map(e => `<li><div class="qv-row"><b>${esc(e.name)}</b><span>${esc(years(e.when))}</span></div><div class="qv-sub">${esc(e.course)} · ${esc(e.score.split(' — ')[0])}</div></li>`).join('');
    const projects = showcase().map(s => `<li><button type="button" class="qv-proj" data-jump="story:${esc(s.id)}"><span class="qv-tag">${esc(s.tag)}</span><b>${esc(s.title)}</b><span class="qv-icons">${s.stack.map(n => techIcon(n)).join('')}</span></button>` +
      (s.tryIt ? `<button type="button" class="qv-try" data-open="playground">${ui('play')}Try it</button>` : '') + '</li>').join('');
    const proof = a => { const p = (R.proof || []).find(x => a.includes(x.match)); return p ? ` <a class="lnk" href="${esc(p.url)}" target="_blank" rel="noopener">${techIcon('Certificate')}${esc(p.label)}</a>` : ''; };
    const awards = R.achievements.filter(a => !/^Secured 1st rank/.test(a)).map(a => `<li>${esc(a.replace(/\.$/, ''))}${proof(a)}</li>`).join('');
    const skills = Object.entries(R.skills).map(([k, v]) => `<div class="qv-skill"><span>${esc(k)}</span>${chips(v.split(', '))}</div>`).join('');
    const d = sheet('quick', 'qv-sheet', 'Quick view', `
      <div class="qv">
        <header class="qv-head">
          <div><h2>${esc(R.name)}<span>.</span></h2><p>${esc(R.role)} · ${esc(R.location)}</p><span class="open"><i></i>Open to AI/ML engineering roles</span></div>
          <button type="button" class="x" data-close aria-label="Close">${ui('x')}</button>
        </header>
        <div class="qv-ctas">
          <a class="btn sm" href="${esc(C.resume)}" download="Rhea-Laloo-Resume.pdf">${ui('download')}Résumé PDF</a>
          <a class="btn ghost sm" href="mailto:${esc(C.email)}">${ui('mail')}${esc(C.email)}</a>
          <a class="btn ghost sm" href="${esc(C.github)}" target="_blank" rel="noopener">${techIcon('GitHub')}GitHub</a>
          <a class="btn ghost sm" href="${esc(C.linkedin)}" target="_blank" rel="noopener">${ui('out')}LinkedIn</a>
        </div>
        <div class="qv-grid">
          <div>
            <section><h3>Highlights</h3><div class="qv-stats">${stats}</div></section>
            <section><h3>Experience</h3><ul class="qv-list">${exp}</ul></section>
            <section><h3>Education</h3><ul class="qv-list">${edu}</ul></section>
          </div>
          <div>
            <section><h3>Projects</h3><ul class="qv-projects">${projects}</ul></section>
            <section><h3>Certifications &amp; awards</h3><ul class="qv-awards">${awards}</ul></section>
            <section><h3>Skills</h3>${skills}</section>
          </div>
        </div>
        <footer class="qv-foot">
          <button type="button" class="qv-share">${ui('copy')}<span>Copy a link to this view</span></button>
          <button type="button" class="qv-drive" data-close>Close and take the drive ${ui('out')}</button>
        </footer>
      </div>`, 'quick');
    if (!d.dataset.wired) {
      d.dataset.wired = '1';
      $('.qv-share', d).addEventListener('click', async e => {
        const ok = await copy(location.origin + location.pathname + '#quick');
        $('span', e.currentTarget).textContent = ok ? 'Link copied' : location.origin + location.pathname + '#quick';
      });
    }
    show(d);
    if (location.hash !== '#quick') history.replaceState(null, '', '#quick');
  }

  /* ---------- command menu ---------- */
  function commands() {
    const C = R.contact, list = [];
    const add = (group, icon, label, hint, run, more = '') => list.push({ group, icon, label, hint, run, text: `${label} ${hint} ${group} ${more}`.toLowerCase() });
    [['hello', 'Top', 'Name, highlights and résumé'], ['work', 'The drive', 'What I\'ve taught machines to notice'], ['experience', 'Experience', 'Where I build it'],
      ['education', 'Education', 'Where I learned to look'], ['specs', 'Tech specs', 'Skills and tools'], ['github', 'GitHub', 'Contribution graph and repos'], ['contact', 'Contact', 'Email, LinkedIn, GitHub']]
      .forEach(([id, label, hint]) => { if ($('#' + id)) add('Jump to', ui('jump'), label, hint, () => jump($('#' + id), { flash: false, block: 'start' })); });
    // one entry per project, strongest first; the TCS cards' names are search words for the matching drive card
    const work = R.experience.flatMap(x => (x.work || []).map(w => ({ ...w, org: x.org })));
    showcase().forEach(s => {
      const w = work.find(x => x.id === s.id);
      add('Projects', techIcon(s.stack[0]) || ui('box'), s.title, w ? w.name : s.tag, () => jump(target('story:' + s.id)), [s.tag, ...s.stack, ...(w ? [w.name, w.org, ...w.stack] : [])].join(' '));
    });
    add('Actions', ui('panel'), 'Quick view', 'The whole portfolio on one screen', openQuick, 'summary overview recruiter');
    add('Actions', ui('play'), 'Try chub-guard', 'Check your code for deprecated APIs', openPlayground, 'playground demo linter');
    add('Actions', ui('sun'), 'Light or dark mode', 'Switch the colours', () => setTheme(isLight() ? 'dark' : 'light'), 'theme appearance colours colors night day');
    add('Actions', ui('download'), 'Download résumé', 'PDF', () => { const a = document.createElement('a'); a.href = C.resume; a.download = 'Rhea-Laloo-Resume.pdf'; a.click(); }, 'resume cv');
    add('Actions', ui('copy'), 'Copy email address', C.email, async () => toast((await copy(C.email)) ? 'Email address copied' : C.email), 'contact mail');
    add('Actions', ui('mail'), 'Write an email', C.email, () => { location.href = 'mailto:' + C.email; }, 'contact');
    add('Actions', techIcon('GitHub'), 'Open GitHub', 'github.com/' + R.github.user, () => window.open(C.github, '_blank', 'noopener'), 'code repos');
    add('Actions', ui('out'), 'Open LinkedIn', C.linkedinLabel, () => window.open(C.linkedin, '_blank', 'noopener'));
    const forcedOff = /[?&]3d=off\b/.test(location.search), plain = document.documentElement.classList.contains('no-3d');
    if (forcedOff || !plain) add('Actions', ui('box'), forcedOff ? 'Turn the 3D drive back on' : 'Turn the 3D drive off', forcedOff ? 'Reloads with the drive' : 'Reloads as a plain, lighter page', () => {
      const u = new URL(location.href); u.hash = '';
      if (forcedOff) u.searchParams.delete('3d'); else u.searchParams.set('3d', 'off');
      location.href = u.toString();
    }, 'webgl animation performance battery');
    for (const [name, uses] of usage) add('Skills', techIcon(name), name, `Used in ${uses.length} ${uses.length === 1 ? 'project' : 'projects'}`, () => showSkill(name), 'skill');
    Object.values(R.skills).flatMap(v => v.split(', ')).filter(n => !usage.has(n))
      .forEach(n => add('Skills', techIcon(n), n, 'In Tech specs', () => jump($('#specs'), { flash: false, block: 'start' }), 'skill'));
    return list;
  }
  function openPalette() {
    const d = sheet('palette', 'pal-sheet', 'Search the site', `
      <div class="pal">
        <label class="pal-in">${ui('search')}<input type="text" placeholder="Jump to a project, a skill or a section…" aria-label="Search the site" aria-controls="pal-list" autocomplete="off" spellcheck="false"><kbd>esc</kbd></label>
        <div class="pal-list" id="pal-list" role="listbox" aria-label="Results"></div>
        <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>${isMac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> anytime</span></div>
      </div>`);
    const input = $('input', d), listEl = $('.pal-list', d);
    if (!d.dataset.wired) {
      d.dataset.wired = '1';
      const items = commands();
      let shown = [], active = 0;
      const rank = (it, q) => it.label.toLowerCase().startsWith(q) ? 3 : it.label.toLowerCase().includes(q) ? 2 : it.hint.toLowerCase().includes(q) ? 1 : 0;
      const item = (it, i) => `<div class="pal-item" role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === active}"><span class="pi">${it.icon}</span><span class="pl">${esc(it.label)}</span><span class="ph">${esc(it.hint)}</span></div>`;
      const render = () => {
        const q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
        shown = items.filter(it => words.every(w => it.text.includes(w)));
        if (q) shown = shown.map((it, i) => [it, rank(it, q), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);
        active = Math.max(0, Math.min(active, shown.length - 1));
        if (!shown.length) { listEl.innerHTML = `<p class="pal-empty">Nothing matches “${esc(input.value)}”.</p>`; input.removeAttribute('aria-activedescendant'); return; }
        let html = '', group = null;
        shown.forEach((it, i) => { if (!q && it.group !== group) { group = it.group; html += `<div class="pal-group" role="presentation">${esc(group)}</div>`; } html += item(it, i); });
        listEl.innerHTML = html;
        input.setAttribute('aria-activedescendant', 'pal-' + active);
      };
      const select = i => {
        active = i;
        $$('.pal-item', listEl).forEach(el => el.setAttribute('aria-selected', String(+el.dataset.i === i)));
        input.setAttribute('aria-activedescendant', 'pal-' + i);
        const el = $('#pal-' + i, listEl); if (el) el.scrollIntoView({ block: 'nearest' });
      };
      const runIt = i => { const it = shown[i]; if (!it) return; d.close(); it.run(); };
      input.addEventListener('input', () => { active = 0; render(); listEl.scrollTop = 0; });
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); select(Math.min(shown.length - 1, active + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, active - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); runIt(active); }
      });
      listEl.addEventListener('mousemove', e => { const el = e.target.closest('.pal-item'); if (el && +el.dataset.i !== active) select(+el.dataset.i); });
      listEl.addEventListener('click', e => { const el = e.target.closest('.pal-item'); if (el) runIt(+el.dataset.i); });
      d.reset = () => { input.value = ''; active = 0; render(); listEl.scrollTop = 0; };
    }
    d.reset();
    show(d);
    input.focus();
  }

  /* ---------- chub-guard playground ---------- */
  function openPlayground() {
    const cg = R.chubGuard;
    const d = sheet('playground', 'pg-sheet', 'chub-guard playground', `
      <div class="pg">
        <header class="pg-head">
          <div>
            <div class="pg-k">Live demo · chub-guard ${CG_VERSION}</div>
            <h2>Try chub-guard on your code</h2>
            <p>Paste Python or JavaScript. chub-guard finds the libraries you import, reads their current docs on Context Hub, adds its shared list of deprecated patterns, and flags every line that still uses something old. It all runs in your browser.</p>
          </div>
          <button type="button" class="x" data-close aria-label="Close">${ui('x')}</button>
        </header>
        <div class="pg-bar">
          <div class="seg" role="group" aria-label="Language"><button type="button" data-lang="python" aria-pressed="true">Python</button><button type="button" data-lang="javascript" aria-pressed="false">JavaScript</button></div>
          <select class="pg-ex" aria-label="Load an example"></select>
          <button type="button" class="btn sm pg-run">${ui('play')}Check code</button>
        </div>
        <div class="pg-main">
          <div class="pg-ed"><pre class="pg-gutter" aria-hidden="true"></pre><textarea wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code to check"></textarea></div>
          <div class="pg-out" aria-live="polite"></div>
        </div>
        <footer class="pg-foot">
          <div class="pg-install"><code>${esc(cg.install)}</code><button type="button" class="pg-copy">${ui('copy')}<span>Copy</span></button></div>
          <nav aria-label="chub-guard links">${[['npm', cg.npm], ['PyPI', cg.pypi], ['VS Code', cg.vscode], ['GitHub', cg.github]].map(([n, u]) =>
            `<a href="${esc(u)}" target="_blank" rel="noopener">${techIcon(n)}${n}</a>`).join('')}</nav>
          <p class="pg-note">chub-guard's documentation scan, with its rules and the docs fetched live from GitHub, plus one step newer than release ${CG_VERSION}: nothing the docs' own current examples use gets flagged. The CLI also runs Ruff's pyupgrade checks and full Python AST checks, which need Python itself.</p>
        </footer>
      </div>`);
    if (!d.dataset.wired) { d.dataset.wired = '1'; wirePlayground(d); }
    show(d);
    if (matchMedia('(hover: hover)').matches) $('textarea', d).focus();   // not on phones: it would pop up the keyboard
  }
  function wirePlayground(d) {
    const ta = $('textarea', d), gutter = $('.pg-gutter', d), out = $('.pg-out', d), ex = $('.pg-ex', d), runBtn = $('.pg-run', d);
    let lang = 'python', hits = new Set();
    const cache = new Map();
    const get = u => {
      if (!cache.has(u)) cache.set(u, fetch(u).then(r => r.ok ? r.text() : null).catch(() => null));
      return cache.get(u);
    };
    const idle = text => `<div class="pg-idle">${ui('play')}<p>${text}</p></div>`;
    const drawGutter = () => {
      const n = ta.value.split('\n').length;
      gutter.innerHTML = Array.from({ length: n }, (_, i) => hits.has(i + 1) ? `<b>${i + 1}</b>` : String(i + 1)).join('\n');
      gutter.scrollTop = ta.scrollTop;
    };
    const fillExamples = () => {
      ex.innerHTML = EXAMPLES[lang].map(([name], i) => `<option value="${i}">Example: ${esc(name)}</option>`).join('');
      load(0);
    };
    const load = i => { ta.value = EXAMPLES[lang][i][1]; hits = new Set(); drawGutter(); out.innerHTML = idle('Press <b>Check code</b> to see what chub-guard flags, or paste your own.'); };
    $$('.seg button', d).forEach(b => b.addEventListener('click', () => {
      if (b.dataset.lang === lang) return;
      lang = b.dataset.lang;
      $$('.seg button', d).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      fillExamples();
    }));
    ex.addEventListener('change', () => load(+ex.value));
    ta.addEventListener('input', () => { if (hits.size) hits = new Set(); drawGutter(); });
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
    runBtn.addEventListener('click', run);
    $('.pg-copy', d).addEventListener('click', async e => {
      const ok = await copy(R.chubGuard.install), label = $('span', e.currentTarget);
      label.textContent = ok ? 'Copied' : 'Copy'; setTimeout(() => { label.textContent = 'Copy'; }, 1800);
    });
    out.addEventListener('click', e => {
      const b = e.target.closest('[data-line]'); if (!b) return;
      const line = +b.dataset.line, ls = ta.value.split('\n');
      const start = ls.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
      ta.focus(); ta.setSelectionRange(start, start + ls[line - 1].length);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      ta.scrollTop = Math.max(0, (line - 3) * lh);
    });
    async function run() {
      const code = ta.value;
      if (!code.trim()) { out.innerHTML = idle('Paste some code first.'); return; }
      runBtn.disabled = true;
      out.innerHTML = `<div class="pg-busy">${ui('spin', 'spin')}<p>Reading the docs on Context Hub…</p></div>`;
      try { render(await chubCheck(code, lang, get)); }
      catch { out.innerHTML = idle('Something went wrong while checking. Try again in a moment.'); }
      runBtn.disabled = false;
    }
    function render(r) {
      const lines = [...new Set(r.issues.map(i => i.line))];
      hits = new Set(lines); drawGutter();
      const sevName = { breaking: 'Breaking', warning: 'Warning', info: 'Info' };
      const unread = r.docs.filter(x => !x.read);
      const checked = r.docs.length
        ? `Checked against ${r.docs.map(x => `<a href="${esc(x.page)}" target="_blank" rel="noopener">${esc(x.id)}</a>`).join(', ')} on Context Hub, plus chub-guard's shared patterns.` +
          (unread.length ? ` Couldn't load the docs for ${unread.map(x => esc(x.id)).join(', ')}, so those used the shared patterns only.` : '')
        : r.imports.length ? `None of these imports (${r.imports.filter(m => !m.includes('.')).map(m => `<code>${esc(m)}</code>`).join(', ')}) are libraries chub-guard tracks yet, so only its built-in rules ran.`
          : 'No imports found, so only chub-guard\'s built-in rules ran.';
      const head = r.issues.length
        ? `<p class="pg-sum"><b>${r.issues.length} ${r.issues.length === 1 ? 'issue' : 'issues'}</b> on ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}</p>`
        : `<p class="pg-sum ok">${ui('check')}<b>Nothing deprecated found</b></p>`;
      const items = lines.map(line => `<li><button type="button" data-line="${line}"><span class="ln">Line ${line}</span>${r.issues.filter(i => i.line === line).map(i =>
        `<span class="iss"><i class="sev ${i.severity}">${sevName[i.severity]}</i><span>${md(i.message)}${i.docId ? ` <em>${esc(i.docId)}</em>` : ''}</span></span>`).join('')}</button></li>`).join('');
      const hints = r.docs.filter(x => x.hint && r.issues.some(i => i.docId === x.id)).map(x =>
        `<details><summary>How the ${esc(x.id)} docs do it now</summary><pre><code>${esc(x.hint)}</code></pre><a href="${esc(x.page)}" target="_blank" rel="noopener">Read the docs on Context Hub ${ui('out')}</a></details>`).join('');
      out.innerHTML = head + (items ? `<ul class="pg-issues">${items}</ul>` : '') + hints + `<p class="pg-checked">${checked}</p>`;
    }
    fillExamples();
  }

  /* ---------- GitHub ---------- */
  function github() {
    const sec = $('#github'); if (!sec) return;
    const user = R.github.user, cal = $('#gh-cal'), months = $('#gh-months'), total = $('#gh-total'), facts = $('#gh-facts'), reposEl = $('#gh-repos');
    cal.style.setProperty('--weeks', 53); months.style.setProperty('--weeks', 53);
    cal.innerHTML = '<i></i>'.repeat(53 * 7);
    const ours = name => (R.projects.find(p => p.repo === name) || {}).text || ((R.experience.flatMap(x => x.work || []).find(w => w.repo === name || w.id === name)) || {}).text || '';
    const COLORS = { Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', 'Jupyter Notebook': '#DA5B0B', HTML: '#e34c26', CSS: '#663399' };
    const ago = iso => {
      const s = (Date.parse(iso) - Date.now()) / 1000, rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      for (const [u, n] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600]]) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
      return 'just now';
    };
    const drawRepos = list => {
      reposEl.innerHTML = list.map(r => `<a class="repo" id="gh-repo-${esc(r.name)}" href="${esc(r.html_url)}" target="_blank" rel="noopener">
        <div class="repo-top">${techIcon('GitHub')}<b>${esc(r.name)}</b>${ui('out')}</div>
        <p>${esc(ours(r.name) || r.description || '')}</p>
        <div class="repo-meta">${r.language ? `<span><i style="background:${COLORS[r.language] || '#8b8b8b'}"></i>${esc(r.language)}</span>` : ''}${r.stargazers_count ? `<span>★ ${r.stargazers_count}</span>` : ''}${r.pushed_at ? `<span>Updated ${esc(ago(r.pushed_at))}</span>` : ''}</div>
      </a>`).join('');
    };
    drawRepos(R.github.featured.map(name => ({ name, html_url: `https://github.com/${user}/${name}` })));
    fetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=pushed`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
      .then(list => drawRepos(R.github.featured.map(n => list.find(r => r.name === n) || { name: n, html_url: `https://github.com/${user}/${n}` })))
      .catch(() => {});
    fetch('/api/github').then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(data => {
      const days = data.days || []; if (!days.length) throw new Error('empty');
      const first = new Date(days[0].date + 'T00:00:00Z'), pad = first.getUTCDay(), weeks = Math.ceil((pad + days.length) / 7);
      const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), mon = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
      cal.style.setProperty('--weeks', weeks); months.style.setProperty('--weeks', weeks);
      cal.innerHTML = '<i class="pad"></i>'.repeat(pad) + days.map(x => {
        const n = x.count == null ? null : x.count;
        return `<i class="l${x.level}" title="${n == null ? 'Some' : n === 0 ? 'No' : n} contribution${n === 1 ? '' : 's'} on ${fmt.format(new Date(x.date + 'T00:00:00Z'))}"></i>`;
      }).join('');
      // month names over the week where each month starts
      const marks = [];
      for (let w = 0, last = -1; w < weeks; w++) {
        const i = Math.max(0, w * 7 - pad), dt = days[i] && new Date(days[i].date + 'T00:00:00Z');
        if (!dt || dt.getUTCMonth() === last) continue;
        last = dt.getUTCMonth();
        if (marks.length && w - marks[marks.length - 1][0] < 3) marks.pop();   // a month that only just started: its label would collide
        if (w < weeks - 2) marks.push([w, mon.format(dt)]);
      }
      months.innerHTML = marks.map(([w, m]) => `<span style="grid-column:${w + 1}">${m}</span>`).join('');
      const sum = data.total || days.reduce((a, x) => a + (x.count || 0), 0);
      total.textContent = sum.toLocaleString('en-US');
      const active = days.filter(x => x.level > 0).length;
      let best = 0, run = 0; for (const x of days) { run = x.level > 0 ? run + 1 : 0; best = Math.max(best, run); }
      facts.textContent = `${active} active days · longest streak ${best} days`;
      const scroller = $('.gh-scroll', sec); scroller.scrollLeft = scroller.scrollWidth;
      sec.classList.add('has-cal');
    }).catch(() => sec.classList.add('no-cal'));
  }
}

/* ---------- small helpers ---------- */
function typing(el) { return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove(); return ok;
  }
}
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- the playground's examples: real patterns chub-guard knows about ---------- */
const EXAMPLES = {
  python: [
    ['OpenAI, the 2022 way', `import openai

openai.api_key = "sk-..."

completion = openai.Completion.create(
    model="text-davinci-003",
    prompt="Write a haiku about deprecations",
)

chat = openai.ChatCompletion.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello"}],
)`],
    ['Gemini\'s old SDK', `import google.generativeai as genai

genai.configure(api_key="...")
model = genai.GenerativeModel("gemini-1.5-flash")

response = model.generate_content("Explain RAG in one line")`],
    ['Anthropic\'s legacy completions', `from anthropic import Anthropic, HUMAN_PROMPT, AI_PROMPT

client = Anthropic()
completion = client.completions.create(
    model="claude-2",
    max_tokens_to_sample=300,
    prompt=f"{HUMAN_PROMPT} Summarise this log{AI_PROMPT}",
)`],
    ['LangChain 0.0.x chains', `from langchain.llms import OpenAI
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate

llm = OpenAI(temperature=0)
prompt = PromptTemplate.from_template("Name a company that makes {product}")
chain = LLMChain(llm=llm, prompt=prompt)`],
    ['Current code (nothing to flag)', `from openai import OpenAI

client = OpenAI()
completion = client.chat.completions.create(
    model="gpt-5",
    messages=[{"role": "user", "content": "Hello"}],
)
print(completion.choices[0].message.content)`],
    ['Selenium locators', `from selenium import webdriver

driver = webdriver.Chrome()
driver.get("https://example.com/login")
driver.find_element_by_id("username").send_keys("rhea")
driver.find_element_by_name("submit").click()`],
  ],
  javascript: [
    ['Old Node.js habits', `const request = require('request');
const fs = require('fs');

var config = JSON.parse(fs.readFileSync('config.json'));

request(config.url, (err, res, body) => {
  fs.writeFileSync('out.json', body);
});`],
  ],
};
