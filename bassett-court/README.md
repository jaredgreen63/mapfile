# Bassett Court Holdings

A vehicle inventory website that keeps itself current: it pulls the upstream
catalogue on a schedule, applies a configurable markup (3% by default), and
publishes the result. Vehicles that appear upstream show up here; vehicles that
are sold or withdrawn upstream come off here. No manual listing management at
either end.

Built with Next.js 16 (App Router), React 19 and Tailwind 4.

---

## Quick start

```bash
cd bassett-court
npm install
npm run sync:demo     # populate data/inventory.json with sample vehicles
npm run dev           # http://localhost:3000
```

`npm run sync:demo` generates a deterministic sample catalogue so you can see
the site working before the live source is connected. Swap it for `npm run sync`
once the source is set up (see below).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run sync` | Pull the live source and rewrite `data/inventory.json` |
| `npm run sync:dry` | Show what a sync would change, write nothing |
| `npm run sync:demo` | Fill the catalogue with sample vehicles |
| `npm test` | Unit tests (68 of them, no network) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run check` | Typecheck + tests |
| `npm run check:responsive` | Fails on horizontal overflow at 10 viewport widths |

---

## Branding

The header shows the lion from the company business card beside a "Bassett
Court / HOLDINGS, LLC." wordmark. The same artwork is the favicon and appears on
the Open Graph card that renders when the site is shared.

| File | Used for |
| --- | --- |
| `public/logo-mark.png` | The lion mark in the header (512×512) |
| `src/app/icon.png` | Browser tab / bookmark icon |
| `src/app/apple-icon.png` | iOS home-screen icon |
| `src/app/opengraph-image.png` | Link preview card (1200×630) |

These were extracted from a phone photo of the printed card, colour-corrected
and deskewed. That is good enough at the sizes used, but it is a photo of a
print: if Daniel has the original lion artwork as a file, dropping it in at
`public/logo-mark.png` (square, 512px or larger) will be visibly sharper. Do the
same for `src/app/icon.png` and `src/app/opengraph-image.png` if you want those
crisp too.

If you later have a full lock-up — mark and name drawn together as one image —
put it at `public/logo.svg` and it replaces the header lock-up entirely. No code
change either way; both paths are checked at build time, with a plain
typographic wordmark as the final fallback so the header is never broken.

## Pricing

Everything lives in [`site.config.ts`](./site.config.ts):

```ts
pricing: {
  markupRate: 0.03,          // +3%
  rounding: 'nearest-25',    // none | nearest-5 | nearest-25 | nearest-100 | dealer-95
  showSourcePrice: false,
  disclaimer: 'Price excludes tax, title, license…',
}
```

Two behaviours worth knowing:

- **A vehicle with no upstream price is published as "Call for Price"**, never
  given an invented number. Unpriced units are also excluded from price-range
  filtering rather than being silently hidden.
- **The upstream figure is kept in the data file** (`sourcePrice`) for your own
  reconciliation, but is not rendered publicly unless you set
  `showSourcePrice: true`.

`rounding: 'dealer-95'` gives classic `$xx,995` endings; `nearest-25` (the
default) gives a clean figure without pretending to be a sticker price.

---

## How the sync works

```
upstream source → adapter → normalize → +3% markup → data/inventory.json → build
```

`npm run sync` replaces the snapshot wholesale rather than merging into it.
That single decision is what gives you add/remove for free: a vehicle that is
not in the new fetch is simply not in the new snapshot, so it leaves the site.

### Adapters

Set `INVENTORY_SOURCE_ADAPTER`, or `inventory.adapter` in `site.config.ts`.

| Adapter | When to use it |
| --- | --- |
| `sitemap-jsonld` *(default)* | Read the source's XML sitemaps, then the schema.org markup on each vehicle detail page. Works without any cooperation from the source. |
| `feed` | **Preferred.** An authorized inventory feed — CSV, JSON or XML. Set `INVENTORY_FEED_URL`. |
| `demo` | Deterministic sample data for development and preview deploys. |

