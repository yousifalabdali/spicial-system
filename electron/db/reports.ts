// Dashboard numbers and period reports.
import { getDb } from './index'
import type { Channel, DashboardData, Invoice, SalesReport } from '../../shared/types'

const db = () => getDb()

// Money leaving the treasury that is not an operating expense.
const NON_EXPENSE = "('purchase','refund')"

/** Gross profit = net sales (before VAT) minus cost of goods sold, for invoices matching `where`. */
function profit(where: string, params: unknown[]) {
  const r = db().prepare(`
    SELECT
      COALESCE(SUM(s.subtotal - s.discount), 0) AS net,
      COALESCE((SELECT SUM(i.cost * i.qty) FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id WHERE s.status != 'cancelled' AND ${where}), 0) AS cogs
    FROM sales_invoices s WHERE s.status != 'cancelled' AND ${where}`).get(...params, ...params) as { net: number; cogs: number }
  return r.net - r.cogs
}

export function dashboard(): DashboardData {
  const one = <T>(sql: string, ...params: unknown[]) => db().prepare(sql).get(...params) as T
  const monthWhere = "strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime')"
  const todayWhere = "date(s.created_at) = date('now', 'localtime')"

  const monthSales = one<{ v: number }>(`SELECT COALESCE(SUM(total), 0) AS v FROM sales_invoices s WHERE status != 'cancelled' AND ${monthWhere}`).v
  const todayCollections = one<{ v: number }>("SELECT COALESCE(SUM(amount), 0) AS v FROM treasury WHERE type = 'in' AND date(created_at) = date('now','localtime')").v
  const todayExpenses = one<{ v: number }>(`SELECT COALESCE(SUM(amount), 0) AS v FROM treasury WHERE type = 'out' AND category NOT IN ${NON_EXPENSE} AND date(created_at) = date('now','localtime')`).v
  const customers = one<{ v: number }>('SELECT COUNT(*) AS v FROM customers').v
  const stock = one<{ count: number; value: number }>('SELECT COUNT(*) AS count, COALESCE(SUM(qty * cost), 0) AS value FROM products WHERE deleted = 0')
  const pendingPurchases = one<{ v: number }>("SELECT COUNT(*) AS v FROM purchase_orders WHERE status = 'pending'").v

  const alerts = {
    lowStock: one<{ v: number }>('SELECT COUNT(*) AS v FROM products WHERE deleted = 0 AND qty <= min_qty').v,
    dueInvoices: one<{ v: number }>("SELECT COUNT(*) AS v FROM sales_invoices WHERE status IN ('unpaid','partial')").v,
    latePurchases: one<{ v: number }>("SELECT COUNT(*) AS v FROM purchase_orders WHERE status = 'pending' AND expected_date < date('now','localtime')").v,
    dueCheques: one<{ v: number }>("SELECT COUNT(*) AS v FROM cheques WHERE status = 'pending' AND due_date <= date('now','localtime','+7 days')").v,
  }

  const byHour = db().prepare(`SELECT CAST(strftime('%H', created_at) AS INTEGER) AS h, SUM(total) AS total FROM sales_invoices s WHERE status != 'cancelled' AND ${todayWhere} GROUP BY h`).all() as { h: number; total: number }[]
  const hourMap = new Map(byHour.map((r) => [r.h, r.total]))
  const firstHour = Math.min(8, ...byHour.map((r) => r.h))
  const hourly = []
  for (let h = firstHour; h <= 23; h++) hourly.push({ hour: `${String(h).padStart(2, '0')}:00`, total: hourMap.get(h) ?? 0 })

  const channels = db().prepare(`SELECT channel, SUM(total) AS total FROM sales_invoices s WHERE status != 'cancelled' AND ${todayWhere} GROUP BY channel`).all() as { channel: Channel; total: number }[]

  return {
    monthSales,
    todayCollections,
    todayExpenses,
    monthProfit: profit(monthWhere, []),
    customers,
    productCount: stock.count,
    stockValue: stock.value,
    pendingPurchases,
    latestInvoices: db().prepare('SELECT * FROM sales_invoices ORDER BY id DESC LIMIT 5').all() as Invoice[],
    alerts,
    hourly,
    channels,
  }
}

export function salesReport(from: string, to: string): SalesReport {
  const range = 'date(s.created_at) BETWEEN ? AND ?'
  const sums = db().prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(subtotal), 0) AS subtotal, COALESCE(SUM(discount), 0) AS discount,
           COALESCE(SUM(vat), 0) AS vat, COALESCE(SUM(total), 0) AS total
    FROM sales_invoices s WHERE status != 'cancelled' AND ${range}`).get(from, to) as Omit<SalesReport, 'profit' | 'expenses' | 'daily' | 'topProducts' | 'expensesByCategory'>

  const daily = db().prepare(`
    SELECT date(s.created_at) AS day, SUM(s.total) AS total,
           SUM(s.subtotal - s.discount) - COALESCE(SUM((SELECT SUM(i.cost * i.qty) FROM sales_items i WHERE i.invoice_id = s.id)), 0) AS profit
    FROM sales_invoices s WHERE s.status != 'cancelled' AND ${range}
    GROUP BY day ORDER BY day`).all(from, to) as SalesReport['daily']

  const topProducts = db().prepare(`
    SELECT i.name, SUM(i.qty) AS qty, SUM(i.total) AS total
    FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id
    WHERE s.status != 'cancelled' AND ${range}
    GROUP BY COALESCE(i.product_id, i.name) ORDER BY total DESC LIMIT 15`).all(from, to) as SalesReport['topProducts']

  const expensesByCategory = db().prepare(`
    SELECT category, SUM(amount) AS total FROM treasury
    WHERE type = 'out' AND category NOT IN ${NON_EXPENSE} AND date(created_at) BETWEEN ? AND ?
    GROUP BY category ORDER BY total DESC`).all(from, to) as SalesReport['expensesByCategory']

  return {
    ...sums,
    profit: profit(range, [from, to]),
    expenses: expensesByCategory.reduce((s, e) => s + e.total, 0),
    daily,
    topProducts,
    expensesByCategory,
  }
}
