/** The four BGYM dashboards and their sections. Icons are mapped in the client shell. */
export type DashboardId = 'gym' | 'trainer' | 'partner' | 'admin';

export interface NavItem {
  /** Section slug; '' is the dashboard home. */
  slug: string;
  label: string;
  icon: string;
  /** Roadmap phase in which the section is built (shown on placeholder pages). */
  phase: number;
}

export interface DashboardConfig {
  id: DashboardId;
  name: string;
  nav: NavItem[];
}

export const dashboards: Record<DashboardId, DashboardConfig> = {
  gym: {
    id: 'gym',
    name: 'Gym dashboard',
    nav: [
      { slug: '', label: 'Overview', icon: 'overview', phase: 1 },
      { slug: 'members', label: 'Members', icon: 'members', phase: 1 },
      { slug: 'check-in', label: 'Check-in', icon: 'scan', phase: 1 },
      { slug: 'plans', label: 'Plans', icon: 'plans', phase: 1 },
      { slug: 'feed', label: 'Feed', icon: 'feed', phase: 2 },
      { slug: 'trainers', label: 'Trainers', icon: 'trainers', phase: 2 },
      { slug: 'revenue', label: 'Revenue', icon: 'revenue', phase: 1 },
      { slug: 'settings', label: 'Settings', icon: 'settings', phase: 1 },
    ],
  },
  trainer: {
    id: 'trainer',
    name: 'Trainer dashboard',
    nav: [
      { slug: '', label: 'Schedule', icon: 'calendar', phase: 2 },
      { slug: 'bookings', label: 'Bookings', icon: 'bookings', phase: 2 },
      { slug: 'clients', label: 'Clients', icon: 'members', phase: 2 },
      { slug: 'packages', label: 'Packages', icon: 'packages', phase: 2 },
      { slug: 'availability', label: 'Availability', icon: 'clock', phase: 2 },
      { slug: 'earnings', label: 'Earnings', icon: 'revenue', phase: 2 },
      { slug: 'settings', label: 'Settings', icon: 'settings', phase: 2 },
    ],
  },
  partner: {
    id: 'partner',
    name: 'Store partner dashboard',
    nav: [
      { slug: '', label: 'Orders', icon: 'orders', phase: 3 },
      { slug: 'products', label: 'Products', icon: 'packages', phase: 3 },
      { slug: 'inventory', label: 'Inventory', icon: 'store', phase: 3 },
      { slug: 'payouts', label: 'Payouts', icon: 'bank', phase: 3 },
      { slug: 'settings', label: 'Settings', icon: 'settings', phase: 3 },
    ],
  },
  admin: {
    id: 'admin',
    name: 'Admin dashboard',
    nav: [
      { slug: '', label: 'Overview', icon: 'overview', phase: 1 },
      { slug: 'approvals', label: 'Gym approvals', icon: 'shield', phase: 1 },
      { slug: 'gyms', label: 'Gyms', icon: 'gyms', phase: 1 },
      { slug: 'trainers', label: 'Trainers', icon: 'trainers', phase: 2 },
      { slug: 'members', label: 'Members', icon: 'members', phase: 1 },
      { slug: 'store', label: 'Store & partners', icon: 'store', phase: 3 },
      { slug: 'payments', label: 'Payments', icon: 'revenue', phase: 1 },
      { slug: 'reports', label: 'Reports', icon: 'flag', phase: 2 },
      { slug: 'fees', label: 'Fees', icon: 'percent', phase: 1 },
    ],
  },
};

export function findSection(id: DashboardId, slug: string): NavItem | undefined {
  return dashboards[id].nav.find((n) => n.slug === slug);
}

export function isDashboardId(value: string): value is DashboardId {
  return Object.hasOwn(dashboards, value);
}
