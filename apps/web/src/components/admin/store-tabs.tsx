import Link from 'next/link';

const TABS = [
  { href: '/admin/store', label: 'Review & partners' },
  { href: '/admin/store/orders', label: 'Orders' },
  { href: '/admin/store/products', label: 'BGYM products' },
  { href: '/admin/store/settings', label: 'Delivery & pickup' },
] as const;

/** Sections of the Store area in the admin dashboard. */
export function StoreTabs({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Store" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={current === t.href ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-bold ${current === t.href ? 'bg-midnight text-white' : 'bg-white hover:bg-cloud'}`}>{t.label}</Link>
      ))}
    </nav>
  );
}
