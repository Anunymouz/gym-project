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
