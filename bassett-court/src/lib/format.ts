import type { Vehicle } from './types';

export function vehicleTitle(vehicle: Pick<Vehicle, 'year' | 'make' | 'model'>): string {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

export function vehicleFullTitle(vehicle: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim'>): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
}

export function conditionLabel(condition: Vehicle['condition']): string {
  if (condition === 'certified') return 'Certified Pre-Owned';
  return condition === 'new' ? 'New' : 'Pre-Owned';
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return 'not yet synced';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(date);
}

export function relativeTime(iso: string): string {
  const date = new Date(iso).getTime();
  if (!Number.isFinite(date) || date === 0) return 'never';
  const seconds = Math.round((Date.now() - date) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Infinity],
  ];
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  let value = seconds;
  for (const [unit, size] of units) {
    if (Math.abs(value) < size) return formatter.format(-Math.round(value), unit);
    value /= size;
  }
  return formatter.format(-Math.round(value), 'year');
}

/**
 * Render the business address from whichever parts are actually filled in.
 * Street and ZIP are optional, so a city-and-state-only listing reads cleanly
 * instead of showing stray commas or an empty line.
 */
export function formatAddress(address: {
  street?: string | null;
  city: string;
  state: string;
  zip?: string;
}): { lines: string[]; oneLine: string } {
  const locality = [address.city, address.state].filter(Boolean).join(', ');
  const withZip = [locality, address.zip].filter(Boolean).join(' ').trim();
  const lines = [address.street, withZip].filter((part): part is string => Boolean(part));
  return { lines, oneLine: lines.join(', ') };
}
