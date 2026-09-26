import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { mapRow, parseCsv, unmappedKeys } from '../src/lib/sources/feed';
import { normalizeVehicle } from '../src/lib/normalize';
import type { Vehicle } from '../src/lib/types';

/**
 * The exact column header the Shiftly export returns, which follows Facebook's
 * vehicle-catalogue spec. Two of its fields are traps:
 *
 *   state_of_vehicle  NEW | USED | CPO   <- the condition
 *   vehicle_type      car_truck | boat…  <- a body class, NOT the condition
 *
 * Mapping the second onto condition silently mislabels every listing, so these
 * tests pin the header verbatim.
 */
const HEADER =
  'Vehicle  Id,VIN,Make,Model,Year,Transmission,Body  Style,Drivetrain,Description,' +
  'Image  Urls,Mileage  Value,Mileage  Unit,Final  Url,Title,Price,State  of  Vehicle,' +
  'Exterior  Color,Address,Latitude,Longitude,Target  Campaign,Target  Ad  Group,Trim,' +
  'Interior  Color,Availability,stock_number,dealer_id,dealer_name,dealer_phone,' +
  'vehicle_type,date_first_on_lot,fuel_type,engine,Hardcoded  Description';

function row(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {
    'Vehicle  Id': 'V1001',
    VIN: '1GCUYDED5KZ123456',
    Make: 'Chevrolet',
    Model: 'Silverado 1500',
    Year: '2026',
    Transmission: '10-Speed Automatic',
    'Body  Style': 'Truck',
    Drivetrain: '4WD',
    Description: 'Well equipped.',
    'Image  Urls': 'https://cdn.example.com/1.jpg,https://cdn.example.com/2.jpg',
    'Mileage  Value': '18201',
    'Mileage  Unit': 'MI',
    'Final  Url': 'https://www.escudechevrolet.com/vdp/1',
    Title: '2026 Chevrolet Silverado 1500 LT',
    Price: '62450.00 USD',
    'State  of  Vehicle': 'USED',
    'Exterior  Color': 'Summit White',
    Address: '5010 Old Easley Bridge Rd, Easley, SC 29642',
    Latitude: '34.83',
    Longitude: '-82.60',
    'Target  Campaign': '',
    'Target  Ad  Group': '',
    Trim: 'LT',
    'Interior  Color': 'Jet Black',
    Availability: 'available',
    stock_number: 'U55012',
    dealer_id: '466',
    dealer_name: 'Escude Chevrolet of Easley',
    dealer_phone: '(864) 555-0100',
    vehicle_type: 'car_truck',
    date_first_on_lot: '2026-08-14',
    fuel_type: 'Gasoline',
    engine: '5.3L V8',
    'Hardcoded  Description': '',
  };
  return { ...base, ...overrides };
}

const NOW = '2026-09-26T12:00:00.000Z';
const build = (over: Record<string, string> = {}): Vehicle => {
  const vehicle = normalizeVehicle(mapRow(row(over)), NOW);
  assert.ok(vehicle, 'expected a publishable vehicle');
  return vehicle;
};

describe('Shiftly CSV header', () => {
  it('parses with the double-spaced column names intact', () => {
    const rows = parseCsv(`${HEADER}\n${Object.values(row()).join(',').replace('5010 Old Easley Bridge Rd, Easley, SC 29642', '"5010 Old Easley Bridge Rd, Easley, SC 29642"').replace('https://cdn.example.com/1.jpg,https://cdn.example.com/2.jpg', '"https://cdn.example.com/1.jpg,https://cdn.example.com/2.jpg"')}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].VIN, '1GCUYDED5KZ123456');
  });

  it('leaves no field we care about unmapped', () => {
    const ignored = unmappedKeys(row());
    // Ad-targeting and geo columns are genuinely not ours; nothing else should
    // be on this list.
    assert.deepEqual(
      ignored.sort(),
      ['Latitude', 'Longitude', 'Title', 'Vehicle  Id'].sort(),
      `unexpectedly dropped: ${ignored.join(', ')}`,
    );
  });
});

describe('Shiftly field mapping', () => {
  it('reads condition from State of Vehicle, not vehicle_type', () => {
    // vehicle_type is "car_truck" on every row. If it fed condition, every
    // vehicle would be mislabelled.
    assert.equal(build().condition, 'used');
    assert.equal(build({ 'State  of  Vehicle': 'NEW' }).condition, 'new');
    assert.equal(build({ 'State  of  Vehicle': 'CPO' }).condition, 'certified');
  });

  it('reads mileage from Mileage Value', () => {
    assert.equal(build().mileage, 18_201);
  });

  it('converts a kilometre reading to miles', () => {
    // 18,201 km is 11,309.57 miles. Publishing it as "18,201 mi" would
    // overstate the odometer by 60%.
    assert.equal(build({ 'Mileage  Unit': 'KM' }).mileage, 11_310);
    assert.equal(build({ 'Mileage  Unit': 'mi' }).mileage, 18_201);
  });

  it('strips the currency suffix from the price', () => {
    assert.equal(build().sourcePrice, 62_450);
  });

  it('publishes the source price unchanged', () => {
    const vehicle = build();
    assert.equal(vehicle.markupRate, 0);
    assert.equal(vehicle.price, vehicle.sourcePrice);
    assert.equal(build({ Price: '80605.00 USD' }).price, 80_605);
  });

  it('splits the comma-separated image list', () => {
    assert.deepEqual(build().images, ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg']);
  });

  it('keeps the detail URL from Final Url', () => {
    assert.equal(build().sourceUrl, 'https://www.escudechevrolet.com/vdp/1');
  });

  it('reads the per-vehicle dealer and address', () => {
    const dealer = build().dealer;
    assert.equal(dealer?.name, 'Escude Chevrolet of Easley');
    assert.equal(dealer?.address, '5010 Old Easley Bridge Rd, Easley, SC 29642');
    assert.equal(dealer?.id, '466');
  });

  it('accepts an address supplied as a JSON blob', () => {
    const vehicle = build({
      Address: '{"addr1":"1200 Gentry Memorial Hwy","city":"Pickens","region":"SC","postal_code":"29671"}',
    });
    assert.equal(vehicle.dealer?.address, '1200 Gentry Memorial Hwy, Pickens, SC 29671');
  });

  it('uses the feed’s own lot date as firstSeenAt', () => {
    assert.equal(build().firstSeenAt, new Date('2026-08-14').toISOString());
  });
});

describe('availability', () => {
  it('recognises the spellings a feed uses', () => {
    assert.equal(build({ Availability: 'available' }).availability, 'available');
    assert.equal(build({ Availability: 'not_available' }).availability, 'unavailable');
    assert.equal(build({ Availability: 'pending' }).availability, 'pending');
    assert.equal(build({ Availability: '' }).availability, null);
  });

  it('flags a sold vehicle as unavailable so it can be withheld', () => {
    // This is what takes a sold car off the site when the feed keeps the row.
    assert.equal(build({ Availability: 'not_available' }).availability, 'unavailable');
  });
});
