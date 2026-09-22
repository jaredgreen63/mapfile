/**
 * A hairline rule with a single heartbeat spike through the middle, echoing
 * the divider on the Ask for Jared site. Decorative only.
 */
export function PulseDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-3xl px-4 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 860 40" className="h-8 w-full" fill="none" preserveAspectRatio="none">
        <path
          d="M0 20 H360 l14 0 8 -15 10 30 10 -22 9 14 7 -7 h442"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}