The `sitemap-jsonld` adapter reads and obeys `robots.txt` (including
`Crawl-delay`), identifies itself with a descriptive User-Agent, limits itself
to 4 concurrent requests, and discovers listings through the source's own
published sitemaps rather than guessing at URLs.

**Prefer a real feed.** Ask the source dealership (or their website provider)
for an inventory feed. It is complete, cheap to poll, stable across site
redesigns, and does not depend on their markup staying put. The `feed` adapter
matches column names loosely, so most standard DMS exports work with no mapping.

### Safety valves

- **Shrink guard.** If a run returns fewer than 50% of the vehicles in the
  previous snapshot, it aborts and leaves the existing snapshot in place. A
  source that starts blocking you, or a markup change that breaks parsing,
  cannot quietly empty your catalogue. Override with `--force` when a large drop
  is genuine. Tune via `inventory.minRetainedFraction`.
- **Failure is non-destructive.** If the source is unreachable the sync exits
  non-zero and writes nothing, so the site keeps serving its last good data.
- **Audit trail.** Every run appends to `data/sync-log.json`: what was added,
  removed and repriced, and why a run was rejected.

### Useful flags

```bash
npm run sync -- --dry-run        # report the diff, write nothing
npm run sync -- --limit=25       # cap detail-page fetches while testing
npm run sync -- --source=feed    # override the configured adapter
npm run sync -- --force          # bypass the shrink guard
npm run sync -- --fallback-demo  # fall back to sample data if the source is down
```

---

## Automating it

[`.github/workflows/sync-inventory.yml`](../.github/workflows/sync-inventory.yml)
runs the sync every three hours, verifies the site still builds with the new
data, and commits `data/` if anything changed. The commit is what triggers a
redeploy on any host wired to this branch.

Configure in **Settings → Secrets and variables → Actions**:

| Name | Kind | Purpose |
| --- | --- | --- |
| `INVENTORY_SOURCE_URL` | Variable | Upstream site, if different from the config default |
| `INVENTORY_SOURCE_ADAPTER` | Variable | `sitemap-jsonld`, `feed` or `demo` |
| `INVENTORY_FEED_URL` | Secret | Authorized feed URL, for the `feed` adapter |
| `DEPLOY_HOOK_URL` | Secret | Optional — only if your host does not redeploy on push |

You can also run it by hand from the Actions tab, choosing the adapter and
whether to bypass the shrink guard. The workflow rebases and retries if a
scheduled run collides with a human push, and writes a summary of every run
(added / removed / repriced) to the job page.

To change the cadence, edit the `cron` line. Every three hours is a deliberate
choice: dealer inventory does not move faster than that, and a gentler schedule
keeps you a good citizen of the upstream site.

---

## Deploying

The app needs a Node runtime (the enquiry form is a route handler). Any of
Vercel, Netlify, Cloudflare Pages, Render, Fly or a plain VPS will do.

**Vercel** — import the repo, set **Root Directory** to `bassett-court`, deploy.
Everything else is detected. Add `NEXT_PUBLIC_SITE_URL` so canonical URLs,
`sitemap.xml` and Open Graph tags point at your real domain.

Environment variables (all optional — see [`.env.example`](./.env.example)):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public base URL, for canonical tags and the sitemap |
| `INVENTORY_SOURCE_URL` | Upstream source |
| `INVENTORY_SOURCE_ADAPTER` | Which adapter the sync uses |
| `INVENTORY_FEED_URL` | Authorized feed URL |
| `LEAD_WEBHOOK_URL` | Where enquiries are delivered — see below |

### Enquiry form

`POST /api/inquiry` validates the submission, drops honeypot hits, and forwards
the lead to `LEAD_WEBHOOK_URL` if one is set. That URL can be a CRM endpoint, a
Zapier or Make webhook, or an email service — whichever you already use.

**With no webhook configured, leads are written to the server log only.** Set
`LEAD_WEBHOOK_URL` before you send traffic to the site, or you will lose
enquiries.

---

## Project layout

