import { Controller, Get, Param, Query } from '@nestjs/common';
import { gymSlugSchema, nearbyGymsQuerySchema, type GymDetail, type NearbyGymsQuery } from '@bgym/shared';
import { GymsService, type NearbyGym } from './gyms.service.js';
import { Public } from '../auth/decorators.js';

@Public()
@Controller('gyms')
export class GymsController {
  constructor(private readonly gyms: GymsService) {}

  /** GET /v1/gyms/nearby?lat=5.6357&lng=-0.1573&radiusKm=5 */
  @Get('nearby')
  nearby(@Query({ schema: nearbyGymsQuerySchema }) query: NearbyGymsQuery): Promise<NearbyGym[]> {
    return this.gyms.findNearby(query);
  }

  /** GET /v1/gyms/iron-haven-east-legon */
  @Get(':slug')
  bySlug(@Param('slug', { schema: gymSlugSchema }) slug: string): Promise<GymDetail> {
    return this.gyms.findBySlug(slug);
  }
}
