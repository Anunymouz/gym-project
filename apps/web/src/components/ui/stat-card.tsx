import { Badge, type BadgeTone } from './badge';

export function StatCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: BadgeTone }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-mute">{label}</p>
      <p className="mt-1.5 truncate text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      <div className="mt-2">
        <Badge tone={tone}>{note}</Badge>
      </div>
    </div>
  );
}
