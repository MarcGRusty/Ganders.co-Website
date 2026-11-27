import type { Env } from './env';
import { esc } from './util';
import { getSettings } from './settings';

export interface Mail { to: string | string[]; subject: string; text: string; html?: string; replyTo?: string; kind: string }

/**
 * Sends email through Resend (https://resend.com). Set RESEND_API_KEY and verify
 * your domain there. The sender comes from Studio (Design, Email), then MAIL_FROM,
 * then hello@ the site domain. Every attempt is logged so problems show up in Studio.
 */
export function mailReady(env: Env): boolean {
  return !!env.RESEND_API_KEY;
}

export async function sendMail(env: Env, m: Mail, fromName = 'Ganders.co'): Promise<{ ok: boolean; detail: string }> {
  const to = Array.isArray(m.to) ? m.to : [m.to];
  let ok = false, detail = '';
  if (!env.RESEND_API_KEY) {
    detail = 'Email is not set up yet (RESEND_API_KEY missing)';
  } else {
    const st = await getSettings(env).catch(() => null);
    const name = (st?.mail.fromName || st?.site.name || fromName).replace(/[<>"]/g, '');
    const addr = st?.mail.fromAddress?.trim();
    const from = addr ? `${name} <${addr}>` : String(env.MAIL_FROM || `${name} <hello@${new URL(env.SITE_URL).hostname}>`);
    const replyTo = m.replyTo || st?.mail.replyTo || st?.site.email || undefined;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject: m.subject, text: m.text, html: m.html || textToHtml(m.text), ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      const d: any = await r.json().catch(() => ({}));
      ok = r.ok;
      detail = r.ok ? `Sent (${d.id || 'ok'})` : d.message || `Resend error ${r.status}`;
    } catch (e: any) {
      detail = String(e?.message || e);
    }
  }
  await env.DB.prepare('INSERT INTO email_log (kind, to_addr, subject, ok, detail) VALUES (?, ?, ?, ?, ?)').bind(m.kind, to.join(', '), m.subject.slice(0, 200), ok ? 1 : 0, detail.slice(0, 500)).run().catch(() => {});
  return { ok, detail };
}

/** Plain, readable HTML email. No tracking pixels, no heavy templates. */
export function textToHtml(text: string, footer = ''): string {
  const body = esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111A22;max-width:560px">${body}${footer ? `<p style="margin:24px 0 0;color:#5B6670;font-size:13px">${esc(footer)}</p>` : ''}</div>`;
}

/** Who gets form notifications: OWNER_EMAIL, then the site email in settings. */
export function notifyAddress(env: Env, siteEmail: string): string {
  return String(env.NOTIFY_EMAIL || env.OWNER_EMAIL || siteEmail || '');
}
