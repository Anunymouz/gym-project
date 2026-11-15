import { Injectable } from '@nestjs/common';
import { DEFAULT_DELIVERY, deliverySettingsSchema, type DeliverySettings } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const KEY = 'store.delivery';
/** Straight-line distance × this ≈ road distance in Accra traffic grids. */
const ROAD_FACTOR = 1.3;

export interface Point {
  latitude: number;
  longitude: number;
}

export interface DeliveryQuote {
  provider: 'manual' | 'yango';
  feePesewas: number;
  distanceMeters: number;
  /** Too far, or the courier said no. */
  deliverable: boolean;
}

/**
 * Prices and arranges delivery. Today: "manual" (a rider the seller or BGYM arranges), priced
 * as a base fee plus a rate per km, up to a maximum distance, set by the BGYM team. A courier
 * API (Yango Delivery) can be added behind the same quote/dispatch calls once BGYM has a
 * business account and API access.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async settings(): Promise<DeliverySettings> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: KEY } });
    const parsed = deliverySettingsSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : DEFAULT_DELIVERY;
  }

  async setSettings(actorId: string, input: DeliverySettings): Promise<DeliverySettings> {
    const before = await this.settings();
    await this.prisma.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: input }, update: { value: input } });
    await this.audit.record({ action: 'store.delivery_settings', actorId, targetType: 'platform', metadata: { from: before, to: input } });
    return input;
  }

  async quote(from: Point, to: Point, settings?: DeliverySettings): Promise<DeliveryQuote> {
    const s = settings ?? (await this.settings());
    const meters = Math.round(haversine(from, to) * ROAD_FACTOR);
    const km = Math.max(1, Math.ceil(meters / 1000));
    return { provider: 'manual', feePesewas: s.baseFeePesewas + km * s.perKmPesewas, distanceMeters: meters, deliverable: km <= s.maxKm };
  }
}

function haversine(a: Point, b: Point): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
