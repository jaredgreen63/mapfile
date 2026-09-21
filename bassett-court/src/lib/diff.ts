import type { SyncDiff, Vehicle } from './types';

/**
 * Compare two inventory snapshots by vehicle id.
 *
 * This is what turns a full-replacement snapshot into a readable record of what
 * actually changed, so an operator can see churn at a glance instead of diffing
 * a few thousand lines of JSON.
 */
export function diffSnapshots(previous: Vehicle[], next: Vehicle[]): SyncDiff {
  const before = new Map(previous.map((vehicle) => [vehicle.id, vehicle]));
  const after = new Map(next.map((vehicle) => [vehicle.id, vehicle]));

  const added: string[] = [];
  const repriced: SyncDiff['repriced'] = [];
  let unchanged = 0;

  for (const [id, vehicle] of after) {
    const prior = before.get(id);
    if (!prior) {
      added.push(id);
    } else if (prior.price !== vehicle.price) {
      repriced.push({ id, from: prior.price, to: vehicle.price });
    } else {
      unchanged += 1;
    }
  }

  const removed = [...before.keys()].filter((id) => !after.has(id));
  return { added, removed, repriced, unchanged };
}
