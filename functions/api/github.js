/* GET /api/github: Rhea's contribution graph for the last year, as JSON ({ total, days: [{ date, level, count }] }).
   A Cloudflare Pages Function, because browsers can't read github.com's contribution graph directly. It only ever asks
   for this one profile, and the answer is cached at the edge for six hours. */
const USER = 'rhealaloo45';
const MAX_AGE = 6 * 60 * 60;

export function parseContributions(html) {
  const days = new Map();
  for (const m of html.matchAll(/<td\b([^>]*\bdata-date="[^"]+"[^>]*)>/g)) {
    const a = m[1], date = (a.match(/data-date="([^"]+)"/) || [])[1], level = +((a.match(/data-level="(\d)"/) || [])[1] || 0), id = (a.match(/\bid="([^"]+)"/) || [])[1];
    if (date) days.set(id || date, { date, level, count: level ? null : 0 });
  }
  // the tooltips carry the counts: "5 contributions on October 26th." / "No contributions on …"
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/tool-tip>/g)) {
    const d = days.get(m[1]), n = m[2].match(/^(\d[\d,]*|No) contributions?/i);
    if (d && n) d.count = /^no$/i.test(n[1]) ? 0 : +n[1].replace(/,/g, '');
  }
  const total = +(((html.match(/([\d,]+)\s+contributions?\s+in the last year/) || [])[1] || '').replace(/,/g, '')) || null;
  return { total, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

const json = (body, status, maxAge) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
});

export async function onRequestGet({ request, waitUntil }) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(new URL('/api/github', request.url).toString());
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  let res;
  try {
    const r = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { 'user-agent': 'rhealaloo.com contribution graph' } });
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    const data = parseContributions(await r.text());
    if (!data.days.length) throw new Error('no contribution data in the page');
    res = json({ user: USER, ...data }, 200, MAX_AGE);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502, 60);
  }
  if (cache && waitUntil) waitUntil(cache.put(key, res.clone()));
  return res;
}
