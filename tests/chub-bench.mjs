// How well does the playground's port of chub-guard tell deprecated code from current code?
// Runs a small labelled set of snippets against the live Context Hub docs, twice: with chub-guard 1.2.1's rules
// as shipped ("1.2.1"), and with the current-usage step the playground adds ("playground").
// Usage: node tests/chub-bench.mjs [--json]      (needs network; docs are fetched with curl)
import { execFileSync } from 'node:child_process';
import { check } from '../src/landing/chub-engine.js';

const cache = new Map();
const get = async url => {
  if (!cache.has(url)) { let t = null; try { t = execFileSync('curl', ['-s', '-f', '-m', '30', url], { encoding: 'utf8' }); } catch { t = null; } cache.set(url, t); }
  return cache.get(url);
};

// each case: the language, the code, and the 1-based lines that really use something deprecated
export const CASES = [
  { name: 'OpenAI, pre-1.0 module calls', lang: 'python', bad: [3, 4, 6], code:
`import openai

completion = openai.Completion.create(
    model="text-davinci-003", prompt="Hello")

chat = openai.ChatCompletion.create(
    model="gpt-4o-mini", messages=[{"role": "user", "content": "Hello"}])` },
  { name: 'Gemini, the old google.generativeai SDK', lang: 'python', bad: [1, 3, 4, 5], code:
`import google.generativeai as genai

genai.configure(api_key="...")
model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content("Explain RAG in one line")` },
  { name: 'Anthropic, legacy text completions', lang: 'python', bad: [1, 4, 5, 7], code:
`from anthropic import Anthropic, HUMAN_PROMPT, AI_PROMPT

client = Anthropic()
completion = client.completions.create(
    model="claude-2",
    max_tokens_to_sample=300,
    prompt=f"{HUMAN_PROMPT} Summarise this log{AI_PROMPT}")` },
  { name: 'LangChain, pre-1.0 chains', lang: 'python', bad: [1, 2, 5], code:
`from langchain.llms import OpenAI
from langchain.chains import LLMChain

llm = OpenAI(temperature=0)
chain = LLMChain(llm=llm, prompt=prompt)` },
  { name: 'Selenium, removed locator methods', lang: 'python', bad: [4, 5], code:
`from selenium import webdriver

driver = webdriver.Chrome()
driver.find_element_by_id("username").send_keys("rhea")
driver.find_element_by_name("submit").click()` },
  { name: 'Node, old habits', lang: 'javascript', bad: [1, 3, 4], code:
`const request = require('request');
const fs = require('fs');
var config = JSON.parse(fs.readFileSync('config.json'));
request(config.url, (err, res, body) => { fs.writeFileSync('out.json', body); });` },
  { name: 'OpenAI (current): Responses API', lang: 'python', bad: [], code:
`from openai import OpenAI

client = OpenAI()
response = client.responses.create(model="gpt-5", input="Hello")
print(response.output_text)` },
  { name: 'OpenAI (current): chat completions', lang: 'python', bad: [], code:
`from openai import OpenAI

client = OpenAI()
completion = client.chat.completions.create(
    model="gpt-5", messages=[{"role": "user", "content": "Hello"}])
print(completion.choices[0].message.content)` },
  { name: 'Anthropic (current): Messages API', lang: 'python', bad: [], code:
`import anthropic

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}])
print(message.content[0].text)` },
  { name: 'Gemini (current): google-genai SDK', lang: 'python', bad: [], code:
`from google import genai

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash", contents="Explain RAG in one line")
print(response.text)` },
  { name: 'LangChain (current): init_chat_model', lang: 'python', bad: [], code:
`from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-5", model_provider="openai")
print(model.invoke("Hello").content)` },
  { name: 'OpenAI (current), JavaScript', lang: 'javascript', bad: [], code:
`import OpenAI from "openai";

const client = new OpenAI();
const completion = await client.chat.completions.create({
  model: "gpt-5", messages: [{ role: "user", content: "Hello" }] });
console.log(completion.choices[0].message.content);` },
  { name: 'Anthropic (current), JavaScript', lang: 'javascript', bad: [], code:
`import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const message = await client.messages.create({
  model: "claude-sonnet-4-5", max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }] });
console.log(message.content[0].text);` },
];

export async function bench(getter = get) {
  const rows = [], total = { legacy: { tp: 0, fp: 0, fn: 0 }, now: { tp: 0, fp: 0, fn: 0 } };
  for (const c of CASES) {
    const row = { name: c.name, current: !c.bad.length };
    for (const [key, legacy] of [['legacy', true], ['now', false]]) {
      const r = await check(c.code, c.lang, getter, { legacy });
      const flagged = [...new Set(r.issues.map(i => i.line))];
      const tp = flagged.filter(l => c.bad.includes(l)).length, fp = flagged.length - tp, fn = c.bad.length - tp;
      row[key] = { tp, fp, fn, wrong: flagged.filter(l => !c.bad.includes(l)), missed: c.bad.filter(l => !flagged.includes(l)) };
      total[key].tp += tp; total[key].fp += fp; total[key].fn += fn;
    }
    rows.push(row);
  }
  const score = t => ({ ...t, precision: t.tp + t.fp ? t.tp / (t.tp + t.fp) : 1, recall: t.tp + t.fn ? t.tp / (t.tp + t.fn) : 1 });
  return { rows, legacy: score(total.legacy), now: score(total.now), lines: CASES.reduce((a, c) => a + c.code.split('\n').length, 0), deprecated: CASES.reduce((a, c) => a + c.bad.length, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await bench();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    const pct = x => (x * 100).toFixed(0) + '%';
    console.log(`${CASES.length} snippets, ${r.lines} lines, ${r.deprecated} of them really deprecated\n`);
    console.log('snippet'.padEnd(44), '1.2.1 rules'.padEnd(22), 'playground');
    for (const row of r.rows) {
      const cell = x => `${x.tp} caught${x.fp ? `, ${x.fp} wrong` : ''}${x.fn ? `, ${x.fn} missed` : ''}`;
      console.log(row.name.padEnd(44), cell(row.legacy).padEnd(22), cell(row.now));
    }
    for (const [label, t] of [['1.2.1 rules', r.legacy], ['playground', r.now]])
      console.log(`\n${label}: ${t.tp} deprecated lines caught, ${t.fp} current lines wrongly flagged, ${t.fn} missed · precision ${pct(t.precision)} · recall ${pct(t.recall)}`);
  }
}
