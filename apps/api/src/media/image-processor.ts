import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { MIN_PHOTO_LONG_SIDE } from '@bgym/shared';

export interface ProcessedPhoto {
  large: { data: Buffer; width: number; height: number };
  thumb: { data: Buffer };
}

/**
 * Turns an upload into the two images we store. The file's claimed type is ignored: sharp
 * decodes it, so only real JPEG/PNG/WebP images get through. Re-encoding to WebP also drops
 * all metadata (EXIF, including the GPS location phones record), after applying the EXIF
 * rotation so the photo stays upright.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const options = { limitInputPixels: 50_000_000, failOn: 'error' as const };
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(input, options).metadata();
    format = meta.format;
    // autoOrient dimensions account for EXIF rotation (portrait phone photos).
    width = meta.autoOrient?.width ?? meta.width ?? 0;
    height = meta.autoOrient?.height ?? meta.height ?? 0;
  } catch {
    throw new BadRequestException('That file isn’t a photo we can read. Use a JPEG, PNG or WebP image.');
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) throw new BadRequestException('Use a JPEG, PNG or WebP photo.');
  if (Math.max(width, height) < MIN_PHOTO_LONG_SIDE) throw new BadRequestException(`That photo is too small. Use one at least ${MIN_PHOTO_LONG_SIDE} pixels wide.`);

  const base = () => sharp(input, options).rotate();
  const [large, thumb] = await Promise.all([
    base().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }),
    base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
  ]);
  return { large: { data: large.data, width: large.info.width, height: large.info.height }, thumb: { data: thumb } };
}

/** Smallest photo we accept as a profile picture (the short side, after cropping square). */
const MIN_AVATAR_SIDE = 200;

/**
 * A profile picture: the same safe decode and re-encode as other photos (metadata, including
 * GPS, removed), cropped to a centred square. 512 px for the profile, 160 px for lists.
 */
export async function processAvatar(input: Buffer): Promise<{ large: Buffer; thumb: Buffer }> {
  const options = { limitInputPixels: 50_000_000, failOn: 'error' as const };
  let format: string | undefined;
  let short = 0;
  try {
    const meta = await sharp(input, options).metadata();
    format = meta.format;
    short = Math.min(meta.autoOrient?.width ?? meta.width ?? 0, meta.autoOrient?.height ?? meta.height ?? 0);
  } catch {
    throw new BadRequestException('That file isn’t a photo we can read. Use a JPEG, PNG or WebP image.');
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) throw new BadRequestException('Use a JPEG, PNG or WebP photo.');
  if (short < MIN_AVATAR_SIDE) throw new BadRequestException(`That photo is too small. Use one at least ${MIN_AVATAR_SIDE} pixels across.`);
  const square = (size: number, quality: number) => sharp(input, options).rotate().resize({ width: size, height: size, fit: 'cover', position: 'attention' }).webp({ quality }).toBuffer();
  const [large, thumb] = await Promise.all([square(512, 82), square(160, 78)]);
  return { large, thumb };
}
