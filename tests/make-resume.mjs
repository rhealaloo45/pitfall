// Print the one-page version (portfolio.html) to the résumé PDF the site offers for download, so the PDF always
// says what the site says. Usage: node tests/make-resume.mjs   → assets/rhea-laloo-resume.pdf
import { serve, ROOT } from './harness.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const { srv, url } = await serve();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url + '/portfolio.html');
await page.waitForSelector('#main h1');
await page.emulateMedia({ media: 'print' });
const out = path.join(ROOT, 'assets/rhea-laloo-resume.pdf');
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close(); srv.close();
console.log('wrote', path.relative(ROOT, out));
