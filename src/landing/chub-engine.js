/* chub-guard's documentation checks, ported from chub_guard.py (chub-guard 1.2.1, MIT, github.com/rhealaloo45/chub-guard)
   so they run in the browser. Same steps as the CLI: find the libraries a snippet imports, fetch their Context Hub docs,
   pull out what those docs mark as deprecated, merge in chub-guard's shared pattern file, and flag the lines that use it.
   The CLI also runs Ruff's pyupgrade rules and full Python AST checks; those need a Python runtime, so they aren't here
   (the two AST rules are approximated line by line, and imports are read with a regex instead of Python's parser).

   One step goes beyond 1.2.1. That release reads any name mentioned near a warning as deprecated, so it flags current
   calls such as `client.chat.completions.create` or `message.content`. Here, nothing the docs' own current examples use
   is flagged (currentUsage), and in JavaScript only class-like names from a deprecated pattern are matched, as whole
   words. `check(..., { legacy: true })` runs the 1.2.1 rules unchanged; tests/chub-bench.mjs compares the two. */

export const VERSION = '1.2.1';
export const DB_URL = 'https://raw.githubusercontent.com/rhealaloo45/chub-guard/main/deprecations.json';
const HUB = 'https://raw.githubusercontent.com/andrewyng/context-hub/main/content';
// docs as chub-guard's own repo cached them (the CLI gets JavaScript docs through the chub CLI, which a browser can't run)
const CACHED = 'https://raw.githubusercontent.com/rhealaloo45/chub-guard/main/.chub-docs';

export const docUrl = (docId, lang) => { const [pkg, doc] = docId.split('/'); return `${HUB}/${pkg}/docs/${doc}/${lang}/DOC.md`; };
export const docPage = docId => { const [pkg, doc] = docId.split('/'); return `https://github.com/andrewyng/context-hub/tree/main/content/${pkg}/docs/${doc}`; };

// the module → Context Hub doc map that ships with chub-guard-init 1.2.1 (assets/.chub-docs/registry.json)
export const REGISTRY = {
  'google.generativeai': 'gemini/genai', google: 'gemini/genai', openai: 'openai/package', anthropic: 'anthropic/package',
  langchain: 'langchain/package', langchain_core: 'langchain/core', langchain_community: 'langchain/community',
  mistralai: 'mistralai/package', cohere: 'cohere/package', boto3: 'aws/boto3', 'azure.ai': 'azure/openai', react: 'react/react',
  click: 'click/package', rich: 'rich/package', accelerate: 'accelerate/package', aiohttp: 'aiohttp/package',
  albumentations: 'albumentations/package', alembic: 'alembic/package', sqlalchemy: 'sqlalchemy/package', torch: 'torch/package',
  airtable: 'airtable/database', angular: 'angular/core', antd: 'antd/antd', selenium: 'selenium/package',
  playwright: 'playwright/package', urllib: 'python/urllib', urllib2: 'python/urllib2',
};

/* ---------- reading the docs (_extract_from_doc / get_js_dynamic_deprecations) ---------- */
const NEGATIVE = ['incorrect', 'deprecated', 'legacy', 'do not use', 'do not', 'avoid', 'prohibited', 'removed', 'old way', "don't use", '❌', '⛔', '🚫'];
const POSITIVE = ['instead', 'use this', 'correct', 'modern', 'new way', 'recommended', '✅', 'do this', 'replacement'];
const SPLIT = ['→', '->', ' instead', ' use ', 'replace with', '✅', 'correct:', 'modern:'];
const ticks = s => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);
const strip = (s, chars) => { let a = 0, b = s.length; while (a < b && chars.includes(s[a])) a++; while (b > a && chars.includes(s[b - 1])) b--; return s.slice(a, b); };
function clean(m) {
  let c = m.split('...').join('').trim();
  if (c.endsWith('()')) c = c.slice(0, -2);
  if (c.endsWith('(')) c = c.slice(0, -1);
  return c;
}
const lines = text => text.split(/\r\n|\r|\n/);

