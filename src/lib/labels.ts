import type { Channel, ChequeStatus, InvoiceStatus, PaymentMethod, PurchaseStatus } from '../../shared/types'

export const CHANNEL_LABEL: Record<Channel, string> = { retail: 'مبيعات محل', wholesale: 'جملة', distribution: 'توزيعات' }
export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل', credit: 'آجل' }
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  paid: { label: 'مدفوعة', cls: 'text-emerald-600' },
  partial: { label: 'مدفوعة جزئياً', cls: 'text-amber-600' },
  unpaid: { label: 'غير مدفوعة', cls: 'text-rose-600' },
  cancelled: { label: 'ملغاة', cls: 'text-slate-400 line-through' },
}
export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  pending: { label: 'قيد الانتظار', cls: 'text-amber-600' },
  received: { label: 'مستلم', cls: 'text-emerald-600' },
  cancelled: { label: 'ملغى', cls: 'text-slate-500' },
}
export const CHEQUE_STATUS: Record<ChequeStatus, { label: string; cls: string }> = {
  pending: { label: 'قيد الانتظار', cls: 'text-amber-600' },
  cleared: { label: 'تم الصرف', cls: 'text-emerald-600' },
  bounced: { label: 'مرتجع', cls: 'text-rose-600' },
}
export const TREASURY_CATEGORY: Record<string, string> = {
  sale: 'مبيعات', collection: 'تحصيل', purchase: 'مشتريات', refund: 'استرجاع', cheque: 'شيك',
}
export const categoryLabel = (c: string) => TREASURY_CATEGORY[c] ?? c
