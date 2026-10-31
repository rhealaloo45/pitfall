// Local preview: the static site plus its Pages Functions (/api/*), like Cloudflare Pages serves it.
// Usage: npm run dev   (PORT=4174 by default). _redirects isn't applied, so this always shows the full site.
import { serve } from './harness.mjs';
const { url } = await serve(+(process.env.PORT || 4174));
console.log(`Portfolio running at ${url}/`);
