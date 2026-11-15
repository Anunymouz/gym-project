import Link from 'next/link';
import { CheckCircle, Circle, Hourglass, PauseCircle, WarningCircle } from '@phosphor-icons/react/ssr';
import type { GymReadiness, StaffGym } from '@bgym/shared';
import { api } from '@/lib/api.server';
import { formatDate } from '@/lib/format';
import { SubmitForReview } from './submit-for-review';

const steps: Array<{ key: keyof GymReadiness['steps']; title: string; detail: string; href: string }> = [
  { key: 'profile', title: 'Describe your gym', detail: 'A phone number and a few lines about the gym (30+ characters).', href: '/gym/settings' },
  { key: 'hours', title: 'Set opening hours', detail: 'Members see whether you’re open now.', href: '/gym/settings' },
  { key: 'plans', title: 'Add a membership plan', detail: 'What members can buy, e.g. Monthly.', href: '/gym/plans' },
  { key: 'payout', title: 'Add your payout account', detail: 'The bank or MoMo account payments are sent to.', href: '/gym/settings#payout' },
];

/** Shown on the Overview until the gym is live: the checklist, review status, or why it's paused. */
export async function GymSetup({ gym }: { gym: StaffGym }) {
  if (gym.status === 'active') return null;
  const r = await api<GymReadiness>(`/v1/staff/gyms/${gym.id}/readiness`);

  if (r.status === 'suspended') {
    return (
      <Banner tone="danger" icon={<PauseCircle size={26} weight="fill" aria-hidden />} title={`${gym.name} is paused`}>
        It’s hidden from the BGYM app and members can’t buy new memberships. Existing members can still check in.
        {r.reviewNote && <span className="mt-1 block font-semibold">Reason: {r.reviewNote}</span>}
      </Banner>
    );
  }
  if (r.status === 'pending_review') {
    return (
      <Banner tone="info" icon={<Hourglass size={26} weight="duotone" aria-hidden />} title="Waiting for review">
        The BGYM team is checking {gym.name}{r.submittedAt ? ` (sent ${formatDate(r.submittedAt)})` : ''}. We’ll email you when it’s live, usually within two working days. You can keep editing in the meantime.
      </Banner>
    );
  }

  const done = Object.values(r.steps).filter(Boolean).length;
  return (
    <section aria-labelledby="setup-title" className="rounded-card border-2 border-flare/30 bg-white p-5">
      {r.reviewNote && (
        <div className="mb-4 flex gap-3 rounded-control bg-flare-50 p-3 text-sm">
          <WarningCircle size={22} weight="fill" className="shrink-0 text-flare" aria-hidden />
          <p><span className="font-bold">The BGYM team asked for changes:</span> {r.reviewNote}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="setup-title" className="text-lg font-extrabold">Get {gym.name} live on BGYM</h2>
          <p className="text-sm text-mute">{done} of {steps.length} done · your gym is hidden from members until it’s approved.</p>
        </div>
        {gym.role === 'owner' ? <SubmitForReview disabled={!r.canSubmit} /> : <p className="text-sm text-mute">The owner sends it for review.</p>}
      </div>
      <div className="mt-3 h-2 rounded-full bg-cloud" aria-hidden>
        <div className="h-2 rounded-full bg-flare transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((s) => {
          const ok = r.steps[s.key];
          return (
            <li key={s.key}>
              <Link href={s.href} className="flex gap-3 rounded-control border border-line p-3 hover:bg-cloud">
                {ok ? <CheckCircle size={24} weight="fill" className="shrink-0 text-success" aria-label="Done" /> : <Circle size={24} className="shrink-0 text-mute" aria-label="To do" />}
                <span>
                  <span className={ok ? 'block font-bold text-mute line-through' : 'block font-bold'}>{s.title}</span>
                  <span className="block text-sm text-mute">{s.detail}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Banner({ tone, icon, title, children }: { tone: 'info' | 'danger'; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className={tone === 'danger' ? 'flex gap-3 rounded-card bg-danger-50 p-5 text-danger' : 'flex gap-3 rounded-card bg-violet-50 p-5 text-violet'}>
      <span className="shrink-0">{icon}</span>
      <div>
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="mt-0.5 text-midnight/80">{children}</p>
      </div>
    </section>
  );
}
