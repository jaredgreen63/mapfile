import type { AdapterOptions, RawVehicle, SourceAdapter } from '../types';
import { fetchText } from './http';

/**
 * Adapter for an authorized inventory feed — the path to prefer once the
 * source agrees to supply one. Feeds are complete, cheap to poll and stable,
 * where crawling is none of those things.
 *
 * Accepts CSV, a JSON array (or an object wrapping one), or an XML document
 * with one element per vehicle. Field names are matched loosely, so the
 * common export formats work without hand-mapping columns.
 */

/** Maps our canonical field to the header spellings seen in the wild. */
const FIELD_ALIASES: Record<keyof RawVehicle, string[]> = {
  vin: ['vin', 'vinnumber', 'vehicleidentificationnumber'],
  stockNumber: ['stock', 'stocknumber', 'stockno', 'stocknum', 'dealerstocknumber'],
  // "state_of_vehicle" is the Facebook vehicle-catalogue field carrying
  // NEW / USED / CPO. Note that "vehicle_type" in that same spec means
  // car_truck / motorcycle / boat — a body class, NOT a condition — so it must
  // not be treated as one.
  condition: ['condition', 'stateofvehicle', 'newused', 'inventorytype', 'newusedflag'],
  year: ['year', 'modelyear', 'vehicleyear'],
  make: ['make', 'manufacturer', 'brand'],
  model: ['model', 'modelname', 'carline'],
  trim: ['trim', 'trimlevel', 'style', 'series'],
  bodyStyle: ['body', 'bodystyle', 'bodytype', 'vehiclebodystyle', 'vehicletype'],
  drivetrain: ['drivetrain', 'drive', 'drivetype', 'driveline', 'drivewheels'],
  transmission: ['transmission', 'trans', 'transmissiontype'],
  fuelType: ['fuel', 'fueltype', 'enginefueltype'],
  engine: ['engine', 'enginedescription', 'enginesize', 'enginedisplacement'],
  exteriorColor: ['exteriorcolor', 'extcolor', 'color', 'exterior'],
  interiorColor: ['interiorcolor', 'intcolor', 'interior'],
  doors: ['doors', 'doorcount', 'numberofdoors'],
  mileage: ['mileage', 'mileagevalue', 'odometer', 'odometervalue', 'miles', 'kilometres', 'odometerreading'],
  mileageUnit: ['mileageunit', 'odometerunit', 'mileageunits', 'distanceunit'],
  price: ['price', 'sellingprice', 'internetprice', 'askingprice', 'saleprice'],
  msrp: ['msrp', 'retailprice', 'listprice', 'suggestedretailprice'],
  images: ['images', 'imageurls', 'imageurl', 'photos', 'photourls', 'imagelist', 'pictures'],
  features: ['features', 'options', 'equipment', 'optionslist'],
  description: ['description', 'hardcodeddescription', 'comments', 'sellercomments', 'detail', 'notes'],
  sourceUrl: ['url', 'finalurl', 'vdpurl', 'detailurl', 'link', 'vehicleurl'],
  // Facebook catalogue: available | not_available | pending. A sold vehicle
  // may be flagged here rather than dropped from the export, so this decides
  // whether a listing stays on the site.
  availability: ['availability', 'availabilitystatus', 'status', 'instock'],
  dealerId: ['dealerid', 'dealercode', 'rooftopid', 'storeid'],
  dealerName: ['dealername', 'dealershipname', 'storename', 'rooftop'],
  dealerPhone: ['dealerphone', 'phone', 'dealerphonenumber', 'storephone'],
  dealerAddress: ['address', 'dealeraddress', 'location', 'storeaddress'],
  dateFirstOnLot: ['datefirstonlot', 'dateinstock', 'inventorydate', 'datereceived'],
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Every alias the mapper recognises, flattened for lookup. */
const KNOWN_ALIASES = new Set(Object.values(FIELD_ALIASES).flat());

/**
 * Keys present in a source record that the mapper does not recognise.
 *
 * Used by `npm run sync -- --probe` to say plainly which fields a new provider
 * is sending that we are throwing away, so the alias list can be extended
 * instead of guessed at.
 */
export function unmappedKeys(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter((key) => {
    const value = row[key];
    if (value == null || value === '') return false;
    return !KNOWN_ALIASES.has(normalizeKey(key));
  });
}

/** Build a canonical record from a loosely-keyed source row. */
export function mapRow(row: Record<string, unknown>): RawVehicle {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeKey(key), value);
  }

  const pick = (field: keyof RawVehicle): unknown => {
    for (const alias of FIELD_ALIASES[field]) {
      const value = normalized.get(alias);
      if (value != null && value !== '') return value;
    }
    return null;
  };

  const splitList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== 'string') return [];
    // Feeds separate multi-values with commas, pipes or semicolons. Commas are
    // ambiguous inside CSV text, so only split on them when no stronger
    // delimiter is present.
    const delimiter = value.includes('|') ? '|' : value.includes(';') ? ';' : ',';
    return value.split(delimiter).map((part) => part.trim()).filter(Boolean);
  };

  return {
    vin: str(pick('vin')),
    stockNumber: str(pick('stockNumber')),
    condition: str(pick('condition')),
    year: str(pick('year')),
    make: str(pick('make')),
    model: str(pick('model')),
    trim: str(pick('trim')),
    bodyStyle: str(pick('bodyStyle')),
    drivetrain: str(pick('drivetrain')),
    transmission: str(pick('transmission')),
    fuelType: str(pick('fuelType')),
    engine: str(pick('engine')),
    exteriorColor: str(pick('exteriorColor')),
    interiorColor: str(pick('interiorColor')),
    doors: str(pick('doors')),
    mileage: str(pick('mileage')),
    mileageUnit: str(pick('mileageUnit')),
    price: str(pick('price')),
    msrp: str(pick('msrp')),
    images: splitList(pick('images')),
    features: splitList(pick('features')),
    description: str(pick('description')),
    sourceUrl: str(pick('sourceUrl')),
    availability: str(pick('availability')),
    dealerId: str(pick('dealerId')),
    dealerName: str(pick('dealerName')),
    dealerPhone: str(pick('dealerPhone')),
    dealerAddress: str(pick('dealerAddress')),
    dateFirstOnLot: str(pick('dateFirstOnLot')),
  };
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/** RFC 4180 CSV parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
  if (!header) return [];

  return body.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key.trim()] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

/** Flat XML-to-record conversion: one record per repeated vehicle element. */
export function parseXmlFeed(xml: string): Record<string, string>[] {
  const candidates = ['vehicle', 'item', 'listing', 'car', 'unit', 'record'];
  for (const tag of candidates) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
    const matches = [...xml.matchAll(pattern)];
    if (matches.length < 2) continue;

    return matches.map((match) => {
      const record: Record<string, string> = {};
      for (const field of match[1].matchAll(/<([a-zA-Z0-9_:-]+)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
        const key = field[1].split(':').pop()!;
        const value = field[2]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
        // Repeated tags (multiple <image> elements) become a pipe-joined list.
        record[key] = record[key] ? `${record[key]}|${value}` : value;
      }
      return record;
    });
  }
  return [];
}

export const feedAdapter: SourceAdapter = {
  name: 'feed',

  async fetchAll(options: AdapterOptions): Promise<RawVehicle[]> {
    const log = options.log ?? (() => {});
    const url = options.feedUrl?.trim();
    if (!url) {
      throw new Error(
        'The "feed" adapter requires a feed URL. Set INVENTORY_FEED_URL or siteConfig.inventory.feedUrl.',
      );
    }

    log(`fetching feed ${url}`);
    const body = await fetchText(url, { accept: 'application/json,text/csv,application/xml,*/*' });
    if (!body) throw new Error(`Feed returned no content: ${url}`);

    const rows = parseFeedBody(body);
    log(`feed contained ${rows.length} row(s)`);
    options.onRawRows?.(rows);
    return rows.map(mapRow);
  },
};

export function parseFeedBody(body: string): Record<string, unknown>[] {
  const trimmed = body.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    // Unwrap the usual envelope keys.
    for (const key of ['vehicles', 'inventory', 'data', 'items', 'results', 'listings']) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
    return [parsed];
  }

  if (trimmed.startsWith('<')) return parseXmlFeed(trimmed);

  return parseCsv(trimmed);
}
