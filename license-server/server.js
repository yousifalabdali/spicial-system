// Owner-only license issuing tool. Customers never talk to this server:
// they send you their machine code, you issue a key here, they paste it into the app.
//   ADMIN_TOKEN=<long random password> node server.js
import express from 'express'
import { createPrivateKey, sign, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const DB = join(dir, 'licenses.json')
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? ''

if (ADMIN_TOKEN.length < 16) {
  console.error('Set ADMIN_TOKEN to a long random password (16+ characters), e.g.\n  ADMIN_TOKEN=$(openssl rand -hex 16) node server.js')
  process.exit(1)
}
if (!existsSync(join(dir, 'private.pem'))) {
  console.error('private.pem not found. Run: node keygen.js')
  process.exit(1)
}
const privateKey = createPrivateKey(readFileSync(join(dir, 'private.pem')))

const load = () => (existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : [])
const save = (rows) => writeFileSync(DB, JSON.stringify(rows, null, 2))

function isAdmin(req) {
  const given = Buffer.from(req.get('x-admin-token') ?? '')
  const want = Buffer.from(ADMIN_TOKEN)
  return given.length === want.length && timingSafeEqual(given, want)
}

/** Key = SHOP-<year>-<arch>-<machine id>-<signature hex>. The app checks the signature and that the machine id is its own. */
function issueKey(arch, machine) {
  const head = `SHOP-${new Date().getFullYear()}-${arch}-${machine}`
  const sig = sign(null, Buffer.from(head), privateKey).toString('hex').toUpperCase()
  return `${head}-${sig.match(/.{16}/g).join('-')}`
}

const app = express()
app.use(express.json({ limit: '10kb' }))
app.disable('x-powered-by')

app.get('/', (_req, res) => res.type('html').send(PAGE))

app.post('/api/issue', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'كلمة السر غير صحيحة' })
  const shop = String(req.body.shop ?? '').trim().slice(0, 80)
  const machine = String(req.body.machine ?? '').toUpperCase().replace(/[\s-]/g, '')
  const arch = String(req.body.arch ?? '').trim().toUpperCase()
  if (!shop) return res.status(400).json({ error: 'اسم المحل مطلوب' })
  if (!/^[A-F0-9]{12}$/.test(machine)) return res.status(400).json({ error: 'رمز الجهاز غير صحيح: يجب أن يكون 12 حرفاً مثل A1B2C3D4E5F6. إذا كان أطول (يتكون من 4 مجموعات) فالجهاز يشغّل نسخة قديمة من البرنامج، ثبّت النسخة الجديدة من مجلد release' })
  if (!['ARM64', 'X64'].includes(arch)) return res.status(400).json({ error: 'نوع الجهاز غير صحيح' })

  const rows = load()
  const key = issueKey(arch, machine)
  rows.push({ shop, machine, arch, issued: new Date().toISOString(), key })
  save(rows)
  res.json({ key })
})

app.get('/api/issued', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'كلمة السر غير صحيحة' })
  res.json(load().map(({ shop, machine, issued }) => ({ shop, machine, issued })))
})

const PORT = Number(process.env.PORT ?? 4317)
// Local only by default. Put it behind HTTPS (or just run it on your own computer) before exposing it.
app.listen(PORT, process.env.HOST ?? '127.0.0.1', () => console.log(`License issuer: http://127.0.0.1:${PORT}`))

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إصدار تراخيص</title>
<style>body{font-family:system-ui,Tahoma;background:#0a1631;color:#e6edf9;max-width:640px;margin:40px auto;padding:0 16px}
input,textarea,button{width:100%;box-sizing:border-box;padding:10px;margin:6px 0 14px;border-radius:8px;border:1px solid #22407a;background:#0e2149;color:#e6edf9;font-size:15px}
button{background:#3b82f6;border:0;font-weight:700;cursor:pointer}textarea{height:130px;direction:ltr;font-family:monospace;font-size:12px}
#err{color:#fb7185}h1{font-size:20px}</style>
<h1>إصدار مفتاح تفعيل لمحل</h1>
<label>كلمة سر الإدارة</label><input id="token" type="password">
<label>اسم المحل</label><input id="shop">
<label>رمز الجهاز (يرسله لك الزبون من شاشة التفعيل)</label><input id="machine" dir="ltr" placeholder="A1B2C3D4E5F6">
<label>نوع الجهاز (ماك M1/M2/M3 = ARM64، ماك إنتل أو ويندوز = X64)</label><select id="arch" style="width:100%;padding:10px;margin:6px 0 14px;border-radius:8px;border:1px solid #22407a;background:#0e2149;color:#e6edf9"><option>X64</option><option>ARM64</option></select>
<button onclick="go()">إصدار المفتاح</button><div id="err"></div>
<label>المفتاح (انسخه وأرسله للزبون)</label><textarea id="key" readonly></textarea>
<script>
async function go(){
  err.textContent='';key.value=''
  try{
    const r=await fetch('/api/issue',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token.value},body:JSON.stringify({shop:shop.value,machine:machine.value,arch:arch.value})})
    const d=await r.json().catch(()=>({error:'رد غير متوقع من الخادم (رقم '+r.status+'). تأكد أنك فتحت العنوان الصحيح.'}))
    if(!r.ok) err.textContent=d.error; else key.value=d.key
  }catch(e){err.textContent='تعذر الاتصال بالأداة: تأكد أن server.js ما زال يعمل في الـTerminal.'}
}
</script></html>`
