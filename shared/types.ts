// Types shared by the Electron main process and the React renderer.
// All money values are integers in baisa (1 OMR = 1000 baisa).

export type Channel = 'retail' | 'wholesale' | 'distribution'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit'
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'cancelled'
export type PurchaseStatus = 'pending' | 'received' | 'cancelled'
export type ChequeStatus = 'pending' | 'cleared' | 'bounced'
export type PaperSize = '80mm' | 'A4'
export type LabelSize = '50x25' | '40x30' | '38x25' | '58x40'

export interface Product {
  id: number
  name: string
  code: string | null
  category: string | null
  unit: string
  cost: number
  price: number
  qty: number
  min_qty: number
  created_at: string
  has_image: number // 1 if a photo is stored (fetch it with getProductImage, it's not in lists)
}

/** image: undefined = keep the current photo, null = remove it, "data:image/jpeg;base64,..." = replace. */
export type ProductInput = Omit<Product, 'id' | 'created_at' | 'has_image'> & { image?: string | null }

export interface Party {
  id: number
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export type PartyInput = Omit<Party, 'id' | 'created_at'>

export interface Customer extends Party {
  balance: number // amount still owed by the customer
}

export interface Supplier extends Party {
  balance: number // amount still owed to the supplier
}

export interface InvoiceItem {
  id: number
  invoice_id: number
  product_id: number | null
  name: string
  qty: number
  price: number
  cost: number
  total: number
  has_image?: number // the product has a photo
}

export interface Invoice {
  id: number
  number: string
  customer_id: number | null
  customer_name: string
  channel: Channel
  subtotal: number
  discount: number
  vat_rate: number
  vat: number
  total: number
  paid: number
  payment_method: PaymentMethod
  status: InvoiceStatus
  due_date: string | null
  notes: string | null
  created_at: string
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[]
  customer_phone: string | null
}

export interface NewInvoice {
  customer_id: number | null
  channel: Channel
  items: { product_id: number; qty: number; price: number }[]
  discount: number
  paid: number
  payment_method: PaymentMethod
  due_date: string | null
  notes: string | null
}

export interface PurchaseItem {
  id: number
  order_id: number
  product_id: number
  name: string
  qty: number
  cost: number
  total: number
}

export interface PurchaseOrder {
  id: number
  number: string
  supplier_id: number
  supplier_name: string
  status: PurchaseStatus
  total: number
  paid: number
  expected_date: string | null
  received_at: string | null
  notes: string | null
  created_at: string
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseItem[]
}

export interface NewPurchaseOrder {
  supplier_id: number
  items: { product_id: number; qty: number; cost: number }[]
  expected_date: string | null
  notes: string | null
}

export interface TreasuryEntry {
  id: number
  type: 'in' | 'out'
  category: string
  amount: number
  description: string | null
  ref: string | null
  created_at: string
}

export type TreasuryInput = Pick<TreasuryEntry, 'type' | 'category' | 'amount' | 'description'>

export interface Cheque {
  id: number
  direction: 'in' | 'out'
  number: string
  bank: string | null
  party: string
  amount: number
  due_date: string
  status: ChequeStatus
  notes: string | null
  created_at: string
}

export type ChequeInput = Omit<Cheque, 'id' | 'status' | 'created_at'>

export interface Settings {
  shop_name: string
  shop_phone: string
  shop_address: string
  vat_number: string
  vat_enabled: boolean
  vat_rate: number // percent, e.g. 5
  paper: PaperSize
  printer_name: string // '' = system default
  silent_print: boolean
  receipt_footer: string
  label_size: LabelSize // width x height in mm
  label_printer: string // '' = system default
  label_show_shop: boolean
  label_show_price: boolean
  scan_auto_print: boolean // print a label as soon as a product is scanned (outside the POS)
  receipt_show_images: boolean // product photos next to each line on printed invoices
}

export interface DashboardData {
  monthSales: number
  todayCollections: number
  todayExpenses: number
  monthProfit: number
  customers: number
  productCount: number
  stockValue: number
  pendingPurchases: number
  latestInvoices: Invoice[]
  alerts: { lowStock: number; dueInvoices: number; latePurchases: number; dueCheques: number }
  hourly: { hour: string; total: number }[]
  channels: { channel: Channel; total: number }[]
}

export interface SalesReport {
  count: number
  subtotal: number
  discount: number
  vat: number
  total: number
  profit: number
  expenses: number
  daily: { day: string; total: number; profit: number }[]
  topProducts: { name: string; qty: number; total: number }[]
  expensesByCategory: { category: string; total: number }[]
}
