// The browser port of chub-guard's documentation checks (src/landing/chub-engine.js), against small sample docs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFromDoc, extractHint, pyImports, jsImports, analyzePython, analyzeJs, check, DB_URL, docUrl } from '../src/landing/chub-engine.js';

const DOC = [
  '# OpenAI',
  '## Usage',
  '```python',
  'from openai import OpenAI',
  'client = OpenAI()',
  '```',
  '- `openai.Completion.create` is deprecated → use `client.responses.create` instead',
  '- Recommended: `client.responses.create`',
  '## Migration',
  'Old: `engine=`, `openai.api_base`',
  '❌ Incorrect',
  '```python',
  'resp = Legacy.Thing.call()',
  '```',
].join('\n');

test('reads deprecated patterns from a doc (left of the arrow, migration section, ❌ blocks)', () => {
  const p = extractFromDoc(DOC);
  assert.ok(p.includes('openai.Completion.create'));
  assert.ok(!p.includes('client.responses.create'), 'the replacement is not flagged');
  assert.ok(p.includes('engine=') && p.includes('openai.api_base'), 'migration section');
  assert.ok(p.includes('Legacy.Thing.call'), '❌ code block');
});

test('finds the doc\'s current-usage example', () => {
  assert.equal(extractHint(DOC, 'python'), 'from openai import OpenAI\nclient = OpenAI()');
});

test('reads imports the way chub-guard does', () => {
  const py = pyImports('import google.generativeai as genai\nfrom langchain.llms import OpenAI\nimport openai  # noqa: CHUB');
  assert.deepEqual([...py.keys()].sort(), ['google', 'google.generativeai', 'langchain', 'langchain.llms']);
  assert.equal(pyImports('print "hi"\nimport openai').size, 0, 'Python 2 code: the parser fails, so no imports');
  const js = jsImports("import Anthropic from '@anthropic-ai/sdk';\nconst x = require('openai');");
  assert.ok(['@anthropic-ai/sdk', 'anthropic-ai/sdk', 'anthropic-ai', 'anthropic', 'openai'].every(k => js.has(k)));
});

test('flags Python lines, once per module per line, and respects noqa', () => {
  const pats = new Map([['openai/package', ['openai.Completion.create', 'text-davinci-003']]]);
  const out = analyzePython('import openai\nopenai.Completion.create(engine="text-davinci-003")\nopenai.Completion.create()  # noqa: CHUB', pats);
  assert.equal(out.length, 1);
  assert.equal(out[0].line, 2);
  assert.equal(out[0].mod, 'openai');
});

test('Python presets: Selenium locators, Python 2 syntax, aiohttp sessions', () => {
  assert.match(analyzePython('driver.find_element_by_id("x")', new Map())[0].message, /Selenium/);
  assert.ok(analyzePython('print "hi"\nfor i in xrange(3): pass', new Map()).some(v => /xrange/.test(v.message)));
  assert.equal(analyzePython('s = aiohttp.ClientSession()', new Map()).length, 1);
  assert.equal(analyzePython('async with aiohttp.ClientSession() as s:', new Map()).length, 0);
});

test('JavaScript quality rules', () => {
  const out = analyzeJs("const request = require('request');\nvar x = fs.readFileSync('a');", new Map());
  assert.ok(out.some(v => /request/.test(v.message)) && out.some(v => /var/.test(v.message)) && out.some(v => /Blocking/.test(v.message)));
});

test('the whole check: imports → docs + shared patterns → issues with severity', async () => {
  const pages = {
    [docUrl('openai/package', 'python')]: DOC,
    [DB_URL]: JSON.stringify({ 'openai/package': { patterns: ['text-davinci-003'] } }),
  };
  const r = await check('import openai\nopenai.Completion.create(model="text-davinci-003")', 'python', async u => pages[u] || null);
  assert.equal(r.docs[0].id, 'openai/package');
  assert.ok(r.docs[0].read && r.docs[0].hint);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].severity, 'breaking');
  assert.equal(r.issues[0].docId, 'openai/package');
});
