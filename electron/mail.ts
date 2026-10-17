// Outgoing email. Configured only through environment variables, so no password sits in the database
// or the code. Three ways, the first one set wins:
//   BREVO_API_KEY  (+ MAIL_FROM)  HTTPS API, free 300/day. Works on Railway/Vercel.
//   RESEND_API_KEY (+ MAIL_FROM)  HTTPS API, free 3000/month. Works on Railway/Vercel.
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (+ SMTP_FROM)  e.g. Gmail. Railway blocks SMTP
//   on Free/Trial/Hobby plans, so prefer an API there.
import nodemailer, { type Transporter } from 'nodemailer'

type Provider = 'brevo' | 'resend' | 'smtp'
const env = (k: string) => process.env[k]?.trim() || ''

export function mailProvider(): Provider | null {
  if (env('BREVO_API_KEY')) return 'brevo'
  if (env('RESEND_API_KEY')) return 'resend'
  if (env('SMTP_HOST')) return 'smtp'
  return null
}
export const mailConfigured = () => mailProvider() !== null

/** "Shop <a@b.com>" or "a@b.com" -> parts. */
function sender() {
  const raw = env('MAIL_FROM') || env('SMTP_FROM') || env('SMTP_USER')
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(raw)
  return m ? { name: m[1].trim() || 'Sales Inventory Pro', email: m[2].trim() } : { name: 'Sales Inventory Pro', email: raw }
}

let transport: Transporter | null = null
function smtp() {
  if (!transport) {
    const port = Number(env('SMTP_PORT')) || 587
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: process.env.SMTP_PASS ?? '' } : undefined,
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

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300)
    if (r.status === 401) throw new Error('مزوّد البريد رفض المفتاح (غير موجود أو محذوف). انسخ المفتاح من جديد كاملاً إلى متغيّرات الاستضافة ثم أعد النشر')
    throw new Error(`رفض مزوّد البريد الإرسال (HTTP ${r.status}): ${text}`)
  }
}

export async function sendMail(to: string[], subject: string, html: string, text: string) {
  const provider = mailProvider()
  if (!provider) throw new Error('البريد غير مُعدّ على الخادم: أضف BREVO_API_KEY أو RESEND_API_KEY (أو متغيّرات SMTP) في متغيّرات الاستضافة')
  if (!to.length) throw new Error('لا يوجد بريد صحيح للإرسال إليه')
  const from = sender()
  if (!from.email) throw new Error('أضف متغيّر MAIL_FROM (البريد المرسِل الموثّق لدى مزوّد البريد)')
  try {
    if (provider === 'brevo') {
      const key = env('BREVO_API_KEY').replace(/^["']|["']$/g, '')
      if (key.startsWith('xsmtpsib-')) throw new Error('هذا مفتاح SMTP من Brevo وليس مفتاح API. أنشئ مفتاحاً من تبويب «API Keys» (يبدأ بـ xkeysib-)')
      if (!key.startsWith('xkeysib-')) throw new Error('مفتاح BREVO_API_KEY غير صحيح: مفتاح API من Brevo يبدأ بـ xkeysib-')
      await postJson('https://api.brevo.com/v3/smtp/email', { 'api-key': key },
        { sender: from, to: to.map((email) => ({ email })), subject, htmlContent: html, textContent: text })
    } else if (provider === 'resend') {
      await postJson('https://api.resend.com/emails', { Authorization: `Bearer ${env('RESEND_API_KEY')}` },
        { from: `${from.name} <${from.email}>`, to, subject, html, text })
    } else {
      await smtp().sendMail({ from: `${from.name} <${from.email}>`, to, subject, html, text })
    }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error(`[mail:${provider}]`, err.code ?? '', err.message)
    if (provider === 'smtp' && ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET', 'ECONNECTION'].includes(err.code ?? ''))
      throw new Error('تعذّر الاتصال بخادم SMTP. Railway يحجب SMTP في الخطط المجانية: استخدم BREVO_API_KEY أو RESEND_API_KEY بدلاً منه')
    if (provider === 'smtp' && err.code === 'EAUTH')
      throw new Error('رفض خادم البريد اسم المستخدم أو كلمة المرور. مع Gmail استخدم «كلمة مرور التطبيقات» وليس كلمة مرور الحساب')
    throw e
  }
}
