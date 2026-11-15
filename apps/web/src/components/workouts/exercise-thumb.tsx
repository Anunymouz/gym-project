import { FilmStrip, ImageSquare, PersonSimpleRun } from '@phosphor-icons/react/ssr';
import type { ExerciseMedia } from '@bgym/shared';
import { mediaSrc } from '@/lib/media';

/**
 * A small preview of an exercise's demo. Photos and our own videos' posters come from BGYM
 * storage; animations from an imported library are on that library's servers, which the
 * dashboard's content policy doesn't load, so they show as an icon.
 */
export function ExerciseThumb({ media, className = 'size-14' }: { media: ExerciseMedia | null | undefined; className?: string }) {
  const src = media && media.type !== 'animation' ? media.thumbUrl ?? (media.type === 'image' ? media.url : null) : null;
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-cloud text-mute ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- server-resized
        <img src={mediaSrc(src)} alt="" className="size-full object-cover" />
      ) : media?.type === 'animation' ? (
        <PersonSimpleRun size={22} aria-hidden />
      ) : (
        <ImageSquare size={22} aria-hidden />
      )}
      {media?.type === 'video' && <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-midnight/80 text-white"><FilmStrip size={12} aria-hidden /></span>}
    </span>
  );
}
