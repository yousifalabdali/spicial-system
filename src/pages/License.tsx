import { useState } from 'react'
import { checkLicense, requestLicense } from '../../shared/license'
import { Button, Field, Input, Panel, PageTitle } from '../components/ui'

export default function License({ machineId, onLicensed }: { machineId: string; onLicensed: (key: string) => void }) {
  const [mode, setMode] = useState<'input' | 'request'>('input')
  const [key, setKey] = useState('')
  const [shopName, setShopName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await checkLicense(key, machineId)
    if (result.valid) {
      onLicensed(key)
    } else {
      setError(result.reason || 'المفتاح غير صحيح')
    }
    setLoading(false)
  }

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shopName.trim()) return
    setLoading(true)
    setError('')

    const result = await requestLicense(shopName, machineId)
    if (result.licenseKey) {
      setKey(result.licenseKey)
      setMode('input')
    } else {
      setError(result.error || 'حدث خطأ')
    }
    setLoading(false)
  }

  return (
    <div className="flex h-full items-center justify-center bg-page p-6">
      <Panel className="w-full max-w-md">
        <PageTitle>تفعيل Sales Inventory Pro</PageTitle>

        {mode === 'input' ? (
          <form onSubmit={handleActivate} className="mt-6 space-y-4">
            <div className="rounded-lg bg-panel-2/50 p-4 text-center text-sm text-muted">
              <p>معرف جهازك:</p>
              <p className="num font-mono text-ink">{machineId.slice(0, 16)}...</p>
            </div>

            <Field label="مفتاح التفعيل">
              <Input autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="SHOP-2024-..." />
            </Field>

            {error && <div className="rounded-lg bg-rose-600/20 p-3 text-sm text-rose-300">{error}</div>}

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={!key || loading}>
                {loading ? 'جاري التحقق...' : 'تفعيل'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setMode('request'); setError('') }}>
                طلب مفتاح
              </Button>
            </div>

            <p className="text-center text-xs text-muted">
              إذا لم تكن لديك مفتاح بعد، اضغط على <br /> "طلب مفتاح" لإنشاء واحد جديد
            </p>
          </form>
        ) : (
          <form onSubmit={handleRequest} className="mt-6 space-y-4">
            <Field label="اسم المحل">
              <Input autoFocus value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="محل العنود" />
            </Field>

            {error && <div className="rounded-lg bg-rose-600/20 p-3 text-sm text-rose-300">{error}</div>}

            {key && (
              <div className="rounded-lg border border-line bg-panel-2/50 p-4">
                <p className="text-xs font-semibold text-muted mb-2">تم إنشاء المفتاح:</p>
                <div className="font-mono text-sm text-ink break-all bg-page/50 p-2 rounded mb-3">{key}</div>
                <p className="text-xs text-muted">انسخ هذا المفتاح والصقه في الحقل أعلاه</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={!shopName || loading}>
                {loading ? 'جاري الإنشاء...' : 'إنشاء مفتاح'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setMode('input'); setError(''); setKey('') }}>
                رجوع
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  )
}
