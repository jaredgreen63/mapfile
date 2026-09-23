#!/usr/bin/env tsx
/**
 * Inventory sync.
 *
 * Pulls the upstream catalogue, applies the configured markup, and writes a
 * complete snapshot to data/inventory.json.
 *
 * The snapshot is a full replacement rather than a merge, which is what gives
 * the add/remove behaviour for free: a vehicle that appears upstream shows up
 * here on the next run, and one that is pulled upstream disappears from here,
 * because it simply is not in the new snapshot.
 *
 * Usage:
 *   npm run sync                    # use the configured adapter
 *   npm run sync -- --source=demo   # override the adapter
 *   npm run sync -- --dry-run       # report the diff without writing
 *   npm run sync -- --limit=25      # cap detail-page fetches (useful when testing)
 *   npm run sync -- --force         # bypass the shrink guard
 *   npm run sync -- --probe         # report how well the source mapped, write nothing
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { siteConfig } from '../site.config';
import { getAdapter } from '../src/lib/sources/index';
import { dedupe, normalizeVehicle } from '../src/lib/normalize';
import { unmappedKeys } from '../src/lib/sources/feed';
import { diffSnapshots } from '../src/lib/diff';
import { buildDemoInventory } from '../src/lib/sources/demo';
import type { InventorySnapshot, RawVehicle, SyncLogEntry, Vehicle } from '../src/lib/types';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = resolve(projectRoot, 'data/inventory.json');
const LOG_PATH = resolve(projectRoot, 'data/sync-log.json');
const MAX_LOG_ENTRIES = 60;

interface Args {
  source?: string;
  dryRun: boolean;
  force: boolean;
  limit: number;
  fallbackToDemo: boolean;
  probe: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, force: false, limit: 0, fallbackToDemo: false, probe: false };
  for (const token of argv) {
    if (token === '--probe') { args.probe = true; args.dryRun = true; }
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--force') args.force = true;
    else if (token === '--fallback-demo') args.fallbackToDemo = true;
    else if (token.startsWith('--source=')) args.source = token.slice('--source='.length);
    else if (token.startsWith('--limit=')) args.limit = Number.parseInt(token.slice('--limit='.length), 10) || 0;
  }
  return args;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function readSnapshot(): Promise<InventorySnapshot | null> {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')) as InventorySnapshot;
  } catch {
    return null;
  }
}

async function appendLog(entry: SyncLogEntry): Promise<void> {
  let history: SyncLogEntry[] = [];
  try {
    history = JSON.parse(await readFile(LOG_PATH, 'utf8')) as SyncLogEntry[];
  } catch {
    history = [];
  }
  history.unshift(entry);
  await writeFile(LOG_PATH, `${JSON.stringify(history.slice(0, MAX_LOG_ENTRIES), null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const adapterName = args.source ?? siteConfig.inventory.adapter;
  const startedAt = Date.now();
  const now = new Date().toISOString();

  log(`Bassett Court Holdings — inventory sync`);
  log(`  adapter : ${adapterName}`);
  log(`  source  : ${siteConfig.inventory.sourceUrl}`);
  log(`  markup  : +${(siteConfig.pricing.markupRate * 100).toFixed(2)}% (${siteConfig.pricing.rounding})`);
  log('');

  const previousSnapshot = await readSnapshot();
  const previousVehicles = previousSnapshot?.vehicles ?? [];
  const previousById = new Map(previousVehicles.map((vehicle) => [vehicle.id, vehicle]));

  let raw;
  let effectiveAdapter = adapterName;
  let rawRows: Record<string, unknown>[] = [];

  try {
    raw = await getAdapter(adapterName).fetchAll({
      sourceUrl: siteConfig.inventory.sourceUrl,
      feedUrl: siteConfig.inventory.feedUrl,
      limit: args.limit,
      politenessDelayMs: 250,
      log: (message) => log(`  ${message}`),
      onRawRows: (rows) => { rawRows = rows; },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!args.fallbackToDemo) {
      log('');
      log(`FAILED: ${reason}`);
      log('The existing snapshot was left untouched, so the site keeps serving its last good inventory.');
      await appendLog({
        at: now, adapter: adapterName, fetched: 0, published: previousVehicles.length,
        added: [], removed: [], repriced: [], unchanged: previousVehicles.length,
        ok: false, note: reason,
      });
      process.exitCode = 1;
      return;
    }
    log(`  source unavailable (${reason}); falling back to sample inventory`);
    raw = buildDemoInventory();
    effectiveAdapter = 'demo (fallback)';
  }

  const normalized = dedupe(
    raw
      .map((entry) => normalizeVehicle(entry, now, previousById))
      .filter((vehicle): vehicle is Vehicle => vehicle !== null),
  );

  log('');
  log(`  fetched   : ${raw.length}`);
  log(`  publishable: ${normalized.length}`);

  // Shrink guard: a source that starts blocking us, or a markup change that
  // breaks parsing, should not be able to quietly empty the catalogue.
  //
  // It only guards publishing. A dry run or a probe writes nothing, so it
  // reports what the guard would do and carries on — otherwise the one command
  // you reach for when a source is misbehaving refuses to tell you anything.
  const floor = Math.floor(previousVehicles.length * siteConfig.inventory.minRetainedFraction);
  const wouldShrink = previousVehicles.length > 0 && normalized.length < floor;

  if (wouldShrink && !args.force) {
    const note = `${normalized.length} vehicle(s) is below the floor of ${floor} (previous snapshot held ${previousVehicles.length}).`;

    if (!args.dryRun) {
      log('');
      log(`ABORTED: refusing to publish — ${note}`);
      log('Re-run with --force if the drop is genuine (for example, a real inventory reduction).');
      await appendLog({
        at: now, adapter: effectiveAdapter, fetched: raw.length, published: previousVehicles.length,
        added: [], removed: [], repriced: [], unchanged: previousVehicles.length, ok: false, note,
      });
      process.exitCode = 1;
      return;
    }

    log('');
    log(`NOTE: a real sync would be rejected by the shrink guard — ${note}`);
  }

  const sorted = normalized.sort((a, b) => a.id.localeCompare(b.id));
  const diff = diffSnapshots(previousVehicles, sorted);

  log('');
  log(`  added     : ${diff.added.length}`);
  log(`  removed   : ${diff.removed.length}`);
  log(`  repriced  : ${diff.repriced.length}`);
  log(`  unchanged : ${diff.unchanged}`);

  if (args.probe) {
    printProbe(raw, normalized, rawRows);
  }

  if (args.dryRun) {
    log('');
    log(args.probe ? 'Probe only — nothing written.' : 'Dry run — nothing written.');
    return;
  }

  const snapshot: InventorySnapshot = {
    generatedAt: now,
    sourceUrl: siteConfig.inventory.sourceUrl,
    sourceName: siteConfig.inventory.sourceName,
    adapter: effectiveAdapter,
    markupRate: siteConfig.pricing.markupRate,
    vehicleCount: sorted.length,
    vehicles: sorted,
  };

  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  await appendLog({
    at: now, adapter: effectiveAdapter, fetched: raw.length, published: sorted.length,
    ...diff, ok: true,
  });

  log('');
  log(`Wrote ${sorted.length} vehicle(s) to data/inventory.json in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
}

/**
 * Field-mapping report.
 *
 * The point of this is to answer, in one run, whether a new provider's records
 * are landing correctly — and when they are not, to name the exact source keys
 * being dropped so the alias list can be extended rather than guessed at.
 */
