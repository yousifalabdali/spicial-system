// Dashboard numbers and period reports.
import { q, SQL_TODAY, sqlDay } from './sql'
import type { Channel, DashboardData, Invoice, SalesReport } from '../../shared/types'

// Money leaving the treasury that is not an operating expense.
const NON_EXPENSE = "('purchase','refund')"
const DAY = (col: string) => `substr(${col}, 1, 10)`

/** Gross profit = net sales (before VAT) minus cost of goods sold, for invoices matching `where`. */
async function profit(where: string, params: unknown[]) {
  const r = await q.one<{ net: number; cogs: number }>(`
    SELECT
      COALESCE(SUM(s.subtotal - s.discount), 0) AS net,
      COALESCE((SELECT SUM(i.cost * i.qty) FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id WHERE s.status != 'cancelled' AND ${where}), 0) AS cogs
    FROM sales_invoices s WHERE s.status != 'cancelled' AND ${where}`, ...params, ...params)
  return r!.net - r!.cogs
}

const value = async (sql: string, ...params: unknown[]) => (await q.one<{ v: number }>(sql, ...params))!.v

export async function dashboard(): Promise<DashboardData> {
  const monthWhere = `substr(s.created_at, 1, 7) = substr(${SQL_TODAY}, 1, 7)`
  const todayWhere = `${DAY('s.created_at')} = ${SQL_TODAY}`

  const [monthSales, todayCollections, todayExpenses, customers, stock, pendingPurchases, lowStock, dueInvoices, latePurchases, dueCheques, byHour, channels, latestInvoices, monthProfit] = await Promise.all([
    value(`SELECT COALESCE(SUM(total), 0) AS v FROM sales_invoices s WHERE status != 'cancelled' AND ${monthWhere}`),
    value(`SELECT COALESCE(SUM(amount), 0) AS v FROM treasury WHERE type = 'in' AND ${DAY('created_at')} = ${SQL_TODAY}`),
    value(`SELECT COALESCE(SUM(amount), 0) AS v FROM treasury WHERE type = 'out' AND category NOT IN ${NON_EXPENSE} AND ${DAY('created_at')} = ${SQL_TODAY}`),
    value('SELECT COUNT(*) AS v FROM customers'),
    q.one<{ count: number; value: number }>('SELECT COUNT(*) AS count, COALESCE(SUM(qty * cost), 0) AS value FROM products WHERE deleted = 0'),
    value("SELECT COUNT(*) AS v FROM purchase_orders WHERE status = 'pending'"),
    value('SELECT COUNT(*) AS v FROM products WHERE deleted = 0 AND qty <= min_qty'),
    value("SELECT COUNT(*) AS v FROM sales_invoices WHERE status IN ('unpaid','partial')"),
    value(`SELECT COUNT(*) AS v FROM purchase_orders WHERE status = 'pending' AND expected_date < ${SQL_TODAY}`),
    value(`SELECT COUNT(*) AS v FROM cheques WHERE status = 'pending' AND due_date <= ${sqlDay(7)}`),
    q.all<{ h: number; total: number }>(`SELECT CAST(substr(created_at, 12, 2) AS INTEGER) AS h, SUM(total) AS total FROM sales_invoices s WHERE status != 'cancelled' AND ${todayWhere} GROUP BY 1`),
    q.all<{ channel: Channel; total: number }>(`SELECT channel, SUM(total) AS total FROM sales_invoices s WHERE status != 'cancelled' AND ${todayWhere} GROUP BY channel`),
    q.all<Invoice>('SELECT * FROM sales_invoices ORDER BY id DESC LIMIT 5'),
    profit(monthWhere, []),
  ])

  const hourMap = new Map(byHour.map((r) => [r.h, r.total]))
  const firstHour = Math.min(8, ...byHour.map((r) => r.h))
  const hourly = []
  for (let h = firstHour; h <= 23; h++) hourly.push({ hour: `${String(h).padStart(2, '0')}:00`, total: hourMap.get(h) ?? 0 })

  return {
    monthSales,
    todayCollections,
    todayExpenses,
    monthProfit,
    customers,
    productCount: stock!.count,
    stockValue: stock!.value,
    pendingPurchases,
    latestInvoices,
    alerts: { lowStock, dueInvoices, latePurchases, dueCheques },
    hourly,
    channels,
  }
}

export async function salesReport(from: string, to: string): Promise<SalesReport> {
  const range = `${DAY('s.created_at')} BETWEEN ? AND ?`
  const [sums, daily, topProducts, expensesByCategory, prof] = await Promise.all([
    q.one<Omit<SalesReport, 'profit' | 'expenses' | 'daily' | 'topProducts' | 'expensesByCategory'>>(`
      SELECT COUNT(*) AS count, COALESCE(SUM(subtotal), 0) AS subtotal, COALESCE(SUM(discount), 0) AS discount,
             COALESCE(SUM(vat), 0) AS vat, COALESCE(SUM(total), 0) AS total
      FROM sales_invoices s WHERE status != 'cancelled' AND ${range}`, from, to),
    q.all<SalesReport['daily'][number]>(`
      SELECT ${DAY('s.created_at')} AS day, SUM(s.total) AS total,
             SUM(s.subtotal - s.discount) - COALESCE(SUM((SELECT SUM(i.cost * i.qty) FROM sales_items i WHERE i.invoice_id = s.id)), 0) AS profit
      FROM sales_invoices s WHERE s.status != 'cancelled' AND ${range}
      GROUP BY 1 ORDER BY 1`, from, to),
    q.all<SalesReport['topProducts'][number]>(`
      SELECT MIN(i.name) AS name, SUM(i.qty) AS qty, SUM(i.total) AS total
      FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id
      WHERE s.status != 'cancelled' AND ${range}
      GROUP BY COALESCE(i.product_id::text, i.name) ORDER BY total DESC LIMIT 15`, from, to),
    q.all<SalesReport['expensesByCategory'][number]>(`
      SELECT category, SUM(amount) AS total FROM treasury
      WHERE type = 'out' AND category NOT IN ${NON_EXPENSE} AND ${DAY('created_at')} BETWEEN ? AND ?
      GROUP BY category ORDER BY total DESC`, from, to),
    profit(range, [from, to]),
  ])

  return {
    ...sums!,
    profit: prof,
    expenses: expensesByCategory.reduce((s, e) => s + e.total, 0),
    daily,
    topProducts,
    expensesByCategory,
  }
}
