// Outgoing email over SMTP (Gmail, Outlook, Zoho, your host...). Configured only through environment
// variables, so the password never sits in the database or the code:
//   SMTP_HOST, SMTP_PORT (587, or 465 for SSL), SMTP_USER, SMTP_PASS, SMTP_FROM (optional)
import nodemailer, { type Transporter } from 'nodemailer'

export const mailConfigured = () => !!process.env.SMTP_HOST?.trim()

let transport: Transporter | null = null

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    })
  }
  return transport
}

/** "a@x.com, b@y.com" -> valid addresses only. */
export function parseRecipients(list: string) {
  return list.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}

export async function sendMail(to: string[], subject: string, html: string, text: string) {
  if (!mailConfigured()) throw new Error('البريد غير مُعدّ على الخادم: أضف متغيّرات SMTP_HOST و SMTP_USER و SMTP_PASS')
  if (!to.length) throw new Error('لا يوجد بريد صحيح للإرسال إليه')
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim()
  await getTransport().sendMail({ from, to, subject, html, text })
}
