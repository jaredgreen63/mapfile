export function PageHeader({
  eyebrow, title, lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mx-auto max-w-7xl px-4 pb-4 pt-14 sm:px-6 lg:px-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display-tight mt-2 text-[2.5rem] sm:text-[3.25rem]">{title}</h1>
      {lede ? (
        <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-secondary">{lede}</p>
      ) : null}
    </header>
  );
}
