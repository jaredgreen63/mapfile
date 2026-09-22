import { strict as assert } from 'node:assert';
import { after, describe, it } from 'node:test';

import { fetchApiInventory, redact } from '../src/lib/sources/api';
import { fetchText } from '../src/lib/sources/http';

const KEY = 'sk_live_SUPERSECRET_abc123';

interface Call { url: string; headers: Record<string, string> }

/** Stub fetch and record what the adapter actually sent. */
function stub(handler: (url: string, call: Call) => { status?: number; body?: string }) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    const call = { url, headers };
    calls.push(call);
    const { status = 200, body = '[]' } = handler(url, call);
    return new Response(body, { status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const silent = () => {};

describe('redact', () => {
  it('removes the credential from any string', () => {
    assert.equal(redact(`failed with ${KEY}`, KEY), 'failed with ***');
    assert.equal(redact('no secret here', KEY), 'no secret here');
    assert.equal(redact('unchanged', undefined), 'unchanged');
  });
});

describe('fetchApiInventory — authentication', () => {
  it('sends a bearer token by default', async () => {
    const { calls, restore } = stub(() => ({ body: '[{"vin":"a","make":"Chevrolet","model":"Tahoe"}]' }));
    after(restore);
    await fetchApiInventory({ name: 't', url: 'https://api.example.com/inventory', apiKey: KEY }, silent);
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.ok(!calls[0].url.includes(KEY), 'the key must not appear in the URL');
    restore();
  });

  it('sends a custom header when asked', async () => {
    const { calls, restore } = stub(() => ({ body: '[]' }));
    after(restore);
    await fetchApiInventory(
      { name: 't', url: 'https://api.example.com/inventory', apiKey: KEY, authStyle: 'header', headerName: 'X-Shiftly-Key' },
      silent,
    );
    assert.equal(calls[0].headers['X-Shiftly-Key'], KEY);
    assert.equal(calls[0].headers.Authorization, undefined);
    restore();
  });

  it('puts the key in the query string only when explicitly told to', async () => {
    const { calls, restore } = stub(() => ({ body: '[]' }));
    after(restore);
    await fetchApiInventory(
      { name: 't', url: 'https://api.example.com/inventory', apiKey: KEY, authStyle: 'query', queryParam: 'token' },
      silent,
    );
    assert.ok(calls[0].url.includes(`token=${encodeURIComponent(KEY)}`));
    assert.equal(calls[0].headers.Authorization, undefined);
    restore();
  });

  it('never leaks the key into the error message on failure', async () => {
    const { restore } = stub(() => ({ status: 401, body: 'unauthorized' }));
    after(restore);
    await assert.rejects(
      () => fetchApiInventory({ name: 'shiftly', url: 'https://api.example.com/inventory', apiKey: KEY }, silent),
      (error: Error) => {
        assert.ok(!error.message.includes(KEY), `key leaked: ${error.message}`);
        assert.match(error.message, /key was rejected|401/i);
        return true;
      },
    );
    restore();
  });
});

describe('fetchApiInventory — pagination', () => {
  it('follows an explicit next-page cursor', async () => {
    let page = 0;
    const { calls, restore } = stub((url) => {
      page += 1;
      if (url.includes('cursor=2')) {
        return { body: JSON.stringify({ vehicles: [{ vin: 'b', make: 'Chevrolet', model: 'Tahoe' }] }) };
      }
      return {
        body: JSON.stringify({
          vehicles: [{ vin: 'a', make: 'Chevrolet', model: 'Tahoe' }],
          next: 'https://api.example.com/inventory?cursor=2',
        }),
      };
    });
    after(restore);
    const rows = await fetchApiInventory({ name: 't', url: 'https://api.example.com/inventory' }, silent);
    assert.equal(rows.length, 2);
    assert.ok(calls.some((c) => c.url.includes('cursor=2')));
    assert.equal(page, 2);
    restore();
  });

  it('stops when a page comes back empty', async () => {
    let call = 0;
    const { restore } = stub(() => {
      call += 1;
      return call === 1
        ? { body: JSON.stringify(Array.from({ length: 2 }, (_, i) => ({ vin: `v${i}`, make: 'Chevrolet', model: 'Tahoe' }))) }
        : { body: '[]' };
    });
    after(restore);
    const rows = await fetchApiInventory(
      { name: 't', url: 'https://api.example.com/inventory', pageSize: 2 },
      silent,
    );
    assert.equal(rows.length, 2);
    restore();
  });

  it('stops instead of looping when the API ignores the page parameter', async () => {
    // Without the repeat guard this would spin until maxPages, duplicating
    // the same two vehicles thirty times over.
    const fixed = JSON.stringify([
      { vin: 'a', make: 'Chevrolet', model: 'Tahoe' },
      { vin: 'b', make: 'Chevrolet', model: 'Traverse' },
    ]);
    const { calls, restore } = stub(() => ({ body: fixed }));
    after(restore);
    const rows = await fetchApiInventory(
      { name: 't', url: 'https://api.example.com/inventory', pageSize: 2, maxPages: 30 },
      silent,
    );
    assert.ok(calls.length <= 4, `made ${calls.length} requests; expected the loop to break early`);
    assert.ok(rows.length <= 4);
    restore();
  });

  it('maps loosely-named fields through the shared mapper', async () => {
    const { restore } = stub(() => ({
      body: JSON.stringify({
        data: [{
          'VIN Number': '1GCUYDED5KZ123456',
          Manufacturer: 'Chevrolet',
          'Model Name': 'Silverado 1500',
          'Selling Price': '62450',
          'Photo URLs': 'https://a.example/1.jpg|https://a.example/2.jpg',
        }],
      }),
    }));
    after(restore);
    const rows = await fetchApiInventory({ name: 't', url: 'https://api.example.com/inventory' }, silent);
    assert.equal(rows[0].vin, '1GCUYDED5KZ123456');
    assert.equal(rows[0].make, 'Chevrolet');
    assert.equal(rows[0].price, '62450');
    assert.equal(rows[0].images?.length, 2);
    restore();
  });

  it('refuses to run without an endpoint', async () => {
    await assert.rejects(() => fetchApiInventory({ name: 'shiftly', url: '' }, silent), /no endpoint/i);
  });
});

describe('fetchText auth handling', () => {
  it('throws a clear error on 401 for an authenticated request', async () => {
    const { restore } = stub(() => ({ status: 403, body: 'nope' }));
    after(restore);
    await assert.rejects(
      () => fetchText('https://api.example.com/x', { headers: { Authorization: 'Bearer x' }, retries: 0 }),
      /rejected or lacks access/,
    );
    restore();
  });

  it('still returns null on 403 for an unauthenticated request', async () => {
    const { restore } = stub(() => ({ status: 403, body: 'nope' }));
    after(restore);
    assert.equal(await fetchText('https://example.com/x', { retries: 0 }), null);
    restore();
  });
});
