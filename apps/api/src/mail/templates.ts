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
}

/** Whole days left, counted in Accra calendar days (0 = ends today, negative = ended). */
export function calendarDaysLeft(endsAt: Date, now: Date): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); // Accra is UTC+0
  return Math.round((day(endsAt) - day(now)) / 86_400_000);
}

export function renewalReminderEmail(r: RenewalReminder): MailMessage {
  const ended = r.endsAt.getTime() <= r.now.getTime();
  const days = calendarDaysLeft(r.endsAt, r.now);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
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
    text: `${hello}\n\n${lead}\n\n${action}\n\n${how}\n\n${footer}\nBGYM: Be my gym buddy.`,
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
<tr><td style="padding:16px 32px 28px;border-top:1px solid #E6E8F0;font-size:12px;color:#6B7280">${escape(footer)}<br>BGYM: Be my gym buddy.</td></tr>
</table></td></tr></table></body></html>`,
  };
}
