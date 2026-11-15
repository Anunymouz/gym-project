import type { RevenueMonth } from '@bgym/shared';
import { monthSchema } from '@bgym/shared';
import { api, ApiError } from '@/lib/api.server';
import { toCsv } from '@bgym/shared';
import { channelLabel } from '@/lib/format';
import { getCurrentGym } from '@/lib/session.server';

const cedis = (pesewas: number) => (pesewas / 100).toFixed(2);
const accraTime = (iso: string) => iso.slice(0, 16).replace('T', ' '); // Accra is UTC+0

/** Downloads one month of payments as a spreadsheet (owners and managers; the API checks). */
export async function GET(request: Request): Promise<Response> {
  const month = monthSchema.safeParse(new URL(request.url).searchParams.get('month'));
  if (!month.success) return new Response('Choose a month like 2026-11', { status: 400 });
  const gym = await getCurrentGym();
  if (!gym) return new Response('No gym', { status: 404 });

  let data: RevenueMonth;
  try {
    data = await api<RevenueMonth>(`/v1/staff/gyms/${gym.id}/revenue?month=${month.data}`);
  } catch (err) {
    return new Response(err instanceof ApiError && err.status === 403 ? 'Only owners and managers can download revenue.' : 'Could not prepare the file.', { status: err instanceof ApiError ? err.status : 502 });
  }

  const csv = toCsv([
    ['Date (Accra)', 'Reference', 'Member', 'Plan', 'Paid via', 'Amount (GHS)', 'BGYM fee (GHS)', 'Your share (GHS)'],
    ...data.payments.map((p) => [accraTime(p.paidAt), p.reference, p.memberName ?? '', p.plan, channelLabel(p.channel), cedis(p.grossPesewas), cedis(p.feePesewas), cedis(p.netPesewas)]),
    [],
    ['Total', '', '', '', `${data.totals.payments} payments`, cedis(data.totals.grossPesewas), cedis(data.totals.feePesewas), cedis(data.totals.netPesewas)],
  ]);
  const name = `bgym-${gym.slug}-${data.month}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