function printProbe(
  raw: RawVehicle[],
  normalized: Vehicle[],
  rawRows: Record<string, unknown>[],
): void {
  const FIELDS = [
    'vin', 'stockNumber', 'condition', 'year', 'make', 'model', 'trim',
    'bodyStyle', 'drivetrain', 'transmission', 'fuelType', 'engine',
    'exteriorColor', 'interiorColor', 'mileage', 'price', 'msrp',
    'images', 'features', 'description', 'sourceUrl',
  ] as const;

  log('');
  log('─'.repeat(64));
  log('FIELD MAPPING REPORT');
  log('─'.repeat(64));

  if (!raw.length) {
    log('No records came back. Check the endpoint URL and the credential.');
    return;
  }

  log('');
  log(`  ${'field'.padEnd(16)} ${'filled'.padStart(12)}   example`);
  for (const field of FIELDS) {
    const filled = raw.filter((row) => {
      const value = row[field] as unknown;
      return Array.isArray(value) ? value.length > 0 : value != null && value !== '';
    });
    const pct = Math.round((filled.length / raw.length) * 100);
    const first = filled.length ? (filled[0][field] as unknown) : null;
    const sample = filled.length
      ? String(Array.isArray(first) ? `${first.length} item(s)` : first).slice(0, 34)
      : '—';
    const bar = pct === 0 ? 'MISSING' : `${filled.length}/${raw.length} (${pct}%)`;
    log(`  ${field.padEnd(16)} ${bar.padStart(12)}   ${sample}`);
  }

  // Keys the provider sends that we are currently discarding.
  if (rawRows.length) {
    const counts = new Map<string, number>();
    for (const row of rawRows) {
      for (const key of unmappedKeys(row)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const ignored = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    log('');
    if (!ignored.length) {
      log('  Every populated source field mapped to something. Nothing discarded.');
    } else {
      log(`  ${ignored.length} source field(s) not recognised and dropped:`);
      for (const [key, count] of ignored.slice(0, 25)) {
        const example = String(rawRows.find((r) => r[key] != null && r[key] !== '')?.[key] ?? '').slice(0, 40);
        log(`    ${key.padEnd(28)} ${String(count).padStart(5)} record(s)   ${example}`);
      }
      if (ignored.length > 25) log(`    …and ${ignored.length - 25} more`);
      log('');
      log('  Add any of these worth keeping to FIELD_ALIASES in src/lib/sources/feed.ts.');
    }
  }

  log('');
  log(`  ${raw.length} fetched -> ${normalized.length} publishable`);
  const unpriced = normalized.filter((v) => v.price == null).length;
  if (unpriced) log(`  ${unpriced} would publish as "${siteConfig.pricing.callForPriceLabel}" (no usable source price)`);
  const photoless = normalized.filter((v) => v.images.length === 0).length;
  if (photoless) log(`  ${photoless} have no photography`);

  if (normalized.length) {
    const sample = normalized[0];
    log('');
    log('  Sample published vehicle:');
    log(`    ${[sample.year, sample.make, sample.model, sample.trim].filter(Boolean).join(' ')}`);
    log(`    source ${sample.sourcePrice ?? '—'} -> published ${sample.price ?? '—'} (+${(sample.markupRate * 100).toFixed(2)}%)`);
    log(`    vin ${sample.vin ?? '—'}  ·  ${sample.images.length} photo(s)  ·  /inventory/${sample.slug}`);
  }
  log('─'.repeat(64));
}

main().catch((error) => {
  log(`Unexpected failure: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
