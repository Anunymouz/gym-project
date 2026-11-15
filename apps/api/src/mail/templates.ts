import { OTP_TTL_SECONDS } from '@bgym/shared';
import type { MailMessage } from './mail.service.js';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function signInCodeEmail(to: string, code: string): MailMessage {
  const minutes = OTP_TTL_SECONDS / 60;
  return {
    to,
    subject: `${code} is your BGYM sign-in code`,
    text: `Your BGYM sign-in code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't try to sign in, you can ignore this email.\n\nBGYM: Be my gym buddy.`,
    html: `<!doctype html><html><body style="margin:0;background:#F5F6FA;font-family:Helvetica,Arial,sans-serif;color:#0D1028">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:18px;border:1px solid #E6E8F0">
<tr><td style="padding:32px 32px 8px"><p style="margin:0;font-size:22px;font-weight:800"><span style="color:#FF5A1F">B</span>GYM</p></td></tr>
<tr><td style="padding:8px 32px 0"><p style="margin:0;font-size:16px">Your sign-in code is</p>
<p style="margin:16px 0;font-size:36px;font-weight:800;letter-spacing:8px">${escape(code)}</p>
<p style="margin:0 0 24px;font-size:14px;color:#6B7280">It expires in ${minutes} minutes. If you didn't try to sign in, you can ignore this email.</p></td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #E6E8F0;font-size:12px;color:#6B7280">BGYM: Be my gym buddy.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

const TZ = 'Africa/Accra';
const longDate = (d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d);

export interface RenewalReminder {
  to: string;
  memberName: string | null;
  gymName: string;
  planName: string;
  endsAt: Date;
  now: Date;
  /** Page that turns renewal emails off, plus one-click headers for mail apps. */
  unsubscribe: { pageUrl: string; headers: Record<string, string> };
}

/** Whole days left, counted in Accra calendar days (0 = ends today, negative = ended). */
export function calendarDaysLeft(endsAt: Date, now: Date): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); // Accra is UTC+0
  return Math.round((day(endsAt) - day(now)) / 86_400_000);
}

function renewalWhen(endsAt: Date, now: Date) {
  const days = calendarDaysLeft(endsAt, now);
  return { ended: endsAt.getTime() <= now.getTime(), when: days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days` };
}

/** The push version: short enough for a lock screen. */
export function renewalReminderPush(r: Pick<RenewalReminder, 'gymName' | 'planName' | 'endsAt' | 'now'>): { title: string; body: string } {
  const { ended, when } = renewalWhen(r.endsAt, r.now);
  return ended
    ? { title: `${r.gymName}: membership ended`, body: `Your ${r.planName} membership has ended. Renew in BGYM to keep training.` }
    : { title: `${r.gymName}: ends ${when}`, body: `Your ${r.planName} membership ends ${when}. Renew now and you won’t lose any days.` };
}

