import { MIN_PHOTO_LONG_SIDE } from '@bgym/shared';

/**
 * Shrinks big phone photos in the browser before upload (faster on mobile data). The server
 * still decodes, checks and re-encodes every photo, so this is only about speed.
 */
export async function preparePhoto(file: File, maxSide = 2400): Promise<Blob> {
  if (file.size > 40 * 1024 * 1024) throw new Error('That file is too big.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the photo's rotation
  } catch {
    throw new Error('This browser can’t read that file. Use a JPEG or PNG photo.');
  }
  const long = Math.max(bitmap.width, bitmap.height);
  if (long < MIN_PHOTO_LONG_SIDE) throw new Error(`Too small: use a photo at least ${MIN_PHOTO_LONG_SIDE} pixels wide.`);
  if (long <= maxSide && file.size <= 2.5 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp')) return file;
  const scale = Math.min(1, maxSide / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Couldn’t prepare that photo.');
  return blob;
}
