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
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { siteConfig } from '../site.config';
import { getAdapter } from '../src/lib/sources/index';
import { dedupe, normalizeVehicle } from '../src/lib/normalize';
import { diffSnapshots } from '../src/lib/diff';
import { buildDemoInventory } from '../src/lib/sources/demo';
import type { InventorySnapshot, SyncLogEntry, Vehicle } from '../src/lib/types';

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
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, force: false, limit: 0, fallbackToDemo: false };
  for (const token of argv) {
    if (token === '--dry-run') args.dryRun = true;
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

  try {
    raw = await getAdapter(adapterName).fetchAll({
      sourceUrl: siteConfig.inventory.sourceUrl,
      feedUrl: siteConfig.inventory.feedUrl,
      limit: args.limit,
      politenessDelayMs: 250,
      log: (message) => log(`  ${message}`),
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
  const floor = Math.floor(previousVehicles.length * siteConfig.inventory.minRetainedFraction);
  if (!args.force && previousVehicles.length > 0 && normalized.length < floor) {
    const note = `Refusing to publish ${normalized.length} vehicle(s); previous snapshot held ${previousVehicles.length} and the floor is ${floor}.`;
    log('');
    log(`ABORTED: ${note}`);
    log('Re-run with --force if the drop is genuine (for example, a real inventory reduction).');
    await appendLog({
      at: now, adapter: effectiveAdapter, fetched: raw.length, published: previousVehicles.length,
      added: [], removed: [], repriced: [], unchanged: previousVehicles.length, ok: false, note,
    });
    process.exitCode = 1;
    return;
  }

  const sorted = normalized.sort((a, b) => a.id.localeCompare(b.id));
  const diff = diffSnapshots(previousVehicles, sorted);

  log('');
  log(`  added     : ${diff.added.length}`);
  log(`  removed   : ${diff.removed.length}`);
  log(`  repriced  : ${diff.repriced.length}`);
  log(`  unchanged : ${diff.unchanged}`);

  if (args.dryRun) {
    log('');
    log('Dry run — nothing written.');
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

main().catch((error) => {
  log(`Unexpected failure: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