/** Patterns a doc marks as deprecated. `js` adds the JavaScript-only extraction (new X(, a.b(, require('x')). */
export function extractFromDoc(content, js = false) {
  const bad = new Set(), ls = lines(content);
  // 1: lines that say something is deprecated; only the part before "→ / instead / use …" counts
  for (const line of ls) {
    const low = line.toLowerCase(), neg = NEGATIVE.some(k => low.includes(k));
    if (POSITIVE.some(k => low.includes(k)) && !neg) continue;
    if (!neg) continue;
    let working = line;
    for (const mk of SPLIT) { const i = working.toLowerCase().indexOf(mk.toLowerCase()); if (i >= 0) { working = working.slice(0, i); break; } }
    for (const m of ticks(working)) {
      let c = clean(m);
      if (c && c.length > 4 && (c.includes(' ') || c.includes('.'))) {
        if (c.startsWith('import ') && c.includes(' as ')) c = c.split(' as ')[0].trim();
        bad.add(c);
      }
    }
    if (js) {
      for (const m of working.matchAll(/new\s+(\w+)\s*\(/g)) if (m[1].length > 3) bad.add(`new ${m[1]}(`);
      for (const m of working.matchAll(/(\w+(?:\.\w+)+)\s*\(/g)) if (m[1].length > 4) bad.add(m[1]);
      for (const m of working.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (m[1].length > 3) bad.add(`require('${m[1]}')`);
    }
  }
  // 2: everything in backticks under a "## Deprecated / Legacy / Migration …" heading
  let inDep = false;
  for (const line of ls) {
    const st = line.trim().toLowerCase();
    if (st.startsWith('## ')) { inDep = ['deprecated', 'legacy', 'removal', 'removed', 'breaking', 'migration'].some(k => st.includes(k)); continue; }
    if (inDep) for (const m of ticks(line)) { const c = clean(m); if (c && c.length > 3) bad.add(c); }
  }
  // 3: code blocks right after a ❌ / "Don't" marker
  for (let i = 0; i < ls.length; i++) {
    if (!['❌', '⛔', '🚫', "**Don't", '**Incorrect', '**Deprecated'].some(mk => ls[i].includes(mk))) continue;
    for (let j = i + 1; j < Math.min(i + 4, ls.length); j++) {
      if (!ls[j].trim().startsWith('```')) continue;
      const between = ls.slice(i, j).join(' ').toLowerCase();
      if (!['✅', '**do ', '**correct', '**modern'].some(pk => between.includes(pk))) {
        for (let k = j + 1; k < ls.length && !ls[k].trim().startsWith('```'); k++)
          for (const m of ls[k].matchAll(/`([^`]+)`|(\b[A-Z][a-zA-Z]+(?:\.[a-zA-Z]+)+)/g)) { const p = m[1] || m[2]; if (p && p.length > 3) bad.add(strip(p, '()')); }
      }
      break;
    }
  }
  return [...bad];
}

/**
 * What a doc presents as current: its code examples (outside deprecated sections and ❌ counter-examples) and the
 * names in backticks on lines that don't warn against anything. A pattern found in here is in use, not deprecated.
 */
export function currentUsage(content) {
  const ls = lines(content), out = [];
  let inDep = false, inCode = false, counter = false, para = [];
  // prose is judged a paragraph (or list item) at a time, so a warning that wraps onto the next line still counts
  const flush = () => {
    const text = para.join(' '); para = [];
    if (text && !inDep && !NEGATIVE.some(k => text.toLowerCase().includes(k))) out.push(...ticks(text));
  };
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i], st = line.trim(), low = st.toLowerCase();
    if (st.startsWith('```')) {
      flush();
      if (!inCode) {
        const before = ls.slice(Math.max(0, i - 3), i).join(' ');
        counter = inDep || (['❌', '⛔', '🚫', "**Don't", '**Incorrect', '**Deprecated'].some(m => before.includes(m)) && !['✅', '**Do ', '**Correct', '**Modern'].some(m => before.includes(m)));
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { if (!counter && !NEGATIVE.some(k => low.includes(k))) out.push(line); continue; }
    if (low.startsWith('#')) { flush(); if (low.startsWith('## ')) inDep = ['deprecated', 'legacy', 'removal', 'removed', 'breaking', 'migration'].some(k => low.includes(k)); continue; }
    if (!st || /^([-*+]|\d+\.)\s/.test(st)) flush();
    if (st) para.push(st);
  }
  flush();
  return out.join('\n');
}
const word = n => new RegExp('(^|[^\\w$])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\w$])');

/** The doc's own example of current usage (extract_chub_hint). */
export function extractHint(content, lang = 'python') {
  const ls = lines(content);
  const find = fence => {
    let inSec = false, inCode = false, code = [];
    for (const line of ls) {
      const st = line.trim().toLowerCase();
      if (['## usage', '## core usage', '## basic inference', '## golden rule', '## quickstart'].some(h => st.startsWith(h))) { inSec = true; continue; }
      else if (line.startsWith('## ') && inSec && !inCode) inSec = false;
      if (inSec) {
        if (line.trim().startsWith(fence) && !inCode) { inCode = true; continue; }
        else if (line.trim().startsWith('```') && inCode) break;
        if (inCode) code.push(line);
      }
    }
    if (!code.length) {
      inCode = false;
      for (const line of ls) {
        if (line.trim().startsWith(fence) && !inCode) { inCode = true; continue; }
        else if (line.trim().startsWith('```') && inCode) break;
        if (inCode) code.push(line);
      }
    }
    return code.length ? code.join('\n') : null;
  };
  let r = find(lang === 'python' ? '```python' : '```' + lang);
  if (r) return r;
  if (lang === 'javascript') for (const f of ['```js', '```typescript', '```ts']) if ((r = find(f))) return r;
  if (lang !== 'python') for (const f of ['```python', '```javascript', '```js', '```typescript', '```ts', '```java', '```cpp', '```c']) if ((r = find(f))) return r;
  return null;
}

/* ---------- reading the code ---------- */
const PY_NOQA = l => l.includes('# noqa: UP') || l.includes('# noqa: CHUB');
// Python 2 syntax: the CLI's parser fails on these, and then it runs its legacy checks instead of reading imports
const PY2 = [/\bprint\s+["']/, /except\s+\w+,\s+\w+:/];

/** Modules a Python snippet imports, each also under its top-level name (get_imported_modules). */
export function pyImports(code) {
  const mods = new Map(), ls = lines(code);
  if (ls.some(l => PY2.some(re => re.test(l)))) return mods;
  const add = (name, line, col) => { if (!name || PY_NOQA(ls[line - 1] || '')) return; if (!mods.has(name)) mods.set(name, []); mods.get(name).push([line, col]); };
  ls.forEach((l, i) => {
    let m = l.match(/^(\s*)import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/);
    if (m) for (const part of m[2].split(',')) { const n = part.trim().split(/\s+as\s+/)[0]; add(n, i + 1, m[1].length + 1); add(n.split('.')[0], i + 1, m[1].length + 1); }
    m = l.match(/^(\s*)from\s+([\w.]+)\s+import\b/);
    if (m && !m[2].startsWith('.')) { add(m[2], i + 1, m[1].length + 1); add(m[2].split('.')[0], i + 1, m[1].length + 1); }
  });
  return mods;
}

/** Modules a JavaScript snippet imports (get_js_imports). */
export function jsImports(code) {
  const mods = new Map(), ls = lines(code);
  const add = (name, line, col) => { if (!mods.has(name)) mods.set(name, []); mods.get(name).push([line, col]); };
  ls.forEach((line, i) => {
    if (line.includes('// noqa: CHUB') || line.includes('# noqa: CHUB')) return;
    const t = line.trim();
    let pkg = null, m;
    if ((m = t.match(/^import\s+(?:[^'"]+)\s+from\s+['"]([^'"]+)['"]/))) pkg = m[1];
    if (!pkg && (m = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/))) pkg = m[1];
    if (!pkg && (m = t.match(/^#include\s*[<"]([^>"]+)[>"]/))) pkg = m[1].replace('.h', '').replace('.hpp', '');
    if (!pkg && (m = t.match(/^import\s+(static\s+)?([a-zA-Z0-9_.]+);/))) pkg = m[2].split('.').join('/');
    if (!pkg) return;
    const col = line.indexOf(pkg) + 1;
    add(pkg, i + 1, col);
    if (pkg.startsWith('@')) {
      const stripped = pkg.slice(1), top = stripped.split('/')[0] || stripped, simple = top.split('-')[0];
      for (const a of [stripped, top, simple]) if (a && a !== pkg) add(a, i + 1, col);
    } else {
      const top = pkg.split('/')[0];
      if (top !== pkg) add(top, i + 1, col);
    }
  });
  return mods;
}

/* ---------- the checks ---------- */
const modFor = (registry, docId) => Object.keys(registry).find(k => registry[k] === docId) || docId.split('/')[0];
export const severity = msg => { const m = msg.toLowerCase(); return m.includes('deprecated') ? 'breaking' : m.includes('legacy') ? 'warning' : 'info'; };

const LEGACY = [
  [/\bprint\s+["']/, 'Legacy Python 2 `print` statement detected. Use `print()` function.', 'python/base'],
  [/except\s+\w+,\s+\w+:/, 'Legacy Python 2 `except` syntax detected. Use `except Exception as e:`.', 'python/base'],
  [/\burllib2\b/, '`urllib2` is deprecated/removed in Python 3. Use `urllib.request` or `requests`.', 'urllib2'],
  [/\bxrange\b/, '`xrange` is removed in Python 3. Use `range`.', 'python/base'],
];
const AUTOMATION = [
  [/\bfind_element_by_\w+/, 'Deprecated Selenium locator method. Use `find_element(By.ID, ...)` syntax.', 'selenium'],
  [/\bwaitForSelector\(/, 'Redundant `waitForSelector` detected. Modern Playwright actions (click, fill) auto-wait.', 'playwright'],
];
const SESSION_MSG = 'aiohttp.ClientSession() should be used with `async with` to ensure proper connection pooling and cleanup.';
const FP16_MSG = 'Argument `fp16=True` is deprecated in `Accelerator`. Use `mixed_precision=\'fp16\'` instead.';

/** Python: legacy syntax, the two AST rules, doc patterns and the automation presets. `patterns` maps doc id → patterns. */
export function analyzePython(code, patterns, registry = REGISTRY) {
  const ls = lines(code), out = [];
  const push = (line, col, message, mod) => out.push({ line, col, message, mod });
  if (ls.some(l => PY2.some(re => re.test(l)))) {
    for (const [re, msg, mod] of LEGACY) ls.forEach((l, i) => { const m = l.match(re); if (m) push(i + 1, m.index + 1, msg, mod); });
  } else {
    ls.forEach((l, i) => {
      // ClientSession() outside an `async with` header; Accelerator(fp16=…)
      const s = l.match(/\b(?:aiohttp\.)?ClientSession\s*\(/);
      if (s && !/\basync\s+with\s+(?:aiohttp\.)?ClientSession\s*\(/.test(l)) push(i + 1, s.index + 1, SESSION_MSG, 'aiohttp');
      const a = l.match(/\bAccelerator\s*\(/);
      if (a && /\bfp16\s*=/.test(l.slice(a.index))) push(i + 1, a.index + 1, FP16_MSG, 'accelerate');
    });
  }
  const synth = (line, col, mod, message) => {
    if (PY_NOQA(ls[line - 1] || '')) return;
    if (out.some(v => v.line === line && v.mod === mod)) return;
    push(line, col, message, mod);
  };
  ls.forEach((l, i) => {
    if (PY_NOQA(l)) return;
    for (const [docId, pats] of patterns) for (const p of pats)
      if (l.includes(p)) synth(i + 1, l.indexOf(p) + 1, modFor(registry, docId), `\`${p}\` is flagged as deprecated or incorrect by chub docs.`);
  });
  for (const [re, msg, mod] of AUTOMATION) ls.forEach((l, i) => { const m = l.match(re); if (m) synth(i + 1, m.index + 1, mod, msg); });
  return out;
}

const JS_QUALITY = [
  [/\bvar\s+\w+/, 'Legacy `var` detected. Use `let` or `const` for modern block-scoping.', 'javascript/base'],
  [/require\(['"]request['"]\)/, 'The `request` library is deprecated. Use `axios`, `node-fetch`, or native `fetch`.', 'request/package'],
  [/\.writeFileSync\(/, 'Blocking synchronous IO detected. Use `fs.promises.writeFile` or `fs.writeFile` to keep the event loop responsive.', 'nodejs/fs'],
  [/\.readFileSync\(/, 'Blocking synchronous IO detected. Use `fs.promises.readFile` for better performance.', 'nodejs/fs'],
];

/** JavaScript (analyze_js_file): doc patterns, the quality rules, then deprecated names used anywhere.
    `current` maps a doc id to its currentUsage text; with `legacy`, the 1.2.1 rules run unchanged. */
export function analyzeJs(code, patterns, registry = REGISTRY, { legacy = false, current = new Map() } = {}) {
  const ls = lines(code), out = [], imports = jsImports(code);
  const seen = new Set();
  const push = (line, col, message, mod, key) => {
    if (!legacy && key) { const k = line + '|' + key; if (seen.has(k)) return; seen.add(k); }
    out.push({ line, col, message, mod });
  };
  const docs = new Set([...imports.keys()].filter(m => registry[m]).map(m => registry[m]));
  for (const docId of docs) for (const p of patterns.get(docId) || []) ls.forEach((l, i) => {
    if (l.includes(p) && !['// noqa: UP', '// noqa: CHUB', '/* noqa: CHUB */'].some(k => l.includes(k)))
      push(i + 1, l.indexOf(p) + 1, `\`${p}\` is flagged as deprecated or incorrect by chub docs.`, modFor(registry, docId), p);
  });
  for (const [re, msg, mod] of JS_QUALITY) ls.forEach((l, i) => {
    if (l.includes('// noqa') || l.includes('/* noqa')) return;
    const m = l.match(re); if (m) push(i + 1, m.index + 1, msg, mod);
  });
  // names inside deprecated patterns ("openai.ChatCompletion.create" → ChatCompletion, create)
  const comps = new Map();
  for (const docId of docs) for (const p of patterns.get(docId) || []) for (const part of p.split(/[\s.]+/)) {
    const c = strip(part, "()'\"`)").trim();
    if (!c || c.length <= 2 || ['import', 'from', 'as', 'const', 'let', 'var', 'new', 'require'].includes(c) || comps.has(c)) continue;
    if (legacy) { if (c[0] !== c[0].toLowerCase() || p.includes('.')) comps.set(c, [docId, p]); continue; }
    // class-like names only (ChatCompletion, LLMChain), and never one the docs' current examples use (OpenAI)
    if (/^[A-Z][A-Za-z0-9_]+$/.test(c) && !word(c).test(current.get(docId) || '')) comps.set(c, [docId, p]);
  }
  const has = (line, n) => legacy ? line.includes(n) : word(n).test(line);
  ls.forEach((line, i) => {
    if (line.includes('// noqa: CHUB') || line.includes('# noqa: CHUB')) return;
    const done = new Set(), t = line.trim();
    for (const docId of docs) for (const p of patterns.get(docId) || []) if (line.includes(p)) {
      const mod = modFor(registry, docId);
      if (!done.has(mod)) { done.add(mod); push(i + 1, line.indexOf(p) + 1, `\`${p}\` is flagged as deprecated by chub docs.`, mod, p); }
    }
    const names = new Set(); let m;
    if ((m = t.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/))) m[1].split(',').forEach(n => names.add(n.trim().split(' as ')[0].trim()));
    if ((m = t.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/))) names.add(m[1]);
    if ((m = t.match(/^(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require/))) m[1].split(',').forEach(n => names.add(n.trim().split(':')[0].trim()));
    for (const n of names) if (comps.has(n)) {
      const [docId, full] = comps.get(n), mod = modFor(registry, docId);
      if (!done.has(mod)) { done.add(mod); push(i + 1, Math.max(1, line.indexOf(n) + 1), `\`${n}\` is deprecated (from pattern: \`${full}\`). See chub docs.`, mod, full); }
    }
    for (const [n, [docId, full]] of comps) {
      if (!has(line, n)) continue;
      const isImport = /^\s*import\s+.*from\s+['"]/.test(line) || /^\s*import\s+['"]/.test(line) || /^\s*#include\s*[<"]/.test(line) ||
        /^\s*import\s+([a-zA-Z0-9_.]+)/.test(line) || (/require\s*\(\s*['"]/.test(line) && /^\s*(const|let|var)\s/.test(line));
      if (isImport || out.some(v => v.line === i + 1 && v.message.includes(n))) continue;
      push(i + 1, Math.max(1, line.indexOf(n) + 1), `\`${n}\` is deprecated (from pattern: \`${full}\`). See chub docs.`, modFor(registry, docId), full);
    }
  });
  return out;
}

/* ---------- the whole check ---------- */
/**
 * Check a snippet. `get(url)` returns the text at a URL, or null. Returns the issues (with severity and doc id),
 * the docs it read, each doc's example of current usage, and the imports it couldn't map to a doc.
 * `legacy: true` runs chub-guard 1.2.1's rules as they are, without the current-usage step.
 */
export async function check(code, lang, get, { registry = REGISTRY, legacy = false } = {}) {
  const js = lang === 'javascript';
  const imports = js ? jsImports(code) : pyImports(code);
  const docIds = [...new Set([...imports.keys()].filter(m => registry[m]).map(m => registry[m]))];
  const unknown = [...imports.keys()].filter(m => !registry[m] && !m.includes('.') && !m.includes('/') && m.length > 2);
  const dbText = docIds.length ? await get(DB_URL) : null;
  let db = {}; try { db = dbText ? JSON.parse(dbText) : {}; } catch { db = {}; }
  const patterns = new Map(), current = new Map(), docs = [];
  await Promise.all(docIds.map(async docId => {
    let text = null, source = null;
    if (js) {
      for (const l of ['javascript', 'typescript']) if ((text = await get(docUrl(docId, l)))) { source = docUrl(docId, l); break; }
      if (!text && (text = await get(`${CACHED}/${docId.replace('/', '__')}__js.md`))) source = 'chub-guard cache';
    } else if ((text = await get(docUrl(docId, 'python')))) source = docUrl(docId, 'python');
    const fromDoc = text ? extractFromDoc(text, js) : [], shared = (db[docId] && db[docId].patterns) || [];
    let all = [...new Set([...fromDoc, ...shared])], cleared = 0;
    if (!legacy) {
      const inUse = text ? currentUsage(text) : '';
      current.set(docId, inUse);
      // a version number alone isn't a pattern; and nothing the doc's own current examples use is deprecated
      const kept = all.filter(p => /[A-Za-z]/.test(p) && !inUse.includes(p));
      cleared = all.length - kept.length; all = kept;
    }
    patterns.set(docId, all);
    docs.push({ id: docId, read: !!text, source, fromDoc: fromDoc.length, shared: shared.length, cleared, hint: text ? extractHint(text, js ? 'javascript' : 'python') : null, page: docPage(docId) });
  }));
  const found = (js ? analyzeJs(code, patterns, registry, { legacy, current }) : analyzePython(code, patterns, registry))
    .map(v => ({ ...v, severity: severity(v.message), docId: registry[v.mod] || null }))
    .sort((a, b) => a.line - b.line || a.col - b.col);
  docs.sort((a, b) => a.id.localeCompare(b.id));
  return { issues: found, docs, unknown, imports: [...imports.keys()] };
}
