/** Email delivery via Resend (https://resend.com). Server-side only. */

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
}

export function emailConfigured(env: EmailEnv): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(
  env: EmailEnv,
  msg: { to: string; subject: string; text: string; html?: string },
): Promise<void> {
  if (!emailConfigured(env)) {
    throw new Error('Email is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      reply_to: env.EMAIL_REPLY_TO || undefined,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { message?: string } | null;
    throw new Error(`Email send failed (${res.status}): ${data?.message || res.statusText}`);
  }
}

export function otpEmail(code: string, purpose: 'login' | 'register'): { subject: string; text: string; html: string } {
  const action = purpose === 'register' ? 'verify your email' : 'sign in';
  const subject = `Your FlowBot verification code: ${code}`;
  const text = `Your FlowBot AI Studio code to ${action} is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;background:#0a0a0d;color:#e5e7eb;padding:24px;border-radius:14px">
  <h2 style="margin:0 0 8px">FlowBot AI Studio</h2>
  <p style="margin:0 0 16px;color:#9aa3b2">Use this code to ${action}.</p>
  <div style="font-size:30px;letter-spacing:8px;font-weight:700;color:#38bdf8;padding:14px 0">${code}</div>
  <p style="margin:16px 0 0;color:#9aa3b2;font-size:13px">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
</div>`;
  return { subject, text, html };
}
