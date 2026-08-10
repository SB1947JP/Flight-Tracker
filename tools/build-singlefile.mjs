/**
 * Bundles the built app into one self-contained HTML fragment.
 *
 *   npm run build && node tools/build-singlefile.mjs
 *
 * Output is `dist/single.html`: the stylesheet and the script inlined, no
 * external references at all. That is what makes the app publishable as a
 * Claude Artifact, which serves a single page under a CSP that blocks every
 * outside host — and it only works at all because this app already had no
 * external requests to lose. A tile-server basemap would simply not render
 * there; the bundled coastline does.
 *
 * The output deliberately omits <!doctype>, <html>, <head> and <body>: the
 * Artifact host supplies those and wraps this content.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = readdirSync(join(dist, 'assets'));

const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8'));
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8'));

if (js.length !== 1) throw new Error(`expected exactly one JS chunk, found ${js.length}`);

// A literal "</script>" anywhere in the bundle would close the tag early and
// dump the rest of the app into the page as text. The escape is invisible to
// the JS parser inside a string, which is the only place it can legally appear.
const script = js[0].replaceAll('</script', '<\\/script');

writeFileSync(
  join(dist, 'single.html'),
  `<title>Flight Tracker</title>
<style>
${css.join('\n')}
/* index.html carries these on <body>, but the Artifact host owns that tag and
   this build drops it — so the ground and the height are painted here instead.
   Without the explicit background the page would composite onto whatever the
   host paints, and a viewer in light mode would get light behind a dark app.
   This app commits to one dark visual world on purpose (it is read in a dim
   cabin as often as anywhere), so there is no light theme to switch to — but
   that has to be a stated choice rather than an omission. */
body { background: #0a0a0a; color: #e4e4e7; }
#root { height: 100dvh; }
</style>
<div id="root"></div>
<script type="module">
${script}
</script>
`,
);

const bytes = readFileSync(join(dist, 'single.html')).length;
console.log(`dist/single.html — ${(bytes / 1024).toFixed(1)} kB`);
