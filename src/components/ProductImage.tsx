// Product photos. Lists only say whether a product has one (has_image); the photo itself is
// fetched once per product and cached, so long product lists stay light.
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Package, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

const cache = new Map<number, Promise<string | null>>()

function loadImage(id: number) {
  let p = cache.get(id)
  if (!p) {
    p = api.getProductImage(id).catch(() => null)
    cache.set(id, p)
  }
  return p
}

/** Call after saving a product so the new photo shows everywhere. */
export const forgetProductImage = (id: number) => cache.delete(id)

export function ProductImage({ id, hasImage, className = '', iconSize = 18 }: { id: number | null; hasImage?: number | boolean; className?: string; iconSize?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    setSrc(null)
    if (!id || !hasImage) return
    let live = true
    loadImage(id).then((s) => live && setSrc(s))
    return () => { live = false }
  }, [id, hasImage])
  if (src) return <img src={src} alt="" className={`object-cover ${className}`} draggable={false} />
  return <div className={`grid place-items-center bg-slate-100 text-slate-300 ${className}`}><Package size={iconSize} /></div>
}

/** Shrink a picked photo to at most `max` px and JPEG, so it stays small in the database. */
function shrink(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff' // transparent PNGs get a white background, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر قراءة الصورة')) }
    img.src = url
  })
}

/**
 * Photo field for the product form.
 * value: undefined = unchanged, null = removed, data URL = new photo.
 */
export function ImagePicker({ productId, hasImage, value, onChange, onError }: {
  productId?: number; hasImage?: number; value: string | null | undefined; onChange: (v: string | null | undefined) => void; onError: (msg: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const showing = value === undefined ? (hasImage ? 'stored' : 'none') : value === null ? 'none' : 'new'

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return onError('اختر ملف صورة')
    try { onChange(await shrink(file)) } catch (e) { onError((e as Error).message) }
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} title="اختيار صورة"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
        className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-indigo-400">
        {showing === 'new' && <img src={value!} alt="" className="h-full w-full object-cover" />}
        {showing === 'stored' && <ProductImage id={productId ?? null} hasImage className="h-full w-full" />}
        {showing === 'none' && <div className="grid h-full place-items-center text-slate-400"><ImagePlus size={26} /></div>}
      </button>
      <div className="space-y-1.5 text-sm">
        <div className="font-semibold">صورة المنتج</div>
        <div className="text-xs text-muted">تظهر في نقطة البيع والفاتورة. اسحب صورة هنا أو اضغط لاختيارها.</div>
        <div className="flex gap-3">
          <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => input.current?.click()}>{showing === 'none' ? 'إضافة صورة' : 'تغيير الصورة'}</button>
          {showing !== 'none' && (
            <button type="button" className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline" onClick={() => onChange(hasImage ? null : undefined)}>
              <Trash2 size={12} /> إزالة
            </button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}
