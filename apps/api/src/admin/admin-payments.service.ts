import { Injectable } from '@nestjs/common';
import type { AdminPaymentsMonth } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** What members paid through BGYM in a month, and BGYM's share, by gym. */
@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async month(month?: string): Promise<AdminPaymentsMonth> {
    const now = new Date();
    const key = month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [y, m] = key.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const [rows, months] = await Promise.all([
      this.prisma.$queryRaw<Array<{ gymId: string; gym: string; feeBps: number | null; payments: bigint; gross: bigint; fee: bigint }>>`
        SELECT g.id AS "gymId", g.name AS gym, g."platformFeeBps" AS "feeBps",
               COUNT(*) AS payments, SUM(p."amountPesewas") AS gross, SUM(p."platformFeePesewas") AS fee
        FROM payments p JOIN memberships ms ON ms."paymentId" = p.id JOIN gyms g ON g.id = ms."gymId"
        WHERE p.status = 'success' AND p."paidAt" >= ${from} AND p."paidAt" < ${to}
        GROUP BY g.id, g.name, g."platformFeeBps"
        ORDER BY SUM(p."amountPesewas") DESC`,
      this.prisma.$queryRaw<Array<{ month: string }>>`
        SELECT DISTINCT to_char(p."paidAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month
        FROM payments p WHERE p.status = 'success' AND p."paidAt" IS NOT NULL ORDER BY month DESC LIMIT 36`,
    ]);
    const byGym = rows.map((r) => ({ gymId: r.gymId, gym: r.gym, feeBps: r.feeBps, payments: Number(r.payments), grossPesewas: Number(r.gross), feePesewas: Number(r.fee) }));
    const gross = byGym.reduce((t, r) => t + r.grossPesewas, 0);
    const fee = byGym.reduce((t, r) => t + r.feePesewas, 0);
    const list = months.map((r) => r.month);
    if (!list.includes(key)) list.push(key);
    return {
      month: key,
      months: list.sort().reverse(),
      totals: { payments: byGym.reduce((t, r) => t + r.payments, 0), grossPesewas: gross, feePesewas: fee, gymsPesewas: gross - fee },
      byGym,
    };
  }
}
