/**
 * Guards against horizontal overflow — the failure mode that makes a site feel
 * broken on a phone and that no unit test can catch. Checks every page at ten
 * viewport widths and reports the element responsible for any overflow.
 *
 *   npm run check:responsive          # against http://127.0.0.1:3100
 *   BASE=https://staging.example.com npm run check:responsive
 */
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://127.0.0.1:3100';
const widths = [360, 390, 414, 640, 768, 820, 1024, 1280, 1440, 1920];
const paths = ['/', '/inventory', '/financing', '/about', '/contact', '/privacy'];

// Use a preinstalled Chromium when the environment provides one (as CI images
// and dev containers often do), otherwise let Playwright resolve its own.
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox'],
});

let failures = 0;
const slug = await (async () => {
  const page = await browser.newPage();
  await page.goto(`${base}/inventory`, { waitUntil: 'domcontentloaded' });
  const href = await page.getAttribute('a[href^="/inventory/"]', 'href');
  await page.close();
  return href;
})();
if (slug) paths.push(slug);

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const path of paths) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    const info = await page.evaluate(() => {
      const de = document.documentElement;
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 60),
            width: Math.round(r.width),
            right: Math.round(r.right),
          });
        }
      }
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: offenders.slice(0, 4) };
    });
    if (info.scrollWidth > info.clientWidth + 1) {
      failures += 1;
      console.log(`OVERFLOW ${width}px ${path} scroll=${info.scrollWidth} client=${info.clientWidth}`);
      for (const o of info.offenders) console.log(`    <${o.tag}> w=${o.width} right=${o.right} "${o.cls}"`);
    }
  }
  await page.close();
}

await browser.close();
console.log(failures === 0 ? `No horizontal overflow across ${widths.length} widths x ${paths.length} pages.` : `${failures} overflowing page/width combination(s).`);
process.exit(failures === 0 ? 0 : 1);
