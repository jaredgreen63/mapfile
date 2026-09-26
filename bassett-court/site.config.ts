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
  /** Full registered entity name, used where the legal name belongs. */
  legalName: 'Bassett Court Holdings, LLC.',
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
    /**
     * Optional full lock-up (mark + name as one image). Drop a file here and it
     * replaces the header lock-up entirely.
     */
    src: '/logo.svg',
    /** The lion mark, taken from the company business card. */
    mark: '/logo-mark.png',
    alt: 'Bassett Court Holdings, LLC.',
    /** Set false to force the plain typographic wordmark. */
    enabled: true,
  },

  /**
   * Where the vehicles physically are. Named plainly on listings, detail pages
   * and the footer, because a buyer should never have to guess which lot the
   * car they are looking at is standing on.
   */
  location: {
    dealer: 'Escude Chevrolet of Easley',
    street: '5010 Old Easley Bridge Rd',
    city: 'Easley',
    state: 'SC',
    zip: '29642',
    /** Short form for listing cards. */
    short: 'Easley, SC',
    get oneLine() {
      return `${this.street}, ${this.city}, ${this.state} ${this.zip}`;
    },
    get mapsUrl() {
      return `https://maps.google.com/?q=${encodeURIComponent(
        `${this.dealer}, ${this.street}, ${this.city}, ${this.state} ${this.zip}`,
      )}`;
    },
  },

  contact: {
    name: 'Daniel Holbrook',
    phone: '(864) 707-1563',
    email: 'danholbrook08@gmail.com',
    address: {
      /** No street address published yet — set this and it renders everywhere. */
      street: null as string | null,
      city: 'Liberty',
      state: 'SC',
      stateFull: 'South Carolina',
      zip: '',
    },
    /**
     * Viewings are by appointment until a storefront address is published.
     * Replace with real opening hours once there is one.
     */
    hours: [
      { days: 'Monday – Saturday', open: 'By appointment', close: '' },
      { days: 'Sunday', open: 'Closed', close: '' },
    ],
  },

  pricing: {
    /**
     * Markup applied to every sourced vehicle price. 0 publishes the source
     * price unchanged; 0.03 would add 3%.
     */
    markupRate: 0,

    /**
     * How the published figure is rounded. With no markup, 'none' passes the
     * source price straight through — rounding it would move a price nobody
     * asked to move.
     */
    rounding: 'none' as PriceRounding,

    /**
     * Vehicles arriving without a usable price are published as
     * "Call for Price" rather than being given an invented number.
     */
    callForPriceLabel: 'Call for Price',

    /**
     * Keep the upstream figure in the data file for reconciliation. With no
     * markup it is identical to the published price, so there is nothing to
     * compare and nothing to show.
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
     * A feed may flag a sold vehicle as unavailable rather than dropping it
     * from the export. Those are never published — that is what takes a sold
     * car off the site. Vehicles marked "pending" are still shown by default,
     * since a pending sale often falls through; set this false to hide them.
     */
    publishPending: true,

    /**
     * Shown on listing and detail pages. Required if the vehicles are held by
     * another party — say plainly who has the car and what your role is.
     * Set to null to omit.
     */
    sourcingDisclosure:
      'Vehicles shown are located at Escude Chevrolet of Easley, 5010 Old Easley Bridge Rd, Easley, SC 29642. Contact us to confirm current availability and arrange a viewing, test drive or delivery.',
  },

  booking: {
    /** How many selectable days the day picker offers, starting from today. */
    daysAhead: 7,
    timeSlots: ['Morning', 'Afternoon', 'Evening'] as const,
    tradeInOptions: ['Not sure', 'Yes — I have a trade-in', 'No trade-in'] as const,
    /** Shown under the submit button. */
    reassurance: 'No payment or commitment — we reach out to confirm a time that works.',
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
    { href: '/appointment', label: 'Book Appointment' },
    { href: '/financing', label: 'Financing' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
