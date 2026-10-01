import type { Channel, ChequeStatus, InvoiceStatus, PaymentMethod, PurchaseStatus } from '../../shared/types'

export const CHANNEL_LABEL: Record<Channel, string> = { retail: 'مبيعات محل', wholesale: 'جملة', distribution: 'توزيعات' }
export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل', credit: 'آجل' }
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  paid: { label: 'مدفوعة', cls: 'text-emerald-400' },
  partial: { label: 'مدفوعة جزئياً', cls: 'text-amber-400' },
  unpaid: { label: 'غير مدفوعة', cls: 'text-rose-400' },
  cancelled: { label: 'ملغاة', cls: 'text-slate-500 line-through' },
}
export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  pending: { label: 'قيد الانتظار', cls: 'text-amber-400' },
  received: { label: 'مستلم', cls: 'text-emerald-400' },
  cancelled: { label: 'ملغى', cls: 'text-slate-500' },
}
export const CHEQUE_STATUS: Record<ChequeStatus, { label: string; cls: string }> = {
  pending: { label: 'قيد الانتظار', cls: 'text-amber-400' },
  cleared: { label: 'تم الصرف', cls: 'text-emerald-400' },
  bounced: { label: 'مرتجع', cls: 'text-rose-400' },
}
export const TREASURY_CATEGORY: Record<string, string> = {
  sale: 'مبيعات', collection: 'تحصيل', purchase: 'مشتريات', refund: 'استرجاع', cheque: 'شيك',
}
export const categoryLabel = (c: string) => TREASURY_CATEGORY[c] ?? c
