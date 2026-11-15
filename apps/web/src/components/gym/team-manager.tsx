'use client';

import { useState, useTransition } from 'react';
import { CircleNotch, EnvelopeSimple, UserPlus, X } from '@phosphor-icons/react';
import { canManageRole, GYM_ROLE_DESCRIPTIONS, GYM_ROLE_LABELS, type GymStaffRole, type GymTeam } from '@bgym/shared';
import { cancelInvitation, changeStaffRole, inviteStaff, removeStaff, type TeamResult } from '@/app/(dashboards)/gym-actions';
import { formatDate, initials } from '@/lib/format';

const ROLES: GymStaffRole[] = ['owner', 'manager', 'front_desk'];

/** The gym's team: who's on it, pending invitations, and (for owners and managers) changes. */
export function TeamManager({ initial, myRole }: { initial: GymTeam; myRole: GymStaffRole }) {
  const [team, setTeam] = useState(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<GymStaffRole>('front_desk');
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const invitable = ROLES.filter((r) => canManageRole(myRole, r));

  const run = (fn: () => Promise<TeamResult>, ok?: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.team) {
        setTeam(res.team);
        after?.();
      }
      setMessage(res.error ? { error: res.error } : ok ? { ok } : {});
    });

  return (
    <div className="flex flex-col gap-5">
      {invitable.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => inviteStaff(email, role), `Invitation sent to ${email.trim().toLowerCase()}.`, () => setEmail(''));
          }}
          className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
        >
          <h2 className="text-lg font-extrabold">Invite someone</h2>
          <p className="text-sm text-mute">They’ll get an email, then sign in with that address to join. Invitations last 7 days.</p>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <label htmlFor="invite-email" className="sr-only">Email</label>
              <EnvelopeSimple size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
              <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" className="h-11 w-full rounded-control border border-line bg-white pr-3 pl-10 outline-none focus:border-flare" />
            </div>
            <label htmlFor="invite-role" className="sr-only">Role</label>
            <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as GymStaffRole)} className="h-11 rounded-control border border-line bg-white px-3 font-semibold outline-none focus:border-flare">
              {invitable.map((r) => <option key={r} value={r}>{GYM_ROLE_LABELS[r]}</option>)}
            </select>
            <button type="submit" disabled={pending || !email} className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">
              {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <UserPlus size={18} weight="bold" aria-hidden />} Send invite
            </button>
          </div>
          <p className="text-xs text-mute">{GYM_ROLE_LABELS[role]}: {GYM_ROLE_DESCRIPTIONS[role]}.</p>
        </form>
      )}
      {(message.ok || message.error) && (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm font-semibold ${message.error ? 'text-danger' : 'text-success'}`}>{message.error ?? message.ok}</p>
      )}

      <section aria-labelledby="team-title" className="rounded-card border border-line bg-white">
        <h2 id="team-title" className="px-5 pt-5 font-bold">Team · {team.members.length}</h2>
        <ul className="mt-2 divide-y divide-line">
          {team.members.map((m) => {
            const manage = myRole === 'owner' && !m.isYou;
            const removable = m.isYou ? true : canManageRole(myRole, m.role);
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-sm font-bold text-violet" aria-hidden>{initials(m.name, m.email)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{m.name ?? 'No name yet'}{m.isYou && <span className="font-normal text-mute"> (you)</span>}</span>
                  <span className="block truncate text-sm text-mute">{m.email} · joined {formatDate(m.joinedAt)}</span>
                </span>
                {manage ? (
                  <select aria-label={`${m.name ?? m.email}’s role`} value={m.role} disabled={pending} onChange={(e) => run(() => changeStaffRole(m.userId, e.target.value))} className="h-10 rounded-control border border-line bg-white px-2 text-sm font-semibold outline-none focus:border-flare">
                    {ROLES.map((r) => <option key={r} value={r}>{GYM_ROLE_LABELS[r]}</option>)}
                  </select>
                ) : (
                  <span className="rounded-full bg-cloud px-3 py-1 text-sm font-semibold">{GYM_ROLE_LABELS[m.role]}</span>
                )}
                {removable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(m.isYou ? 'Leave this gym? You’ll lose access to its dashboard.' : `Remove ${m.name ?? m.email} from the team? They lose access straight away.`)) run(() => removeStaff(m.userId), m.isYou ? undefined : 'Removed.');
                    }}
                    className="h-10 rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-50"
                  >
                    {m.isYou ? 'Leave' : 'Remove'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {team.invitations.length > 0 && (
        <section aria-labelledby="invites-title" className="rounded-card border border-line bg-white">
          <h2 id="invites-title" className="px-5 pt-5 font-bold">Waiting to join · {team.invitations.length}</h2>
          <ul className="mt-2 divide-y divide-line">
            {team.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cloud text-mute" aria-hidden><EnvelopeSimple size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{i.email}</span>
                  <span className="block text-sm text-mute">{GYM_ROLE_LABELS[i.role]} · invited by {i.invitedBy ?? 'someone'} · expires {formatDate(i.expiresAt)}</span>
                </span>
                {canManageRole(myRole, i.role) && (
                  <span className="flex gap-1">
                    <button type="button" disabled={pending} onClick={() => run(() => inviteStaff(i.email, i.role), `Invitation sent again to ${i.email}.`)} className="h-9 rounded-control px-3 text-sm font-bold text-mute hover:bg-cloud hover:text-midnight">Resend</button>
                    <button type="button" disabled={pending} onClick={() => run(() => cancelInvitation(i.id))} aria-label={`Cancel invitation for ${i.email}`} className="grid size-9 place-items-center rounded-control text-mute hover:bg-danger-50 hover:text-danger"><X size={18} aria-hidden /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
