/**
 * Single source of truth for branding, pricing policy and inventory syndication.
 * Everything an operator normally needs to change lives in this file.
 */

export type PriceRounding =
  | 'none'        // 42,394.41 -> 42,394
  | 'nearest-5'   // -> 42,395
  | 'nearest-25'  // -> 42,400
  | 'nearest-100' // -> 42,400
  | 'dealer-95';  // -> 42,395  (classic "x,x95" retail ending)

export const siteConfig = {
  name: 'Bassett Court Holdings',
  shortName: 'Bassett Court',
  tagline: 'Considered vehicles, plainly priced.',
  description:
    'Bassett Court Holdings offers a curated selection of new and pre-owned vehicles with transparent pricing, straightforward terms and nationwide delivery.',

  /**
   * Public base URL of the deployed site. Used for canonical tags, sitemap.xml
   * and Open Graph metadata. Set NEXT_PUBLIC_SITE_URL in your host to override.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.bassettcourtholdings.com',

  /**
   * Drop your logo at `public/logo.svg` (or .png) and it is picked up
   * automatically. Until then the site renders a typographic wordmark, so
   * nothing looks broken before the asset lands.
   */
  logo: {
    src: '/logo.svg',
    alt: 'Bassett Court Holdings',
    /** Set false to force the wordmark even when the file exists. */
    enabled: true,
  },

  contact: {
    phone: '(000) 000-0000',
    email: 'sales@bassettcourtholdings.com',
    address: {
      street: '000 Bassett Court',
      city: 'City',
      state: 'ST',
      zip: '00000',
    },
    hours: [
      { days: 'Monday – Friday', open: '9:00 AM', close: '7:00 PM' },
      { days: 'Saturday', open: '9:00 AM', close: '5:00 PM' },
      { days: 'Sunday', open: 'Closed', close: '' },
    ],
  },

  pricing: {
    /**
     * Markup applied to every sourced vehicle price.
     * 0.03 === +3%.
     */
    markupRate: 0.03,

    /** How the marked-up figure is rounded for display. */
    rounding: 'nearest-25' as PriceRounding,

    /**
     * Vehicles arriving without a usable price are published as
     * "Call for Price" rather than being given an invented number.
     */
    callForPriceLabel: 'Call for Price',

    /**
     * Keep the upstream figure in the data file for reconciliation, but never
     * render it in the public UI. Flip to true only if you have a reason to
     * show a comparison price and a basis for the claim.
     */
    showSourcePrice: false,

    /** Rendered under every price. Adjust to match your state's requirements. */
    disclaimer:
      'Price excludes tax, title, license, registration and dealer documentation fees. Availability is subject to prior sale.',
  },

  inventory: {
    /** Upstream site the catalogue is syndicated from. */
    sourceUrl: process.env.INVENTORY_SOURCE_URL ?? 'https://www.escudechevrolet.com/',
    sourceName: 'Escude Chevrolet',

    /** Adapter used by `npm run sync`. See src/lib/sources/. */
    adapter: (process.env.INVENTORY_SOURCE_ADAPTER ?? 'sitemap-jsonld') as
      | 'sitemap-jsonld'
      | 'feed'
      | 'demo',

    /** Optional authorized feed URL for the `feed` adapter. */
    feedUrl: process.env.INVENTORY_FEED_URL ?? '',

    /**
     * Safety valve. If a sync returns fewer than this fraction of the vehicles
     * in the previous snapshot, the run is aborted instead of publishing a
     * near-empty catalogue. A blocked request or a markup change upstream
     * should never be able to silently wipe the site.
     */
    minRetainedFraction: 0.5,

    /** Listings per page on the inventory grid. */
    pageSize: 24,

    /**
     * Shown on listing and detail pages. Required if the vehicles are held by
     * another party — say plainly who has the car and what your role is.
     * Set to null to omit.
     */
    sourcingDisclosure:
      'Vehicles shown are sourced through our dealer network and may be located off-site. Contact us to confirm current availability and arrange inspection or delivery.',
  },

  finance: {
    /** Defaults for the on-page payment estimator. */
    defaultApr: 7.9,
    defaultTermMonths: 72,
    defaultDownPaymentRate: 0.1,
    termOptions: [36, 48, 60, 72, 84],
  },

  nav: [
    { href: '/inventory', label: 'Inventory' },
    { href: '/financing', label: 'Financing' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
