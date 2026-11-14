import { HardHat } from '@phosphor-icons/react/ssr';
import { PageHeader } from './ui/page-header';

export function SectionPlaceholder({ title, dashboard, phase }: { title: string; dashboard: string; phase: number }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} subtitle={dashboard} />
      <div className="grid place-items-center rounded-card border border-dashed border-[#C9CDE0] bg-white px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-flare-50 text-flare">
          <HardHat size={30} weight="duotone" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-bold">{title} is coming in Phase {phase}</h2>
        <p className="mt-1 max-w-md text-mute">
          This section is designed in the wireframes and is scheduled in the roadmap. Navigation is live so the layout can be reviewed end to end.
        </p>
      </div>
    </div>
  );
}
