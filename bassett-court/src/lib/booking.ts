import type { Vehicle } from './types';
import type { BookableVehicle } from '@/components/AppointmentForm';
import { formatPrice } from './pricing';
import { vehicleFullTitle } from './format';
import { siteConfig } from '~/site.config';

/**
 * Shape the catalogue for the booking form's vehicle picker.
 *
 * Only the fields the dropdown needs cross into the client bundle — shipping
 * the full snapshot to every page carrying a form would be wasteful.
 */
export function toBookable(vehicles: Vehicle[]): BookableVehicle[] {
  return vehicles
    .map((vehicle) => ({
      id: vehicle.id,
      slug: vehicle.slug,
      label: vehicleFullTitle(vehicle),
      price: formatPrice(vehicle.price, siteConfig.pricing.callForPriceLabel),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
