import { Controller, Get, Query } from '@nestjs/common';
import { nearbyGymsQuerySchema, type NearbyGymsQuery } from '@bgym/shared';
import { GymsService, type NearbyGym } from './gyms.service.js';

@Controller('gyms')
export class GymsController {
  constructor(private readonly gyms: GymsService) {}

  /** GET /v1/gyms/nearby?lat=5.6357&lng=-0.1573&radiusKm=5 */
  @Get('nearby')
  nearby(@Query({ schema: nearbyGymsQuerySchema }) query: NearbyGymsQuery): Promise<NearbyGym[]> {
    return this.gyms.findNearby(query);
  }
}
