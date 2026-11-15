import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAX_GYM_PHOTOS, type GymPhotoItem } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { processPhoto } from './image-processor.js';
import { StorageService } from './storage.service.js';

/** A gym's photos. The first (lowest sortOrder) is the cover, mirrored to gyms.coverUrl. */
@Injectable()
export class GymPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(gymId: string): Promise<GymPhotoItem[]> {
    const rows = await this.prisma.gymPhoto.findMany({ where: { gymId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((r, i) => ({ id: r.id, url: this.storage.publicUrl(r.key), thumbUrl: this.storage.publicUrl(r.thumbKey), width: r.width, height: r.height, isCover: i === 0 }));
  }

  async upload(gymId: string, actorId: string, file: Buffer | undefined): Promise<GymPhotoItem[]> {
    if (!file?.length) throw new BadRequestException('Choose a photo to upload.');
    if ((await this.prisma.gymPhoto.count({ where: { gymId } })) >= MAX_GYM_PHOTOS) {
      throw new ConflictException(`A gym can have up to ${MAX_GYM_PHOTOS} photos. Delete one to add another.`);
    }
    const photo = await processPhoto(file);
    const id = randomUUID();
    const key = `gyms/${gymId}/${id}.webp`;
    const thumbKey = `gyms/${gymId}/${id}_t.webp`;
    await Promise.all([this.storage.put(key, photo.large.data, 'image/webp'), this.storage.put(thumbKey, photo.thumb.data, 'image/webp')]);

    const last = await this.prisma.gymPhoto.findFirst({ where: { gymId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    await this.prisma.gymPhoto.create({
      data: { id, gymId, key, thumbKey, width: photo.large.width, height: photo.large.height, sortOrder: (last?.sortOrder ?? -1) + 1, createdById: actorId },
    });
    await this.audit.record({ action: 'gym.photo_added', actorId, targetType: 'gym', targetId: gymId, metadata: { photoId: id } });
    await this.syncCover(gymId);
    return this.list(gymId);
  }

  async remove(gymId: string, photoId: string, actorId: string): Promise<GymPhotoItem[]> {
    const photo = await this.prisma.gymPhoto.findFirst({ where: { id: photoId, gymId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.gymPhoto.delete({ where: { id: photo.id } });
    await this.storage.delete([photo.key, photo.thumbKey]);
    await this.audit.record({ action: 'gym.photo_removed', actorId, targetType: 'gym', targetId: gymId, metadata: { photoId } });
    await this.syncCover(gymId);
    return this.list(gymId);
  }

  async makeCover(gymId: string, photoId: string, actorId: string): Promise<GymPhotoItem[]> {
    const photos = await this.prisma.gymPhoto.findMany({ where: { gymId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
    if (!photos.some((p) => p.id === photoId)) throw new NotFoundException('Photo not found');
    const order = [photoId, ...photos.map((p) => p.id).filter((id) => id !== photoId)];
    await this.prisma.$transaction(order.map((id, sortOrder) => this.prisma.gymPhoto.update({ where: { id }, data: { sortOrder } })));
    await this.audit.record({ action: 'gym.cover_changed', actorId, targetType: 'gym', targetId: gymId, metadata: { photoId } });
    await this.syncCover(gymId);
    return this.list(gymId);
  }

  /** gyms.coverUrl follows the first photo (lists and search read only the gym row). */
  private async syncCover(gymId: string): Promise<void> {
    const first = await this.prisma.gymPhoto.findFirst({ where: { gymId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { key: true } });
    await this.prisma.gym.update({ where: { id: gymId }, data: { coverUrl: first ? this.storage.publicUrl(first.key) : null } });
  }
}
