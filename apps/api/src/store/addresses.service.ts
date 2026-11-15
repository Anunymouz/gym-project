import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_SAVED_ADDRESSES, type AddressInput, type SavedAddress } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type Row = { id: string; label: string | null; addressText: string; landmark: string | null; gpsDigitalAddress: string | null; contactPhone: string; isDefault: boolean; latitude: number; longitude: number };

/** Saved delivery addresses: a map point plus words a rider can use, and a phone number. */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavedAddress[]> {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id, label, "addressText", landmark, "gpsDigitalAddress", "contactPhone", "isDefault",
             ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
      FROM addresses WHERE "userId" = ${userId}::uuid ORDER BY "isDefault" DESC, "createdAt" DESC`;
    return rows.map((r) => ({ ...r, label: r.label ?? undefined, landmark: r.landmark ?? undefined }));
  }

  async get(userId: string, id: string): Promise<SavedAddress> {
    const found = (await this.list(userId)).find((a) => a.id === id);
    if (!found) throw new NotFoundException('Address not found');
    return found;
  }

  /** New addresses become the default (the one checkout picks). */
  async create(userId: string, input: AddressInput): Promise<SavedAddress[]> {
    if ((await this.prisma.address.count({ where: { userId } })) >= MAX_SAVED_ADDRESSES) throw new BadRequestException('You have 10 saved addresses. Remove one first.');
    await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      await tx.$executeRaw`
        INSERT INTO addresses (id, "userId", label, location, "addressText", landmark, "gpsDigitalAddress", "contactPhone", "isDefault")
        VALUES (gen_random_uuid(), ${userId}::uuid, ${input.label || null}, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
                ${input.addressText}, ${input.landmark || null}, ${input.gpsDigitalAddress ?? null}, ${input.contactPhone}, true)`;
    });
    return this.list(userId);
  }

  async update(userId: string, id: string, input: AddressInput): Promise<SavedAddress[]> {
    const n = await this.prisma.$executeRaw`
      UPDATE addresses SET label = ${input.label || null}, location = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
        "addressText" = ${input.addressText}, landmark = ${input.landmark || null}, "gpsDigitalAddress" = ${input.gpsDigitalAddress ?? null}, "contactPhone" = ${input.contactPhone}
      WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid`;
    if (!n) throw new NotFoundException('Address not found');
    return this.list(userId);
  }

  async setDefault(userId: string, id: string): Promise<SavedAddress[]> {
    if (!(await this.prisma.address.count({ where: { id, userId } }))) throw new NotFoundException('Address not found');
    await this.prisma.$transaction([this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }), this.prisma.address.update({ where: { id }, data: { isDefault: true } })]);
    return this.list(userId);
  }

  async remove(userId: string, id: string): Promise<SavedAddress[]> {
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('Address not found');
    return this.list(userId);
  }
}
