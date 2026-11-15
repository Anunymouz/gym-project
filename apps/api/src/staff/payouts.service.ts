import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { GymPayout, PayoutBank, PayoutMethod, updatePayoutSchema } from '@bgym/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { OtpService } from '../auth/otp.service.js';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { payoutChangedEmail } from '../mail/templates.js';
import { PaystackClient } from '../payments/paystack.client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Banks and MoMo providers for the development payment simulator (no Paystack account needed). */
const DEV_BANKS: PayoutBank[] = [
  { code: 'MTN', name: 'MTN Mobile Money', method: 'mobile_money' },
  { code: 'VOD', name: 'Telecel Cash', method: 'mobile_money' },
  { code: 'ATL', name: 'AirtelTigo Money', method: 'mobile_money' },
  { code: '280100', name: 'Access Bank Ghana', method: 'bank' },
  { code: '300303', name: 'Absa Bank Ghana', method: 'bank' },
  { code: '130100', name: 'Ecobank Ghana', method: 'bank' },
  { code: '040100', name: 'GCB Bank', method: 'bank' },
  { code: '230100', name: 'Stanbic Bank Ghana', method: 'bank' },
];
const BANKS_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Where a gym's money is paid: a Paystack subaccount. Changing it needs a fresh code from
 * the owner's email, is audited, and the owner is told; we keep only a masked copy.
 */
@Injectable()
export class PayoutsService {
  private banksCache: { at: number; banks: PayoutBank[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get simulated(): boolean {
    return this.config.get('PAYMENTS_DRIVER', { infer: true }) === 'dev';
  }

  async banks(): Promise<PayoutBank[]> {
    if (this.simulated) return DEV_BANKS;
    if (this.banksCache && Date.now() - this.banksCache.at < BANKS_TTL_MS) return this.banksCache.banks;
    const banks = (await this.paystack.banks())
      .filter((b) => b.active)
      .map((b): PayoutBank => ({ code: b.code, name: b.name, method: b.type === 'mobile_money' ? 'mobile_money' : 'bank' }))
      .sort((a, b) => (a.method === b.method ? a.name.localeCompare(b.name) : a.method === 'mobile_money' ? -1 : 1));
    this.banksCache = { at: Date.now(), banks };
    return banks;
  }

  async get(gymId: string): Promise<GymPayout> {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { paystackSubaccountCode: true, payoutMethod: true, payoutBankName: true, payoutAccountName: true, payoutAccountLast4: true, payoutUpdatedAt: true },
    });
    if (!gym) throw new NotFoundException('Gym not found');
    return {
      connected: !!gym.paystackSubaccountCode,
      method: (gym.payoutMethod as PayoutMethod | null) ?? null,
      bankName: gym.payoutBankName,
      accountName: gym.payoutAccountName,
      accountLast4: gym.payoutAccountLast4,
      updatedAt: gym.payoutUpdatedAt?.toISOString() ?? null,
    };
  }

  /** Emails the owner a code that confirms the change. */
  async requestCode(userId: string, ipHash: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    await this.otp.request(user.email, ipHash, 'payout');
  }

