import { Injectable } from '@nestjs/common';
import type { NearbyGymsQuery } from '@bgym/shared';
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
}
