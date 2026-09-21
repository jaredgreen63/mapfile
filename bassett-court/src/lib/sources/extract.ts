import type { RawVehicle } from '../types';

/**
 * Extractors for vehicle detail pages.
 *
 * Nearly every major dealer website platform (Dealer.com, DealerOn, Dealer
 * Inspire, Sincro, fusionZONE, Dealer eProcess) publishes schema.org markup on
 * its vehicle detail pages, because Google requires it for vehicle listing
 * rich results. That makes JSON-LD the one extraction path worth treating as
 * primary; the HTML fallbacks below only exist to catch the stragglers.
 */

const SCRIPT_LD_JSON = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(SCRIPT_LD_JSON)) {
    const payload = match[1]?.trim();
    if (!payload) continue;
    try {
      blocks.push(JSON.parse(stripJsonComments(payload)));
    } catch {
      // Some platforms emit trailing commas or embedded HTML entities. One
      // repair pass covers the common cases; anything worse is skipped.
      try {
        blocks.push(JSON.parse(repairJson(payload)));
      } catch {
        /* unparseable block — ignore */
      }
    }
  }
  return blocks;
}

function stripJsonComments(input: string): string {
  return input.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function repairJson(input: string): string {
  return stripJsonComments(input)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Walk arbitrarily nested JSON-LD (@graph, arrays, offers) collecting nodes. */
export function flattenJsonLd(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) flattenJsonLd(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    out.push(record);
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') flattenJsonLd(value, out);
    }
  }
  return out;
}

const VEHICLE_TYPES = new Set([
  'vehicle',
  'car',
  'automobile',
  'motorcycle',
  'truck',
  'motorizedbicycle',
  'busortruck',
]);

function typesOf(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.split('/').pop()!.toLowerCase());
}

function isVehicleNode(node: Record<string, unknown>): boolean {
  const types = typesOf(node);
  if (types.some((t) => VEHICLE_TYPES.has(t))) return true;
  // A Product carrying a VIN or an odometer reading is a vehicle listing.
  if (types.includes('product')) {
    return 'vehicleIdentificationNumber' in node || 'mileageFromOdometer' in node;
  }
  return false;
}

function scalar(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (Array.isArray(value)) return scalar(value[0]);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // schema.org QuantitativeValue / PropertyValue / Brand wrappers.
    for (const key of ['value', 'name', '@value', 'identifier']) {
      if (key in record) return scalar(record[key]);
    }
  }
  return null;
}

function imageList(value: unknown): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  const urls: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      urls.push(item);
    } else if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const url = record.url ?? record.contentUrl ?? record['@id'];
      if (typeof url === 'string') urls.push(url);
    }
  }
  return urls;
}

