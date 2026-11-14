'use client';

import { useEffect, useId, useState, type ComponentType, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bank,
  Barbell,
  CalendarDots,
  ChartBar,
  ClipboardText,
  Clock,
  Flag,
  Gear,
  List,
  MapPinArea,
  Newspaper,
  Package,
  Percent,
  QrCode,
  Receipt,
  ShieldCheck,
  Storefront,
  Tag,
  UsersThree,
  Wallet,
  X,
  type IconProps,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import type { DashboardConfig } from '@/lib/dashboards';

const icons: Record<string, ComponentType<IconProps>> = {
  overview: ChartBar,
  members: UsersThree,
  scan: QrCode,
  plans: Tag,
  feed: Newspaper,
  trainers: Barbell,
  revenue: Wallet,
  settings: Gear,
  calendar: CalendarDots,
  bookings: ClipboardText,
  packages: Package,
  clock: Clock,
  orders: Receipt,
  store: Storefront,
  bank: Bank,
  shield: ShieldCheck,
  gyms: MapPinArea,
  flag: Flag,
  percent: Percent,
};

export function DashboardShell({ config, children }: { config: DashboardConfig; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navId = useId();

  // Close the mobile menu on Escape (links close it on click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const base = `/${config.id}`;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-midnight px-4 py-3 lg:hidden">
        <Image src="/brand/bgym-lockup-on-dark.svg" alt="BGYM" width={108} height={30} priority />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={navId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="grid size-10 place-items-center rounded-control text-white hover:bg-white/10"
        >
          {open ? <X size={24} /> : <List size={24} />}
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-30 bg-night/60 lg:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
      )}

      <aside
        id={navId}
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-midnight px-4 py-6 text-[#C9CDE0] transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Link href={base} className="mb-7 px-2">
          <Image src="/brand/bgym-lockup-on-dark.svg" alt="BGYM" width={124} height={34} priority />
          <span className="sr-only">{config.name} home</span>
        </Link>

        <nav aria-label={config.name} className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {config.nav.map((item) => {
            const href = item.slug ? `${base}/${item.slug}` : base;
            const active = item.slug ? pathname.startsWith(href) : pathname === base;
            const Icon = icons[item.icon] ?? ChartBar;
            return (
              <Link
                key={item.slug || 'home'}
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-3 rounded-control px-3 py-2.5 font-semibold transition-colors',
                  active ? 'bg-flare/15 text-white' : 'hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon size={21} weight={active ? 'duotone' : 'regular'} className={active ? 'text-flare' : 'text-sidebar-mute'} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-card bg-white/5 p-3 text-sm">
          <p className="font-bold text-white">{config.account.title}</p>
          <p>{config.account.subtitle}</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
