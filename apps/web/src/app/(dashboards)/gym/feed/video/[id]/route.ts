import { z } from 'zod';
import { MAX_VIDEO_BYTES } from '@bgym/shared';
import { apiStream } from '@/lib/api.server';

/**
 * Passes a video from the browser to the API (development video driver), streamed so this
 * server never holds the file. With Cloudflare Stream the browser uploads to Cloudflare instead.
 *
 * Route handlers don't get server actions' built-in CSRF check, so the request must come from
 * this site (Origin), and be multipart. The API checks the upload ticket belongs to the person.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ message: 'Forbidden' }, { status: 403 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ message: 'Unknown upload.' }, { status: 404 });
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data') || !request.body) return Response.json({ message: 'Send the video as a file.' }, { status: 400 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_VIDEO_BYTES + 64 * 1024) return Response.json({ message: 'That video is too big.' }, { status: 413 });
  return apiStream(`/v1/videos/${id.data}/file`, request.body, type);
}
