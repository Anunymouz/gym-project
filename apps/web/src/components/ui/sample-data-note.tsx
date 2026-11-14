import { Info } from '@phosphor-icons/react/ssr';

/** Marks screens that show placeholder figures until they are wired to the API. */
export function SampleDataNote({ phase }: { phase: number }) {
  return (
    <p className="inline-flex items-center gap-2 self-start rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet">
      <Info size={16} weight="bold" aria-hidden />
      Sample data · connects to live data in Phase {phase}
    </p>
  );
}
