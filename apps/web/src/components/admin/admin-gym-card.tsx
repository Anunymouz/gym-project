import { ArrowSquareOut, CheckCircle, MapPin, Phone, UserCircle, WarningCircle } from '@phosphor-icons/react/ssr';
import { formatGhs, pesewas, planPeriodLabel, type AdminGym } from '@bgym/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { GymDecision } from './gym-decision';
import { GymFeeEditor } from './gym-fee-editor';

export const gymStatus: Record<AdminGym['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Live', tone: 'success' },
  pending_review: { label: 'Waiting for review', tone: 'warning' },
  draft: { label: 'Draft', tone: 'info' },
  suspended: { label: 'Paused', tone: 'danger' },
};

/** Everything the BGYM team needs to decide on a gym, with the decision buttons. */
export function AdminGymCard({ gym, defaultFeeBps }: { gym: AdminGym; defaultFeeBps: number }) {
  const mapUrl = `https://www.google.com/maps?q=${gym.location.lat},${gym.location.lng}`;
  return (
    <article className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold">{gym.name}</h2>
            <Badge tone={gymStatus[gym.status].tone}>{gymStatus[gym.status].label}</Badge>
          </div>
          <p className="text-sm text-mute">
            {gym.addressText} · {gym.submittedAt ? `sent ${formatDate(gym.submittedAt)}` : `created ${formatDate(gym.createdAt)}`}
          </p>
        </div>
        <GymDecision gymId={gym.id} gymName={gym.name} status={gym.status} canApprove={gym.payoutReady && gym.plans.some((p) => p.isActive)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="inline-flex items-center gap-1.5"><UserCircle size={18} className="text-mute" aria-hidden /> {gym.owner ? `${gym.owner.name ?? 'No name'} · ${gym.owner.email}` : 'No owner'}</p>
          {gym.phone && <p className="inline-flex items-center gap-1.5"><Phone size={18} className="text-mute" aria-hidden /> <a href={`tel:${gym.phone}`} className="hover:underline">{gym.phone}</a></p>}
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-flare hover:underline">
            <MapPin size={18} aria-hidden /> Check location on Google Maps <ArrowSquareOut size={14} aria-hidden />
          </a>
          <p className={`inline-flex items-center gap-1.5 font-semibold ${gym.payoutReady ? 'text-success' : 'text-danger'}`}>
            {gym.payoutReady ? <CheckCircle size={18} weight="fill" aria-hidden /> : <WarningCircle size={18} weight="fill" aria-hidden />}
            {gym.payoutReady ? 'Payout account connected' : 'No payout account yet'}
          </p>
          <GymFeeEditor gymId={gym.id} gymName={gym.name} feeBps={gym.feeBps} defaultBps={defaultFeeBps} />
        </div>
        <p className="text-sm text-midnight/80 md:col-span-1">{gym.description ?? <span className="text-mute">No description</span>}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {gym.plans.length === 0 && <li className="text-mute">No plans</li>}
          {gym.plans.map((p) => (
            <li key={p.name} className={p.isActive ? 'flex justify-between gap-2' : 'flex justify-between gap-2 text-mute line-through'}>
              <span>{p.name} <span className="text-mute">· {planPeriodLabel(p.durationDays)}</span></span>
              <span className="font-bold tabular-nums">{formatGhs(pesewas(p.pricePesewas))}</span>
            </li>
          ))}
        </ul>
      </div>
      {gym.reviewNote && <p className="mt-4 rounded-control bg-cloud p-3 text-sm"><span className="font-bold">Last note to the owner:</span> {gym.reviewNote}</p>}
    </article>
  );
}
