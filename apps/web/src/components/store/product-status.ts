import type { SellerProduct } from '@bgym/shared';

/** How each product status is shown (used by server and client components). */
export const STATUS_BADGE: Record<SellerProduct['status'], { label: string; tone: 'success' | 'warning' | 'info' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'warning' },
  pending_review: { label: 'Waiting for review', tone: 'info' },
  active: { label: 'Live', tone: 'success' },
  archived: { label: 'Archived', tone: 'danger' },
};