  async update(gymId: string, userId: string, input: z.output<typeof updatePayoutSchema>): Promise<GymPayout> {
    const gym = await this.prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { name: true, email: true, paystackSubaccountCode: true } });
    const { subaccountCode, bank, last4 } = await this.connect(userId, gym.paystackSubaccountCode, gym.name, gym.email, input);
    await this.prisma.gym.update({
      where: { id: gymId },
      data: { paystackSubaccountCode: subaccountCode, payoutMethod: bank.method, payoutBankName: bank.name, payoutAccountName: input.accountName, payoutAccountLast4: last4, payoutUpdatedAt: new Date() },
    });
    await this.audit.record({
      action: gym.paystackSubaccountCode ? 'gym.payout_changed' : 'gym.payout_added',
      actorId: userId,
      targetType: 'gym',
      targetId: gymId,
      metadata: { bank: bank.name, last4 },
    });
    // Tell every owner, so a change by one person (or a stolen session) never goes unnoticed.
    const owners = await this.prisma.gymStaff.findMany({ where: { gymId, role: 'owner' }, select: { user: { select: { email: true } } } });
    const account = `${bank.name} ending ${last4} (${input.accountName})`;
    await Promise.allSettled(owners.map((o) => this.mail.send(payoutChangedEmail(o.user.email, gym.name, account))));
    return this.get(gymId);
  }

  /** A trainer's own payout account (their sessions and packages are paid there). */
  async trainerPayout(trainerId: string): Promise<GymPayout> {
    const t = await this.prisma.trainer.findUniqueOrThrow({ where: { id: trainerId }, select: { paystackSubaccountCode: true, payoutMethod: true, payoutBankName: true, payoutAccountName: true, payoutAccountLast4: true, payoutUpdatedAt: true } });
    return {
      connected: !!t.paystackSubaccountCode,
      method: (t.payoutMethod as PayoutMethod | null) ?? null,
      bankName: t.payoutBankName,
      accountName: t.payoutAccountName,
      accountLast4: t.payoutAccountLast4,
      updatedAt: t.payoutUpdatedAt?.toISOString() ?? null,
    };
  }

  async updateTrainer(trainerId: string, userId: string, input: z.output<typeof updatePayoutSchema>): Promise<GymPayout> {
    const t = await this.prisma.trainer.findUniqueOrThrow({ where: { id: trainerId }, select: { paystackSubaccountCode: true, user: { select: { name: true, email: true } } } });
    const name = t.user.name ?? 'BGYM trainer';
    const { subaccountCode, bank, last4 } = await this.connect(userId, t.paystackSubaccountCode, `${name} (BGYM trainer)`, t.user.email, input);
    await this.prisma.trainer.update({
      where: { id: trainerId },
      data: { paystackSubaccountCode: subaccountCode, payoutMethod: bank.method, payoutBankName: bank.name, payoutAccountName: input.accountName, payoutAccountLast4: last4, payoutUpdatedAt: new Date() },
    });
    await this.audit.record({ action: t.paystackSubaccountCode ? 'trainer.payout_changed' : 'trainer.payout_added', actorId: userId, targetType: 'trainer', targetId: trainerId, metadata: { bank: bank.name, last4 } });
    await this.mail.send(payoutChangedEmail(t.user.email, name, `${bank.name} ending ${last4} (${input.accountName})`)).catch(() => undefined);
    return this.trainerPayout(trainerId);
  }

  /** A store partner's payout account (their share of each sale is paid there). */
  async sellerPayout(sellerId: string): Promise<GymPayout> {
    const t = await this.prisma.seller.findUniqueOrThrow({ where: { id: sellerId }, select: { paystackSubaccountCode: true, payoutMethod: true, payoutBankName: true, payoutAccountName: true, payoutAccountLast4: true, payoutUpdatedAt: true } });
    return {
      connected: !!t.paystackSubaccountCode,
      method: (t.payoutMethod as PayoutMethod | null) ?? null,
      bankName: t.payoutBankName,
      accountName: t.payoutAccountName,
      accountLast4: t.payoutAccountLast4,
      updatedAt: t.payoutUpdatedAt?.toISOString() ?? null,
    };
  }

  async updateSeller(sellerId: string, userId: string, input: z.output<typeof updatePayoutSchema>): Promise<GymPayout> {
    const seller = await this.prisma.seller.findUniqueOrThrow({ where: { id: sellerId }, select: { name: true, contactEmail: true, paystackSubaccountCode: true, type: true } });
    if (seller.type !== 'partner') throw new BadRequestException('BGYM’s own sales go to BGYM’s Paystack account.');
    const { subaccountCode, bank, last4 } = await this.connect(userId, seller.paystackSubaccountCode, `${seller.name} (BGYM Store partner)`, seller.contactEmail, input);
    await this.prisma.seller.update({
      where: { id: sellerId },
      data: { paystackSubaccountCode: subaccountCode, payoutMethod: bank.method, payoutBankName: bank.name, payoutAccountName: input.accountName, payoutAccountLast4: last4, payoutUpdatedAt: new Date() },
    });
    await this.audit.record({ action: seller.paystackSubaccountCode ? 'seller.payout_changed' : 'seller.payout_added', actorId: userId, targetType: 'seller', targetId: sellerId, metadata: { bank: bank.name, last4 } });
    const users = await this.prisma.partnerUser.findMany({ where: { sellerId }, select: { user: { select: { email: true } } } });
    await Promise.allSettled(users.map((u) => this.mail.send(payoutChangedEmail(u.user.email, seller.name, `${bank.name} ending ${last4} (${input.accountName})`))));
    return this.sellerPayout(sellerId);
  }

  /**
   * Checks the details, confirms the person's emailed step-up code, then creates or updates
   * the Paystack subaccount. The full account number goes to Paystack only.
   */
  private async connect(userId: string, existingCode: string | null, businessName: string, email: string | null, input: z.output<typeof updatePayoutSchema>) {
    // Check the details first, so a typo doesn't use up the confirmation code.
    const bank = (await this.banks()).find((b) => b.code === input.bankCode);
    if (!bank) throw new BadRequestException('Choose a bank or mobile money provider from the list.');
    if (bank.method === 'mobile_money' && !/^0[235]\d{8}$/.test(input.accountNumber)) {
      throw new BadRequestException('Enter the mobile money number like 024 123 4567.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    // Step-up: prove control of the email right now, not just a signed-in session.
    await this.otp.verify(user.email, input.code, 'payout');

    let subaccountCode = existingCode;
    if (this.simulated) {
      subaccountCode ??= `ACCT_dev_${randomBytes(6).toString('hex')}`;
    } else if (subaccountCode) {
      await this.paystack.updateSubaccount(subaccountCode, { businessName, bankCode: bank.code, accountNumber: input.accountNumber });
    } else {
      subaccountCode = (await this.paystack.createSubaccount({ businessName, bankCode: bank.code, accountNumber: input.accountNumber, email })).subaccountCode;
    }
    return { subaccountCode, bank, last4: input.accountNumber.slice(-4) };
  }
}
