import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { mapRow, parseCsv, parseFeedBody, parseXmlFeed } from '../src/lib/sources/feed';

describe('parseCsv', () => {
  it('handles quoted fields containing commas and escaped quotes', () => {
    const csv = [
      'VIN,Make,Model,Comments,Price',
      '1GCUYDED5KZ123456,Chevrolet,Silverado,"Leather, sunroof, tow package",62450',
      '1G1ZD5ST0MF012345,Chevrolet,Malibu,"He said ""great car""",21995',
    ].join('\n');

    const rows = parseCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Comments, 'Leather, sunroof, tow package');
    assert.equal(rows[1].Comments, 'He said "great car"');
    assert.equal(rows[0].Price, '62450');
  });

  it('handles CRLF line endings and ignores blank lines', () => {
    const rows = parseCsv('VIN,Make\r\nabc,Chevrolet\r\n\r\ndef,Ford\r\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].Make, 'Ford');
  });

  it('returns nothing for an empty document', () => {
    assert.deepEqual(parseCsv(''), []);
  });
});

describe('mapRow', () => {
  it('matches header spellings loosely', () => {
    const mapped = mapRow({
      'VIN Number': '1GCUYDED5KZ123456',
      Manufacturer: 'Chevrolet',
      'Model Name': 'Silverado 1500',
      'Selling Price': '62450',
      'Odometer Reading': '12',
      'Stock No': 'N83967',
      'Photo URLs': 'https://a.example/1.jpg|https://a.example/2.jpg',
    });

    assert.equal(mapped.vin, '1GCUYDED5KZ123456');
    assert.equal(mapped.make, 'Chevrolet');
    assert.equal(mapped.model, 'Silverado 1500');
    assert.equal(mapped.price, '62450');
    assert.equal(mapped.mileage, '12');
    assert.equal(mapped.stockNumber, 'N83967');
    assert.deepEqual(mapped.images, ['https://a.example/1.jpg', 'https://a.example/2.jpg']);
  });

  it('splits on the strongest delimiter present, so commas inside values survive', () => {
    const piped = mapRow({ options: 'Heated Seats, Front|Sunroof' });
    assert.deepEqual(piped.features, ['Heated Seats, Front', 'Sunroof']);

    const commas = mapRow({ options: 'Heated Seats,Sunroof' });
    assert.deepEqual(commas.features, ['Heated Seats', 'Sunroof']);
  });

  it('leaves absent fields null rather than empty strings', () => {
    const mapped = mapRow({ Make: 'Chevrolet', Model: 'Tahoe', Trim: '' });
    assert.equal(mapped.trim, null);
    assert.equal(mapped.price, null);
  });
});

describe('parseXmlFeed', () => {
  it('reads one record per repeated element, with CDATA and repeated tags', () => {
    const xml = `<?xml version="1.0"?><inventory>
      <vehicle>
        <vin>1GCUYDED5KZ123456</vin><make>Chevrolet</make><model>Silverado 1500</model>
        <price>62450</price>
        <comments><![CDATA[Loaded & ready]]></comments>
        <image>https://a.example/1.jpg</image><image>https://a.example/2.jpg</image>
      </vehicle>
      <vehicle>
        <vin>1G1ZD5ST0MF012345</vin><make>Chevrolet</make><model>Malibu</model><price>21995</price>
      </vehicle>
    </inventory>`;

    const rows = parseXmlFeed(xml);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].vin, '1GCUYDED5KZ123456');
    assert.equal(rows[0].comments, 'Loaded & ready');
    assert.equal(rows[0].image, 'https://a.example/1.jpg|https://a.example/2.jpg');
    assert.equal(rows[1].model, 'Malibu');
  });
});

describe('parseFeedBody', () => {
  it('detects JSON arrays', () => {
    assert.equal(parseFeedBody('[{"vin":"a"},{"vin":"b"}]').length, 2);
  });

  it('unwraps the usual envelope keys', () => {
    assert.equal(parseFeedBody('{"vehicles":[{"vin":"a"}]}').length, 1);
    assert.equal(parseFeedBody('{"data":[{"vin":"a"},{"vin":"b"}]}').length, 2);
  });

  it('detects XML and CSV', () => {
    assert.equal(parseFeedBody('<inventory><vehicle><vin>a</vin></vehicle><vehicle><vin>b</vin></vehicle></inventory>').length, 2);
    assert.equal(parseFeedBody('vin,make\na,Chevrolet').length, 1);
  });
});
