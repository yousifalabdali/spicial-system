// Explicit column lists, so no query uses SELECT * (only what the screens need crosses the network,
// and a new column, such as a big photo, never leaks into lists by accident).
const cols = (alias: string, names: string[]) => names.map((n) => (alias ? `${alias}.${n}` : n)).join(', ')

const INVOICE = ['id', 'number', 'customer_id', 'customer_name', 'channel', 'subtotal', 'discount', 'vat_rate', 'vat', 'total', 'paid', 'payment_method', 'status', 'due_date', 'notes', 'created_at']
const SALES_ITEM = ['id', 'invoice_id', 'product_id', 'name', 'qty', 'price', 'cost', 'total']
const PURCHASE = ['id', 'number', 'supplier_id', 'status', 'total', 'paid', 'expected_date', 'received_at', 'notes', 'created_at']
const PURCHASE_ITEM = ['id', 'order_id', 'product_id', 'name', 'qty', 'cost', 'total']
const PARTY = ['id', 'name', 'phone', 'address', 'notes', 'created_at']
const TREASURY = ['id', 'type', 'category', 'amount', 'description', 'ref', 'created_at']
const CHEQUE = ['id', 'direction', 'number', 'bank', 'party', 'amount', 'due_date', 'status', 'notes', 'created_at']
const USER = ['id', 'username', 'name', 'role', 'permissions', 'active', 'created_at', 'last_login']

export const C = {
  invoice: (a = '') => cols(a, INVOICE),
  salesItem: (a = '') => cols(a, SALES_ITEM),
  purchase: (a = '') => cols(a, PURCHASE),
  purchaseItem: (a = '') => cols(a, PURCHASE_ITEM),
  party: (a = '') => cols(a, PARTY),
  treasury: (a = '') => cols(a, TREASURY),
  cheque: (a = '') => cols(a, CHEQUE),
  /** Without password_hash: only login reads that. */
  user: (a = '') => cols(a, USER),
}

/** Upper bounds for list screens: enough for a shop, and a runaway table can't flood the page. */
export const MAX = { products: 5000, parties: 2000, cheques: 1000, users: 500, purchases: 500, lowStock: 300, items: 2000, settings: 200, days: 400 }
