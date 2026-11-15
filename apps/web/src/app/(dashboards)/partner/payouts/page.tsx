import type { Metadata } from 'next';
import { Suspense } from 'react';
import { formatGhs, formatPercent, pesewas, type GymPayout, type PayoutBank, type SellerAccount, type SellerOrder } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PayoutSection } from '@/components/gym/payout-section';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { requestTime } from '@/lib/format';
import { requestPartnerPayoutCode, savePartnerPayout } from '../../store-actions';

export const metadata: Metadata = { title: sectionTitle('partner', 'payouts') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payouts />
    </Suspense>
  );
}

async function Payouts() {
  const [me, payout, banks, orders] = await Promise.all([api<SellerAccount>('/v1/partner/me'), api<GymPayout>('/v1/partner/payout'), api<PayoutBank[]>('/v1/partner/payout/banks'), api<SellerOrder[]>('/v1/partner/orders?filter=all')]);
  const month = new Date(requestTime()).toISOString().slice(0, 7);
  const sold = orders.filter((o) => o.createdAt.startsWith(month) && !['cancelled', 'refunded'].includes(o.status));
  const gross = sold.reduce((s, o) => s + o.subtotalPesewas, 0);
  const fee = sold.reduce((s, o) => s + o.commissionPesewas, 0);
  const ghs = (p: number) => formatGhs(pesewas(p));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payouts" subtitle={`Paystack sends your share of each sale to your payout account. BGYM’s commission: ${formatPercent(me.commissionBps)}. Delivery fees go to BGYM, which pays the riders.`} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="You receive this month" value={ghs(gross - fee)} note={`${sold.length} orders`} tone="success" />
        <StatCard label="Sales" value={ghs(gross)} note="items, before commission" tone="info" />
        <StatCard label="BGYM’s commission" value={ghs(fee)} note={formatPercent(me.commissionBps)} tone="warning" />
      </div>
      <PayoutSection payout={payout} banks={banks} ownerEmail={me.users[0]?.email ?? ''} description="Where your share of each sale is sent by Paystack, minus BGYM’s commission." requestCode={requestPartnerPayoutCode} save={savePartnerPayout} />
    </div>
  );
}