```
bassett-court/
├── site.config.ts              Branding, pricing, contact, source — start here
├── data/
│   ├── inventory.json          The published snapshot (committed)
│   └── sync-log.json           Per-run record of what changed
├── scripts/
│   ├── sync-inventory.ts       The sync CLI
│   └── check-responsive.mjs    Overflow check across viewport widths
├── src/
│   ├── app/                    Routes: home, inventory, VDP, financing, about,
│   │                           contact, privacy, sitemap.xml, robots.txt
│   ├── components/             Header, footer, cards, filters, gallery, forms
│   └── lib/
│       ├── sources/            Adapters, HTTP/robots, JSON-LD + HTML extraction
│       ├── pricing.ts          Markup, rounding, payment maths
│       ├── normalize.ts        Raw record → canonical Vehicle
│       ├── diff.ts             Snapshot comparison
│       └── inventory.ts        Snapshot reads, facets
└── tests/                      Unit tests, no network required
```

### What the site includes

Home page with live inventory stats and a featured vehicle · inventory browser
with search, nine facets, five sort orders and shareable filter URLs · vehicle
detail pages with gallery, spec table, equipment list, payment estimator and an
enquiry form · financing, about, contact and privacy pages · light and dark
themes with a toggle and no flash on load · `sitemap.xml` and `robots.txt`
generated from live data · schema.org `Car` markup on every listing for vehicle
rich results · skip link, focus rings, labelled controls and reduced-motion
support throughout.

Listings without photography render a body-style silhouette tinted from the
vehicle's own exterior colour, so the grid looks deliberate before real photos
arrive and stays intact when a source image 404s.

---

## Before you go live

Two things need your attention, and neither is a code change:

1. **Confirm you are permitted to syndicate this inventory.** Republishing
   another dealership's listings generally needs their agreement — both for the
   data itself and for their photography, which is usually separately licensed.
   Asking also gets you a proper feed, which is a better integration than
   crawling in every respect. If the arrangement is already in place, nothing
   here changes.

2. **Make sure the listings are not misleading about who holds the vehicle.**
   `inventory.sourcingDisclosure` in `site.config.ts` renders on listing and
   detail pages and in the footer; it currently reads *"Vehicles shown are
   sourced through our dealer network and may be located off-site."* Adjust the
   wording to match your actual arrangement. Motor vehicle advertising rules are
   state-specific and the placeholder disclaimers here — including the privacy
   page — are a starting point for your counsel, not legal advice.

Contact details are set from the company business card: Daniel Holbrook,
(864) 707-1563, danholbrook08@gmail.com, Liberty, SC. Two things there are
assumptions rather than facts, so check them:

- **Hours read "By appointment."** No street address or opening hours were
  supplied, and advertising walk-in hours for an address that is not published
  would be inventing them. Set real hours in `site.config.ts` once there is a
  storefront.
- **No street address is published.** `contact.address.street` is `null`, and
  the site renders "Liberty, SC" wherever an address appears. Fill the field in
  and the full address appears everywhere automatically.

Also before launch: set `LEAD_WEBHOOK_URL` so enquiries actually reach an inbox,
set `NEXT_PUBLIC_SITE_URL` to the real domain, and run
`npm run sync -- --dry-run` against the live source to confirm the adapter finds
what you expect.

---

## A note on the adapter

The default `sitemap-jsonld` adapter targets the schema.org `Vehicle` / `Car`
markup that every major dealer website platform emits, because Google requires
it for vehicle rich results. It is covered by unit tests against representative
markup, including malformed JSON-LD, `@graph` nesting, `QuantitativeValue`
odometer wrappers and MSRP-vs-asking-price disambiguation.

It has **not** been run against the live source, because the network this was
built on blocks outbound requests to that host. Before relying on it, run:

```bash
npm run sync -- --dry-run --limit=25
```

from a machine with normal network access. That prints how many URLs the
sitemaps advertise, how many look like vehicle detail pages, and how many parsed
successfully — enough to tell in one run whether the selectors need adjusting
for this particular site. If the count comes back low or zero, the `feed`
adapter is the better path anyway.
