'use client';

import { useState, useTransition } from 'react';
import { Bank, CheckCircle, CircleNotch, DeviceMobile, EnvelopeSimple, ShieldCheck } from '@phosphor-icons/react';
import type { GymPayout, PayoutBank } from '@bgym/shared';
import { requestPayoutCode, savePayout, type PayoutState } from '@/app/(dashboards)/gym-actions';
import { formatDate } from '@/lib/format';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';

/** The owner's payout account: shown masked; changing it needs a code from their email. */
export function PayoutSection({ payout: initial, banks, ownerEmail }: { payout: GymPayout; banks: PayoutBank[]; ownerEmail: string }) {
  const [payout, setPayout] = useState(initial);
  const [editing, setEditing] = useState(!initial.connected);
  const [form, setForm] = useState({ bankCode: '', accountNumber: '', accountName: '', code: '' });
  const [codeSent, setCodeSent] = useState(false);
  const [state, setState] = useState<PayoutState>({});
  const [sending, startSending] = useTransition();
  const [saving, startSaving] = useTransition();
  const bank = banks.find((b) => b.code === form.bankCode);
  const err = state.fieldErrors ?? {};
  const momo = banks.filter((b) => b.method === 'mobile_money');
  const bankList = banks.filter((b) => b.method === 'bank');

  return (
    <section id="payout" className="scroll-mt-6 rounded-card border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">Payout account</h2>
          <p className="text-sm text-mute">Where membership payments are sent by Paystack, minus BGYM’s fee. Only owners can see or change this.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute"><ShieldCheck size={16} aria-hidden /> Confirmed by email code</span>
      </div>

      {payout.connected && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-cloud p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-white text-midnight">{payout.method === 'mobile_money' ? <DeviceMobile size={22} aria-hidden /> : <Bank size={22} aria-hidden />}</span>
            <div>
              <p className="font-bold">{payout.bankName} ···· {payout.accountLast4}</p>
              <p className="text-sm text-mute">{payout.accountName}{payout.updatedAt ? ` · updated ${formatDate(payout.updatedAt)}` : ''}</p>
            </div>
          </div>
          <button type="button" onClick={() => { setEditing(true); setState({}); }} className="h-10 rounded-control border-[1.5px] border-line bg-white px-4 text-sm font-bold hover:bg-cloud">Change account</button>
        </div>
      )}
      {state.saved && !editing && (
        <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> Saved. We’ve emailed you a record of this change.</p>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            startSaving(async () => {
              const res = await savePayout(form);
              setState(res);
              if (res.saved) {
                setPayout(res.saved);
                setEditing(false);
                setCodeSent(false);
                setForm({ bankCode: '', accountNumber: '', accountName: '', code: '' });
              }
            });
          }}
          className="grid gap-4 md:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bankCode" className="text-sm font-bold">Bank or mobile money</label>
            <select id="bankCode" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} aria-invalid={!!err.bankCode} className={field}>
              <option value="">Choose…</option>
              <optgroup label="Mobile money">{momo.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</optgroup>
              <optgroup label="Banks">{bankList.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</optgroup>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="accountNumber" className="text-sm font-bold">{bank?.method === 'mobile_money' ? 'Mobile money number' : 'Account number'}</label>
            <input id="accountNumber" inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder={bank?.method === 'mobile_money' ? '024 123 4567' : ''} aria-invalid={!!err.accountNumber} className={field} />
            {err.accountNumber && <p className="text-sm font-semibold text-danger">{err.accountNumber}</p>}
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="accountName" className="text-sm font-bold">Name on the account</label>
            <input id="accountName" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} maxLength={80} autoComplete="off" aria-invalid={!!err.accountName} className={field} />
            {err.accountName && <p className="text-sm font-semibold text-danger">{err.accountName}</p>}
          </div>

          <div className="flex flex-col gap-2 rounded-control bg-cloud p-4 md:col-span-2">
            <p className="text-sm">
              To protect your money, confirm with a code we email to <span className="font-bold">{ownerEmail}</span>.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => startSending(async () => { const r = await requestPayoutCode(); setState(r.error ? { error: r.error } : {}); if (!r.error) setCodeSent(true); })}
                className="inline-flex h-11 items-center gap-2 rounded-control bg-midnight px-4 text-sm font-bold text-white hover:bg-indigo disabled:opacity-60"
              >
                {sending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <EnvelopeSimple size={18} aria-hidden />}
                {codeSent ? 'Send a new code' : 'Email me a code'}
              </button>
              {codeSent && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="payoutCode" className="text-sm font-bold">6-digit code</label>
                  <input id="payoutCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, '') })} aria-invalid={!!err.code} className="h-11 w-36 rounded-control border border-line bg-white px-3 text-center text-lg font-extrabold tracking-[0.3em] outline-none focus:border-flare" />
                </div>
              )}
            </div>
            {codeSent && <p className="text-xs text-mute">Code sent. It expires in 10 minutes.</p>}
          </div>

          {state.error && <p role="alert" className="text-sm font-semibold text-danger md:col-span-2">{state.error}</p>}
          <div className="flex gap-2 md:col-span-2">
            {payout.connected && (
              <button type="button" onClick={() => { setEditing(false); setState({}); }} className="h-11 rounded-control border-[1.5px] border-line px-4 text-sm font-bold hover:bg-cloud">Cancel</button>
            )}
            <button type="submit" disabled={saving || !codeSent || form.code.length !== 6 || !form.bankCode} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-50">
              {saving && <CircleNotch size={18} className="animate-spin" aria-hidden />}
              Save payout account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
