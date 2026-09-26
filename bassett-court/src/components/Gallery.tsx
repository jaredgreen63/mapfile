'use client';

import { useState } from 'react';
import type { Vehicle } from '@/lib/types';
import { VehicleImage, VehicleSilhouette } from './VehicleImage';

export function Gallery({ vehicle }: { vehicle: Vehicle }) {
  const [active, setActive] = useState(0);
  const images = vehicle.images ?? [];

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)]"
        style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
      >
        {images.length ? (
          <VehicleImage vehicle={vehicle} index={active} priority sizes="(min-width: 1024px) 60vw, 100vw" />
        ) : (
          <VehicleSilhouette vehicle={vehicle} />
        )}

        {images.length > 1 ? (
          <>
            <GalleryButton
              side="left"
              onClick={() => setActive((index) => (index - 1 + images.length) % images.length)}
            />
            <GalleryButton
              side="right"
              onClick={() => setActive((index) => (index + 1) % images.length)}
            />
            <span
              className="numeric absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium text-white"
              style={{ backgroundColor: 'rgb(0 0 0 / 0.6)' }}
            >
              {active + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="scroll-slim flex gap-2 overflow-x-auto pb-1">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`View photo ${index + 1}`}
              aria-current={index === active}
              className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg transition-opacity"
              style={{
                border: `2px solid ${index === active ? 'var(--accent)' : 'transparent'}`,
                opacity: index === active ? 1 : 0.65,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  // Hide a thumbnail whose photo is gone rather than showing
                  // the browser's broken-image icon in the filmstrip.
                  event.currentTarget.closest('button')?.setAttribute('hidden', '');
                }}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GalleryButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-white transition-opacity hover:opacity-100 ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
      style={{ backgroundColor: 'rgb(0 0 0 / 0.5)', opacity: 0.85 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={side === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  );
}
