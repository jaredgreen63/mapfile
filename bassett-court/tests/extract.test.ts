import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { extractJsonLdBlocks, parseVehicleName, vehicleFromHtmlFallback, vehicleFromJsonLd } from '../src/lib/sources/extract';

/** Shaped after the markup dealer platforms emit on a vehicle detail page. */
const VDP_HTML = `<!doctype html><html><head>
<title>New 2026 Chevrolet Silverado 1500 LT Trail Boss</title>
<meta property="og:image" content="https://cdn.example.com/hero.jpg">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "AutoDealer", "name": "Example Chevrolet" },
    {
      "@type": "Car",
      "name": "2026 Chevrolet Silverado 1500 LT Trail Boss",
      "vehicleIdentificationNumber": "1GCUYDED5KZ123456",
      "sku": "N83967",
      "manufacturer": { "@type": "Organization", "name": "Chevrolet" },
      "model": "Silverado 1500",
      "vehicleConfiguration": "LT Trail Boss",
      "vehicleModelDate": "2026",
      "bodyType": "Truck",
      "color": "Summit White",
      "vehicleInteriorColor": "Jet Black",
      "vehicleTransmission": "10-Speed Automatic",
      "fuelType": "Gasoline",
      "driveWheelConfiguration": "4WD",
      "numberOfDoors": 4,
      "itemCondition": "https://schema.org/NewCondition",
      "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 12, "unitCode": "SMI" },
      "image": ["https://cdn.example.com/1.jpg", { "@type": "ImageObject", "url": "https://cdn.example.com/2.jpg" }],
      "offers": {
        "@type": "Offer",
        "price": "62450.00",
        "priceCurrency": "USD",
        "priceSpecification": [
          { "@type": "PriceSpecification", "priceType": "https://schema.org/MSRP", "price": "66120" }
        ]
      }
    }
  ]
}
</script></head><body></body></html>`;

describe('extractJsonLdBlocks', () => {
  it('finds every ld+json block on the page', () => {
    assert.equal(extractJsonLdBlocks(VDP_HTML).length, 1);
  });

  it('repairs the trailing commas some platforms emit', () => {
    const html = `<script type="application/ld+json">{"@type":"Car","name":"x",}</script>`;
    const blocks = extractJsonLdBlocks(html);
    assert.equal(blocks.length, 1);
    assert.equal((blocks[0] as Record<string, unknown>).name, 'x');
  });

  it('skips a block it cannot parse instead of throwing', () => {
    assert.doesNotThrow(() => extractJsonLdBlocks('<script type="application/ld+json">{{{</script>'));
    assert.equal(extractJsonLdBlocks('<script type="application/ld+json">{{{</script>').length, 0);
  });
});

describe('vehicleFromJsonLd', () => {
  const vehicle = vehicleFromJsonLd(VDP_HTML, 'https://example.com/vdp');

  it('finds the Car node inside an @graph', () => {
    assert.ok(vehicle, 'expected a vehicle');
  });

  it('reads the identifying fields', () => {
    assert.equal(vehicle!.vin, '1GCUYDED5KZ123456');
    assert.equal(vehicle!.make, 'Chevrolet');
    assert.equal(vehicle!.model, 'Silverado 1500');
    assert.equal(vehicle!.trim, 'LT Trail Boss');
    assert.equal(vehicle!.year, '2026');
    assert.equal(vehicle!.condition, 'new');
  });

  it('reads the asking price and the separately-specified MSRP', () => {
    assert.equal(vehicle!.price, 62_450);
    assert.equal(vehicle!.msrp, 66_120);
  });

  it('unwraps QuantitativeValue for the odometer', () => {
    assert.equal(vehicle!.mileage, 12);
  });

  it('collects images given both as strings and as ImageObjects', () => {
    assert.deepEqual(vehicle!.images, ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg']);
  });

  it('returns null for a page with no vehicle on it', () => {
    const html = '<script type="application/ld+json">{"@type":"WebPage","name":"About"}</script>';
    assert.equal(vehicleFromJsonLd(html, 'https://example.com/about'), null);
  });
});

describe('vehicleFromHtmlFallback', () => {
  it('reads the data attributes dealer platforms attach for analytics', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Used 2021 Chevrolet Malibu RS">
      <meta property="og:image" content="https://cdn.example.com/m.jpg">
      </head><body>
      <div data-vin="1G1ZD5ST0MF012345" data-stocknum="U55012" data-price="21995" data-odometer="38,420"
           data-make="Chevrolet" data-model="Malibu" data-trim="RS" data-exteriorcolor="Black"></div>
      </body></html>`;

    const vehicle = vehicleFromHtmlFallback(html, 'https://example.com/used/malibu');
    assert.ok(vehicle);
    assert.equal(vehicle!.vin, '1G1ZD5ST0MF012345');
    assert.equal(vehicle!.stockNumber, 'U55012');
    assert.equal(vehicle!.price, 21_995);
    assert.equal(vehicle!.mileage, 38_420);
    assert.equal(vehicle!.model, 'Malibu');
  });

  it('infers condition from the URL when the page does not say', () => {
    const html = '<meta property="og:title" content="2020 Chevrolet Tahoe LT">';
    assert.equal(vehicleFromHtmlFallback(html, 'https://example.com/used-inventory/tahoe')?.condition, 'used');
    assert.equal(vehicleFromHtmlFallback(html, 'https://example.com/new-inventory/tahoe')?.condition, 'new');
  });

  it('gives up on a page that is not a listing', () => {
    // "Contact Us" parses into make="Contact", model="Us" just as readily as a
    // real title does, so a bare two-word title must not be enough on its own.
    assert.equal(vehicleFromHtmlFallback('<title>Contact Us</title>', 'https://example.com/contact'), null);
    assert.equal(vehicleFromHtmlFallback('<title>Service Specials</title>', 'https://example.com/service'), null);
    assert.equal(
      vehicleFromHtmlFallback('<meta property="og:title" content="Chevrolet Tahoe">', 'https://example.com/x'),
      null,
      'a title with no year, VIN or price is not corroborated',
    );
  });

  it('accepts a listing corroborated by a VIN alone', () => {
    const html = `<meta property="og:title" content="Chevrolet Tahoe LT">
      <div data-vin="1GNSKPKD5RR100001"></div>`;
    const vehicle = vehicleFromHtmlFallback(html, 'https://example.com/x');
    assert.ok(vehicle);
    assert.equal(vehicle!.vin, '1GNSKPKD5RR100001');
  });
});

describe('parseVehicleName', () => {
  it('splits a listing title into its parts', () => {
    assert.deepEqual(parseVehicleName('2026 Chevrolet Silverado 1500 LT Trail Boss'), {
      year: 2026, make: 'Chevrolet', model: 'Silverado', trim: '1500 LT Trail Boss',
    });
  });

  it('copes with no year present', () => {
    assert.deepEqual(parseVehicleName('Chevrolet Tahoe'), {
      year: null, make: 'Chevrolet', model: 'Tahoe', trim: null,
    });
  });
});
