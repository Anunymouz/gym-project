'use client';

import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';
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
  SidebarSimple,
  Storefront,
  Tag,
  UsersThree,
  Wallet,
  X,
  type IconProps,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { dashboards, type DashboardId } from '@/lib/dashboards';
import { isSidebarCollapsed, setSidebarCollapsed, SIDEBAR_EVENT } from '@/lib/sidebar';

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

function subscribe(onChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => window.removeEventListener(SIDEBAR_EVENT, onChange);
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function DashboardShell({ dashboard, account, children }: { dashboard: DashboardId; account: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribe, isSidebarCollapsed, () => false);
  const navId = useId();

  // Close the mobile menu on Escape (links close it on click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Ctrl+B / Cmd+B collapses or expands the desktop sidebar (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== 'b' ||
        !(e.ctrlKey || e.metaKey) ||
        e.altKey ||
        e.shiftKey ||
        isTyping(e.target)
      )
        return;
      e.preventDefault();
      setSidebarCollapsed(!isSidebarCollapsed());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const config = dashboards[dashboard];
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
        <div
          className="fixed inset-0 z-30 bg-night/60 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id={navId}
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-midnight px-4 py-6 text-[#C9CDE0] transition-[translate,width] duration-200 ease-out',
          'lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:collapsed:w-[76px] lg:collapsed:px-3',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-7 flex items-center justify-between gap-2 px-2 lg:collapsed:flex-col lg:collapsed:gap-4 lg:collapsed:px-0">
          <Link href={base} className="shrink-0">
            <Image
              src="/brand/bgym-lockup-on-dark.svg"
              alt="BGYM"
              width={124}
              height={34}
              priority
              className="lg:collapsed:hidden"
            />
            <Image
              src="/brand/bgym-mark-on-dark.svg"
              alt="BGYM"
              width={40}
              height={34}
              className="hidden lg:collapsed:block"
            />
            <span className="sr-only">{config.name} home</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-controls={navId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
            className="hidden size-9 shrink-0 place-items-center rounded-control text-sidebar-mute transition-colors hover:bg-white/10 hover:text-white lg:grid"
          >
            <SidebarSimple size={20} weight={collapsed ? 'regular' : 'duotone'} aria-hidden />
          </button>
        </div>

        <nav
          aria-label={config.name}
          className="flex flex-1 flex-col gap-1 overflow-y-auto lg:collapsed:overflow-visible"
        >
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
                  'group/nav relative flex items-center gap-3 rounded-control px-3 py-2.5 font-semibold transition-colors lg:collapsed:justify-center lg:collapsed:px-0',
                  active ? 'bg-flare/15 text-white' : 'hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon
                  size={21}
                  weight={active ? 'duotone' : 'regular'}
                  className={clsx('shrink-0', active ? 'text-flare' : 'text-sidebar-mute')}
                />
                <span className="truncate lg:collapsed:sr-only">{item.label}</span>
                {/* Hover/focus label while collapsed (the sr-only text above is what screen readers use). */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-y-1/2 rounded-lg bg-night px-2.5 py-1.5 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100 lg:collapsed:block"
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {account}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