function priceFromOffers(node: Record<string, unknown>): { price: number | null; msrp: number | null } {
  const offers = node.offers;
  const candidates = flattenJsonLd(offers ?? null);
  let price: number | null = null;
  let msrp: number | null = null;

  for (const offer of candidates) {
    const rawPrice = scalar(offer.price ?? offer.lowPrice ?? offer.highPrice);
    const parsed = toNumber(rawPrice);
    if (parsed != null && parsed > 0 && (price == null || parsed < price)) price = parsed;

    // MSRP is conventionally carried as a PriceSpecification with a
    // priceType of MSRP / ListPrice / SRP.
    const spec = offer.priceSpecification;
    for (const specNode of flattenJsonLd(spec ?? null)) {
      const type = String(scalar(specNode.priceType) ?? '').toLowerCase();
      const value = toNumber(scalar(specNode.price));
      if (value != null && value > 0 && /msrp|list|srp|suggested/.test(type)) {
        msrp = value;
      }
    }
  }

  return { price, msrp };
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function conditionFrom(node: Record<string, unknown>): string | null {
  const direct = scalar(node.itemCondition ?? node.vehicleCondition);
  if (typeof direct === 'string') {
    const lower = direct.toLowerCase();
    if (lower.includes('new')) return 'new';
    if (lower.includes('used') || lower.includes('refurbished')) return 'used';
    if (lower.includes('certified')) return 'certified';
  }
  const offerCondition = flattenJsonLd(node.offers ?? null)
    .map((offer) => scalar(offer.itemCondition))
    .find((value): value is string => typeof value === 'string');
  if (offerCondition) {
    const lower = offerCondition.toLowerCase();
    if (lower.includes('new')) return 'new';
    if (lower.includes('used')) return 'used';
  }
  return null;
}

/** Pull a vehicle out of a detail page's JSON-LD, if one is present. */
export function vehicleFromJsonLd(html: string, sourceUrl: string): RawVehicle | null {
  const nodes = extractJsonLdBlocks(html).flatMap((block) => flattenJsonLd(block));
  const node = nodes.find(isVehicleNode);
  if (!node) return null;

  const { price, msrp } = priceFromOffers(node);
  const name = scalar(node.name);
  const parsedName = typeof name === 'string' ? parseVehicleName(name) : null;

  const make = scalar(node.manufacturer ?? node.brand) ?? parsedName?.make ?? null;
  const model = scalar(node.model) ?? parsedName?.model ?? null;

  return {
    vin: str(scalar(node.vehicleIdentificationNumber ?? node.sku)),
    stockNumber: str(scalar(node.sku ?? node.productID ?? node.mpn)),
    condition: conditionFrom(node),
    year: scalar(node.vehicleModelDate ?? node.modelDate ?? node.productionDate) ?? parsedName?.year ?? null,
    make: str(make),
    model: str(model),
    trim: str(scalar(node.vehicleConfiguration ?? node.trim)) ?? parsedName?.trim ?? null,
    bodyStyle: str(scalar(node.bodyType)),
    drivetrain: str(scalar(node.driveWheelConfiguration)),
    transmission: str(scalar(node.vehicleTransmission)),
    fuelType: str(scalar(node.fuelType)),
    engine: str(scalar(node.vehicleEngine)),
    exteriorColor: str(scalar(node.color)),
    interiorColor: str(scalar(node.vehicleInteriorColor)),
    doors: toNumber(scalar(node.numberOfDoors)),
    mileage: toNumber(scalar(node.mileageFromOdometer)),
    price,
    msrp,
    images: imageList(node.image),
    features: [],
    description: str(scalar(node.description)),
    sourceUrl,
  };
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/** "2025 Chevrolet Silverado 1500 LT Trail Boss" -> parts. */
export function parseVehicleName(name: string): { year: number | null; make: string | null; model: string | null; trim: string | null } {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/\b(19|20)\d{2}\b/);
  const year = match ? Number.parseInt(match[0], 10) : null;

  const afterYear = match ? cleaned.slice(match.index! + match[0].length).trim() : cleaned;
  const words = afterYear.split(' ').filter(Boolean);
  if (!words.length) return { year, make: null, model: null, trim: null };

  return {
    year,
    make: words[0] ?? null,
    model: words[1] ?? null,
    trim: words.length > 2 ? words.slice(2).join(' ') : null,
  };
}

/**
 * Last-ditch extraction for pages without JSON-LD: Open Graph tags plus the
 * data attributes dealer platforms attach to their tracking payloads.
 */
export function vehicleFromHtmlFallback(html: string, sourceUrl: string): RawVehicle | null {
  const title = meta(html, 'og:title') ?? titleTag(html);
  if (!title) return null;

  const parsed = parseVehicleName(title);
  if (!parsed.make || !parsed.model) return null;

  const vin = dataAttr(html, 'vin') ?? html.match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0] ?? null;
  const price = toNumber(dataAttr(html, 'price') ?? dataAttr(html, 'internetprice') ?? meta(html, 'product:price:amount'));

  // Without JSON-LD to lean on, a two-word page title is not enough to call
  // something a vehicle — "Contact Us" parses into a make and model just as
  // readily as "Chevrolet Tahoe" does. Require at least one piece of
  // corroborating evidence that this page really is a listing.
  const looksLikeListing = parsed.year != null || vin != null || price != null;
  if (!looksLikeListing) return null;

  return {
    vin,
    stockNumber: dataAttr(html, 'stocknum') ?? dataAttr(html, 'stock-number') ?? dataAttr(html, 'stock'),
    condition: dataAttr(html, 'vehicletype') ?? dataAttr(html, 'condition') ?? inferConditionFromUrl(sourceUrl),
    year: parsed.year,
    make: dataAttr(html, 'make') ?? parsed.make,
    model: dataAttr(html, 'model') ?? parsed.model,
    trim: dataAttr(html, 'trim') ?? parsed.trim,
    bodyStyle: dataAttr(html, 'bodystyle') ?? dataAttr(html, 'body-style'),
    drivetrain: dataAttr(html, 'drivetrain') ?? dataAttr(html, 'drive-line'),
    transmission: dataAttr(html, 'transmission'),
    fuelType: dataAttr(html, 'fueltype') ?? dataAttr(html, 'fuel-type'),
    engine: dataAttr(html, 'engine'),
    exteriorColor: dataAttr(html, 'exteriorcolor') ?? dataAttr(html, 'ext-color'),
    interiorColor: dataAttr(html, 'interiorcolor') ?? dataAttr(html, 'int-color'),
    doors: null,
    mileage: toNumber(dataAttr(html, 'odometer') ?? dataAttr(html, 'mileage')),
    price,
    msrp: toNumber(dataAttr(html, 'msrp')),
    images: [meta(html, 'og:image')].filter((url): url is string => Boolean(url)),
    features: [],
    description: meta(html, 'og:description') ?? meta(html, 'description'),
    sourceUrl,
  };
}

function inferConditionFromUrl(url: string): string | null {
  if (/\/new[-/]/i.test(url)) return 'new';
  if (/\/(used|pre-?owned)[-/]/i.test(url)) return 'used';
  if (/certified/i.test(url)) return 'certified';
  return null;
}

function meta(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const alternate = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
    'i',
  );
  const value = html.match(pattern)?.[1] ?? html.match(alternate)?.[1] ?? null;
  return value ? decodeEntities(value.trim()) : null;
}

function titleTag(html: string): string | null {
  const value = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return value ? decodeEntities(value.trim()) : null;
}

function dataAttr(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = html.match(new RegExp(`data-${escaped}=["']([^"']+)["']`, 'i'))?.[1];
  return value ? decodeEntities(value.trim()) : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