export function renewalReminderEmail(r: RenewalReminder): MailMessage {
  const { ended, when } = renewalWhen(r.endsAt, r.now);
  const subject = ended ? `Your ${r.gymName} membership has ended` : `Your ${r.gymName} membership ends ${when}`;
  const hello = r.memberName ? `Hi ${r.memberName.split(' ')[0]},` : 'Hi,';
  const lead = ended
    ? `Your ${r.planName} membership at ${r.gymName} ended on ${longDate(r.endsAt)}, so your gym pass no longer works.`
    : `Your ${r.planName} membership at ${r.gymName} ends ${when}, on ${longDate(r.endsAt)}.`;
  const action = ended
    ? 'Renew in the BGYM app to keep training: your new membership starts straight away.'
    : 'Renew in the BGYM app before then and your new membership starts the day this one ends, so you don’t lose any days.';
  const how = `Open BGYM, go to Gyms, choose ${r.gymName} and pick a plan. You can pay with mobile money or card.`;
  const footer = `You’re getting this because you have a membership at ${r.gymName} through BGYM.`;

  return {
    to: r.to,
    subject,
    headers: r.unsubscribe.headers,
    text: `${hello}\n\n${lead}\n\n${action}\n\n${how}\n\n${footer}\nStop renewal emails: ${r.unsubscribe.pageUrl}\nBGYM: Be my gym buddy.`,
    html: `<!doctype html><html><body style="margin:0;background:#F5F6FA;font-family:Helvetica,Arial,sans-serif;color:#0D1028">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;border:1px solid #E6E8F0">
<tr><td style="padding:32px 32px 8px"><p style="margin:0;font-size:22px;font-weight:800"><span style="color:#FF5A1F">B</span>GYM</p></td></tr>
<tr><td style="padding:8px 32px 0">
<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${ended ? '#DC2626' : '#FF5A1F'}">${ended ? 'Membership ended' : `Ends ${escape(when)}`}</p>
<p style="margin:0 0 16px;font-size:22px;font-weight:800">${escape(r.gymName)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escape(hello)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escape(lead)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escape(action)}</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#6B7280">${escape(how)}</p></td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #E6E8F0;font-size:12px;color:#6B7280">${escape(footer)} <a href="${escape(r.unsubscribe.pageUrl)}" style="color:#6B7280">Stop renewal emails</a><br>BGYM: Be my gym buddy.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

/** A plain transactional email in the BGYM style: a heading, paragraphs and an optional button. */
function simpleEmail(to: string, subject: string, heading: string, paragraphs: string[], button?: { label: string; url: string }): MailMessage {
  return {
    to,
    subject,
    text: `${heading}\n\n${paragraphs.join('\n\n')}${button ? `\n\n${button.label}: ${button.url}` : ''}\n\nBGYM: Be my gym buddy.`,
    html: `<!doctype html><html><body style="margin:0;background:#F5F6FA;font-family:Helvetica,Arial,sans-serif;color:#0D1028">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;border:1px solid #E6E8F0">
<tr><td style="padding:32px 32px 8px"><p style="margin:0;font-size:22px;font-weight:800"><span style="color:#FF5A1F">B</span>GYM</p></td></tr>
<tr><td style="padding:8px 32px 8px"><p style="margin:0 0 16px;font-size:22px;font-weight:800">${escape(heading)}</p>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escape(p)}</p>`).join('\n')}
${button ? `<p style="margin:20px 0 24px"><a href="${escape(button.url)}" style="display:inline-block;background:#FF5A1F;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">${escape(button.label)}</a></p>` : ''}</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #E6E8F0;font-size:12px;color:#6B7280">BGYM: Be my gym buddy.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

export const gymSubmittedEmail = (to: string, gymName: string, reviewUrl: string) =>
  simpleEmail(to, `New gym to review: ${gymName}`, `${gymName} is waiting for review`, [`${gymName} has been sent for review. Check its details, plans and payout account, then approve it or send it back with a note.`], { label: 'Review gyms', url: reviewUrl });

export const gymApprovedEmail = (to: string, gymName: string, dashboardUrl: string) =>
  simpleEmail(to, `${gymName} is live on BGYM`, `${gymName} is live!`, [`Good news: your gym has been approved and members can now find it and buy memberships in the BGYM app.`, `Payments go straight to your payout account, minus BGYM’s fee. Scan members in from the Check-in page of your dashboard.`], { label: 'Open your dashboard', url: dashboardUrl });

export const gymReturnedEmail = (to: string, gymName: string, note: string, dashboardUrl: string) =>
  simpleEmail(to, `${gymName}: a few changes before it goes live`, 'A few changes needed', [`Thanks for listing ${gymName}. Before it goes live, the BGYM team asks you to:`, note, 'Make the changes in your dashboard, then send it for review again.'], { label: 'Open your dashboard', url: dashboardUrl });

export const gymSuspendedEmail = (to: string, gymName: string, reason: string) =>
  simpleEmail(to, `${gymName} has been paused on BGYM`, `${gymName} has been paused`, [`Your gym is hidden from the BGYM app and new memberships can’t be bought for now. Existing members can still check in.`, `Reason: ${reason}`, 'Reply to this email if you have questions.']);

/** Step-up confirmation for changing where a gym's money is paid. Never says "sign-in". */
export function payoutCodeEmail(to: string, code: string): MailMessage {
  const minutes = OTP_TTL_SECONDS / 60;
  return simpleEmail(to, `${code} confirms your payout account change`, 'Confirm your payout account change', [
    `Your confirmation code is ${code}. It expires in ${minutes} minutes.`,
    'Someone is changing the bank or mobile money account where your gym’s BGYM payments are sent. If this wasn’t you, don’t share this code: reply to this email straight away and sign out of BGYM on all devices.',
  ]);
}

export const payoutChangedEmail = (to: string, gymName: string, account: string) =>
  simpleEmail(to, `${gymName}: payout account changed`, 'Your payout account was changed', [
    `Payments for ${gymName} will now be sent to ${account}.`,
    'If you didn’t make this change, reply to this email immediately so we can freeze payouts.',
  ]);

export const staffInvitationEmail = (to: string, gymName: string, role: string, inviter: string | null, signInUrl: string) =>
  simpleEmail(
    to,
    `You're invited to ${gymName} on BGYM`,
    `Join ${gymName} on BGYM`,
    [
      `${inviter ?? 'The gym'} invited you to the ${gymName} dashboard as ${role}.`,
      `Sign in with this email address (${to}) to accept. The invitation lasts 7 days.`,
      'Not expecting this? You can ignore this email.',
    ],
    { label: 'Sign in to accept', url: signInUrl },
  );
