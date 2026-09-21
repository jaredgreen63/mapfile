import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-32 text-center sm:px-6">
      <p className="eyebrow">404</p>
      <h1 className="display-tight mt-3 text-[2.5rem] sm:text-[3rem]">This one has moved on</h1>
      <p className="mt-5 text-[0.9375rem] leading-relaxed text-secondary">
        The page you were after is not here. If you were looking at a vehicle, it may have sold —
        our listings come down automatically once a vehicle is no longer available.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/inventory" className="btn btn-accent px-6 py-3">Browse inventory</Link>
        <Link href="/contact" className="btn btn-outline px-6 py-3">Tell us what you want</Link>
      </div>
    </div>
  );
}
