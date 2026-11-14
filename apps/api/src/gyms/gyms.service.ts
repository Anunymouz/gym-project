import { Injectable, NotFoundException } from '@nestjs/common';
import type { GymDetail, NearbyGymsQuery, OpeningHours } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NearbyGym {
  id: string;
  name: string;
  slug: string;
  addressText: string;
  coverUrl: string | null;
  facilities: string[];
  distanceKm: number;
  fromPricePesewas: number | null;
}

@Injectable()
export class GymsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Live gyms within the radius, nearest first, with their cheapest active plan.
   * Uses the GiST index on gyms.location via ST_DWithin. All inputs are bound parameters.
   */
  async findNearby({ lat, lng, radiusKm }: NearbyGymsQuery): Promise<NearbyGym[]> {
    const rows = await this.prisma.$queryRaw<
      Array<Omit<NearbyGym, 'distanceKm' | 'fromPricePesewas'> & { distance_m: number; from_price: number | null }>
    >`
      SELECT g.id, g.name, g.slug, g."addressText", g."coverUrl", g.facilities,
             ST_Distance(g.location, me.point) AS distance_m,
             (SELECT MIN(p."pricePesewas") FROM membership_plans p
               WHERE p."gymId" = g.id AND p."isActive") AS from_price
      FROM gyms g,
           (SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS point) me
      WHERE g.status = 'active'
        AND ST_DWithin(g.location, me.point, ${radiusKm * 1000})
      ORDER BY distance_m ASC
      LIMIT 50`;

    return rows.map(({ distance_m, from_price, ...gym }) => ({
      ...gym,
      distanceKm: Math.round((distance_m / 1000) * 10) / 10,
      fromPricePesewas: from_price,
    }));
  }

  /** Public gym page: live gyms only, with active plans cheapest first. */
  async findBySlug(slug: string): Promise<GymDetail> {
    const [gym] = await this.prisma.$queryRaw<
      Array<Omit<GymDetail, 'location' | 'photos' | 'plans' | 'openingHours'> & { openingHours: OpeningHours; lat: number; lng: number }>
    >`
      SELECT id, name, slug, description, "addressText", phone, "coverUrl", facilities, "openingHours",
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM gyms WHERE slug = ${slug} AND status = 'active' LIMIT 1`;
    if (!gym) throw new NotFoundException('We couldn’t find that gym.');

    const [photos, plans] = await Promise.all([
      this.prisma.gymPhoto.findMany({ where: { gymId: gym.id }, orderBy: { sortOrder: 'asc' }, select: { url: true } }),
      this.prisma.membershipPlan.findMany({
        where: { gymId: gym.id, isActive: true },
        orderBy: { pricePesewas: 'asc' },
        select: { id: true, name: true, description: true, durationDays: true, pricePesewas: true },
      }),
    ]);
    const { lat, lng, ...rest } = gym;
    return { ...rest, location: { lat, lng }, photos: photos.map((p) => p.url), plans };
  }
}
