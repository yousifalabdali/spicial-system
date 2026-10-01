//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let electron = require("electron");
let node_path = require("node:path");
node_path = __toESM(node_path);
let better_sqlite3 = require("better-sqlite3");
better_sqlite3 = __toESM(better_sqlite3);
let node_fs = require("node:fs");
node_fs = __toESM(node_fs);
//#region electron/db/index.ts
var SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'حبة',
  cost INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'retail',
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 0,
  vat INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales_invoices(created_at);

CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  total INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items(invoice_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  expected_date TEXT,
  received_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('in','out')),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_treasury_created ON treasury(created_at);

CREATE TABLE IF NOT EXISTS cheques (
  id INTEGER PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  number TEXT NOT NULL,
  bank TEXT,
  party TEXT NOT NULL,
  amount INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`;
var DEFAULT_SETTINGS = {
	shop_name: "Sales Inventory Pro",
	shop_phone: "",
	shop_address: "",
	vat_number: "",
	vat_enabled: true,
	vat_rate: 5,
	paper: "80mm",
	printer_name: "",
	silent_print: false,
	receipt_footer: "شكراً لزيارتكم"
};
var db$5;
function openDb(file) {
	db$5 = new better_sqlite3.default(file);
	db$5.pragma("journal_mode = WAL");
	db$5.pragma("foreign_keys = ON");
	db$5.exec(SCHEMA);
	return db$5;
}
function getDb() {
	return db$5;
}
function getSettings() {
	const rows = db$5.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'").all();
	const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
	return {
		...DEFAULT_SETTINGS,
		...stored
	};
}
function saveSettings(patch) {
	const stmt = db$5.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
	db$5.transaction(() => {
		for (const [key, value] of Object.entries(patch)) if (key in DEFAULT_SETTINGS) stmt.run(key, JSON.stringify(value));
	})();
	return getSettings();
}
function getMeta(key) {
	return db$5.prepare("SELECT value FROM settings WHERE key = ?").get(`_${key}`)?.value;
}
function setMeta(key, value) {
	db$5.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`_${key}`, value);
}
/** Wipe every business table (keeps settings). Used by "start fresh" in Settings. */
function resetData() {
	db$5.transaction(() => {
		for (const t of [
			"stock_moves",
			"sales_items",
			"sales_invoices",
			"purchase_items",
			"purchase_orders",
			"treasury",
			"cheques",
			"products",
			"customers",
			"suppliers"
		]) db$5.exec(`DELETE FROM ${t}`);
	})();
}
/** Current local date/time in SQLite's text format. */
function nowLocal() {
	return db$5.prepare("SELECT datetime('now','localtime') AS t").get().t;
}
//#endregion
//#region electron/db/catalog.ts
var catalog_exports = /* @__PURE__ */ __exportAll({
	deleteCustomer: () => deleteCustomer,
	deleteProduct: () => deleteProduct,
	deleteSupplier: () => deleteSupplier,
	listCustomers: () => listCustomers,
	listProducts: () => listProducts,
	listSuppliers: () => listSuppliers,
	saveCustomer: () => saveCustomer,
	saveProduct: () => saveProduct,
	saveSupplier: () => saveSupplier
});
var db$4 = () => getDb();
function listProducts() {
	return db$4().prepare("SELECT * FROM products WHERE deleted = 0 ORDER BY name").all();
}
function cleanProduct(p) {
	if (!p.name?.trim()) throw new Error("اسم الصنف مطلوب");
	return {
		name: p.name.trim(),
		code: p.code?.trim() || null,
		category: p.category?.trim() || null,
		unit: p.unit?.trim() || "حبة",
		cost: Math.round(p.cost) || 0,
		price: Math.round(p.price) || 0,
		qty: Math.round(p.qty) || 0,
		min_qty: Math.round(p.min_qty) || 0
	};
}
function assertCodeFree(code, exceptId = 0) {
	if (!code) return;
	if (db$4().prepare("SELECT id FROM products WHERE code = ? AND id != ?").get(code, exceptId)) throw new Error("الكود مستخدم لصنف آخر");
}
function saveProduct(input) {
	const p = cleanProduct(input);
	assertCodeFree(p.code, input.id);
	if (input.id) {
		const before = db$4().prepare("SELECT qty FROM products WHERE id = ?").get(input.id);
		db$4().transaction(() => {
			db$4().prepare("UPDATE products SET name=@name, code=@code, category=@category, unit=@unit, cost=@cost, price=@price, qty=@qty, min_qty=@min_qty WHERE id=@id").run({
				...p,
				id: input.id
			});
			if (before && before.qty !== p.qty) db$4().prepare("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'adjust')").run(input.id, p.qty - before.qty);
		})();
		return db$4().prepare("SELECT * FROM products WHERE id = ?").get(input.id);
	}
	const id = db$4().transaction(() => {
		const r = db$4().prepare("INSERT INTO products (name, code, category, unit, cost, price, qty, min_qty) VALUES (@name, @code, @category, @unit, @cost, @price, @qty, @min_qty)").run(p);
		if (p.qty) db$4().prepare("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'opening')").run(r.lastInsertRowid, p.qty);
		return r.lastInsertRowid;
	})();
	return db$4().prepare("SELECT * FROM products WHERE id = ?").get(id);
}
function deleteProduct(id) {
	db$4().prepare("UPDATE products SET deleted = 1, code = NULL WHERE id = ?").run(id);
}
function listCustomers() {
	return db$4().prepare(`
    SELECT c.*, COALESCE((SELECT SUM(total - paid) FROM sales_invoices s WHERE s.customer_id = c.id AND s.status IN ('unpaid','partial')), 0) AS balance
    FROM customers c ORDER BY c.name`).all();
}
function listSuppliers() {
	return db$4().prepare(`
    SELECT s.*, COALESCE((SELECT SUM(total - paid) FROM purchase_orders p WHERE p.supplier_id = s.id AND p.status = 'received'), 0) AS balance
    FROM suppliers s ORDER BY s.name`).all();
}
function saveParty(table, input) {
	if (!input.name?.trim()) throw new Error("الاسم مطلوب");
	const p = {
		name: input.name.trim(),
		phone: input.phone?.trim() || null,
		address: input.address?.trim() || null,
		notes: input.notes?.trim() || null
	};
	if (input.id) {
		db$4().prepare(`UPDATE ${table} SET name=@name, phone=@phone, address=@address, notes=@notes WHERE id=@id`).run({
			...p,
			id: input.id
		});
		return input.id;
	}
	return Number(db$4().prepare(`INSERT INTO ${table} (name, phone, address, notes) VALUES (@name, @phone, @address, @notes)`).run(p).lastInsertRowid);
}
var saveCustomer = (input) => saveParty("customers", input);
var saveSupplier = (input) => saveParty("suppliers", input);
function deleteCustomer(id) {
	if (db$4().prepare("SELECT 1 FROM sales_invoices WHERE customer_id = ? LIMIT 1").get(id)) throw new Error("لا يمكن حذف عميل لديه فواتير");
	db$4().prepare("DELETE FROM customers WHERE id = ?").run(id);
}
function deleteSupplier(id) {
	if (db$4().prepare("SELECT 1 FROM purchase_orders WHERE supplier_id = ? LIMIT 1").get(id)) throw new Error("لا يمكن حذف مورد لديه أوامر شراء");
	db$4().prepare("DELETE FROM suppliers WHERE id = ?").run(id);
}
//#endregion
//#region electron/db/sales.ts
var sales_exports = /* @__PURE__ */ __exportAll({
	cancelInvoice: () => cancelInvoice,
	createInvoice: () => createInvoice,
	getInvoice: () => getInvoice,
	listInvoices: () => listInvoices,
	payInvoice: () => payInvoice
});
var db$3 = () => getDb();
function statusFor(total, paid) {
	if (paid >= total) return "paid";
	return paid > 0 ? "partial" : "unpaid";
}
function createInvoice(input) {
	if (!input.items.length) throw new Error("الفاتورة فارغة");
	const settings = getSettings();
	const vatRate = settings.vat_enabled ? settings.vat_rate : 0;
	return getInvoice(db$3().transaction(() => {
		const getProduct = db$3().prepare("SELECT * FROM products WHERE id = ? AND deleted = 0");
		const lines = input.items.map((item) => {
			const p = getProduct.get(item.product_id);
			if (!p) throw new Error("صنف غير موجود");
			const qty = Math.round(item.qty);
			if (qty <= 0) throw new Error(`كمية غير صحيحة للصنف «${p.name}»`);
			if (qty > p.qty) throw new Error(`الكمية المتوفرة من «${p.name}» هي ${p.qty} فقط`);
			const price = Math.round(item.price);
			return {
				product: p,
				qty,
				price,
				total: qty * price
			};
		});
		const subtotal = lines.reduce((s, l) => s + l.total, 0);
		const discount = Math.min(Math.max(Math.round(input.discount) || 0, 0), subtotal);
		const vat = Math.round((subtotal - discount) * vatRate / 100);
		const total = subtotal - discount + vat;
		const paid = input.payment_method === "credit" ? Math.max(0, Math.min(Math.round(input.paid) || 0, total)) : total;
		let customerName = "عميل نقدي";
		if (input.customer_id) {
			const c = db$3().prepare("SELECT name FROM customers WHERE id = ?").get(input.customer_id);
			if (!c) throw new Error("العميل غير موجود");
			customerName = c.name;
		}
		if (paid < total && !input.customer_id) throw new Error("البيع الآجل يتطلب اختيار عميل");
		const r = db$3().prepare(`
      INSERT INTO sales_invoices (customer_id, customer_name, channel, subtotal, discount, vat_rate, vat, total, paid, payment_method, status, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.customer_id, customerName, input.channel, subtotal, discount, vatRate, vat, total, paid, input.payment_method, statusFor(total, paid), input.due_date || null, input.notes || null);
		const invoiceId = Number(r.lastInsertRowid);
		const number = `INV-${1e3 + invoiceId}`;
		db$3().prepare("UPDATE sales_invoices SET number = ? WHERE id = ?").run(number, invoiceId);
		const insItem = db$3().prepare("INSERT INTO sales_items (invoice_id, product_id, name, qty, price, cost, total) VALUES (?, ?, ?, ?, ?, ?, ?)");
		const decStock = db$3().prepare("UPDATE products SET qty = qty - ? WHERE id = ?");
		const move = db$3().prepare("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'sale', ?)");
		for (const l of lines) {
			insItem.run(invoiceId, l.product.id, l.product.name, l.qty, l.price, l.product.cost, l.total);
			decStock.run(l.qty, l.product.id);
			move.run(l.product.id, -l.qty, number);
		}
		if (paid > 0) db$3().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('in', 'sale', ?, ?, ?)").run(paid, `فاتورة مبيعات ${number}`, number);
		return invoiceId;
	})());
}
function getInvoice(id) {
	const inv = db$3().prepare("SELECT * FROM sales_invoices WHERE id = ?").get(id);
	if (!inv) throw new Error("الفاتورة غير موجودة");
	const items = db$3().prepare("SELECT * FROM sales_items WHERE invoice_id = ? ORDER BY id").all(id);
	return {
		...inv,
		items
	};
}
function listInvoices(filter = {}) {
	const where = [];
	const params = [];
	if (filter.from) {
		where.push("date(created_at) >= ?");
		params.push(filter.from);
	}
	if (filter.to) {
		where.push("date(created_at) <= ?");
		params.push(filter.to);
	}
	if (filter.status === "due") where.push("status IN ('unpaid','partial')");
	else if (filter.status) {
		where.push("status = ?");
		params.push(filter.status);
	}
	if (filter.search) {
		where.push("(number LIKE ? OR customer_name LIKE ?)");
		params.push(`%${filter.search}%`, `%${filter.search}%`);
	}
	const sql = `SELECT * FROM sales_invoices ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 500`;
	return db$3().prepare(sql).all(...params);
}
function payInvoice(id, amount) {
	const inv = getInvoice(id);
	if (inv.status === "cancelled") throw new Error("الفاتورة ملغاة");
	const remaining = inv.total - inv.paid;
	const pay = Math.min(Math.round(amount), remaining);
	if (pay <= 0) throw new Error("المبلغ غير صحيح");
	db$3().transaction(() => {
		const paid = inv.paid + pay;
		db$3().prepare("UPDATE sales_invoices SET paid = ?, status = ? WHERE id = ?").run(paid, statusFor(inv.total, paid), id);
		db$3().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('in', 'collection', ?, ?, ?)").run(pay, `تحصيل من ${inv.customer_name} - ${inv.number}`, inv.number);
	})();
	return getInvoice(id);
}
function cancelInvoice(id) {
	const inv = getInvoice(id);
	if (inv.status === "cancelled") return inv;
	db$3().transaction(() => {
		const incStock = db$3().prepare("UPDATE products SET qty = qty + ? WHERE id = ?");
		const move = db$3().prepare("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'cancel', ?)");
		for (const item of inv.items) {
			if (!item.product_id) continue;
			incStock.run(item.qty, item.product_id);
			move.run(item.product_id, item.qty, inv.number);
		}
		if (inv.paid > 0) db$3().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'refund', ?, ?, ?)").run(inv.paid, `إلغاء فاتورة ${inv.number}`, inv.number);
		db$3().prepare("UPDATE sales_invoices SET status = 'cancelled' WHERE id = ?").run(id);
	})();
	return getInvoice(id);
}
//#endregion
//#region electron/db/purchases.ts
var purchases_exports = /* @__PURE__ */ __exportAll({
	cancelPurchase: () => cancelPurchase,
	createPurchase: () => createPurchase,
	getPurchase: () => getPurchase,
	listPurchases: () => listPurchases,
	payPurchase: () => payPurchase,
	receivePurchase: () => receivePurchase
});
var db$2 = () => getDb();
var SELECT = `SELECT p.*, s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id`;
function listPurchases(filter = {}) {
	if (filter.status) return db$2().prepare(`${SELECT} WHERE p.status = ? ORDER BY p.id DESC`).all(filter.status);
	return db$2().prepare(`${SELECT} ORDER BY p.id DESC LIMIT 500`).all();
}
function getPurchase(id) {
	const po = db$2().prepare(`${SELECT} WHERE p.id = ?`).get(id);
	if (!po) throw new Error("أمر الشراء غير موجود");
	const items = db$2().prepare("SELECT * FROM purchase_items WHERE order_id = ? ORDER BY id").all(id);
	return {
		...po,
		items
	};
}
function createPurchase(input) {
	if (!input.items.length) throw new Error("أمر الشراء فارغ");
	return getPurchase(db$2().transaction(() => {
		const getProduct = db$2().prepare("SELECT * FROM products WHERE id = ?");
		const lines = input.items.map((i) => {
			const p = getProduct.get(i.product_id);
			if (!p) throw new Error("صنف غير موجود");
			const qty = Math.round(i.qty);
			if (qty <= 0) throw new Error(`كمية غير صحيحة للصنف «${p.name}»`);
			const cost = Math.round(i.cost);
			return {
				p,
				qty,
				cost,
				total: qty * cost
			};
		});
		const total = lines.reduce((s, l) => s + l.total, 0);
		const r = db$2().prepare("INSERT INTO purchase_orders (supplier_id, total, expected_date, notes) VALUES (?, ?, ?, ?)").run(input.supplier_id, total, input.expected_date || null, input.notes || null);
		const orderId = Number(r.lastInsertRowid);
		db$2().prepare("UPDATE purchase_orders SET number = ? WHERE id = ?").run(`PO-${1e3 + orderId}`, orderId);
		const ins = db$2().prepare("INSERT INTO purchase_items (order_id, product_id, name, qty, cost, total) VALUES (?, ?, ?, ?, ?, ?)");
		for (const l of lines) ins.run(orderId, l.p.id, l.p.name, l.qty, l.cost, l.total);
		return orderId;
	})());
}
/** Mark an order received: stock goes up, product cost is updated, optional payment goes out of the treasury. */
function receivePurchase(id, paid) {
	const po = getPurchase(id);
	if (po.status !== "pending") throw new Error("أمر الشراء ليس قيد الانتظار");
	const pay = Math.max(0, Math.min(Math.round(paid) || 0, po.total));
	db$2().transaction(() => {
		const upd = db$2().prepare("UPDATE products SET qty = qty + ?, cost = ? WHERE id = ?");
		const move = db$2().prepare("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'purchase', ?)");
		for (const item of po.items) {
			upd.run(item.qty, item.cost, item.product_id);
			move.run(item.product_id, item.qty, po.number);
		}
		db$2().prepare("UPDATE purchase_orders SET status = 'received', paid = ?, received_at = ? WHERE id = ?").run(pay, nowLocal(), id);
		if (pay > 0) db$2().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'purchase', ?, ?, ?)").run(pay, `دفعة للمورد ${po.supplier_name} - ${po.number}`, po.number);
	})();
	return getPurchase(id);
}
function payPurchase(id, amount) {
	const po = getPurchase(id);
	if (po.status !== "received") throw new Error("يجب استلام أمر الشراء أولاً");
	const pay = Math.min(Math.round(amount), po.total - po.paid);
	if (pay <= 0) throw new Error("المبلغ غير صحيح");
	db$2().transaction(() => {
		db$2().prepare("UPDATE purchase_orders SET paid = paid + ? WHERE id = ?").run(pay, id);
		db$2().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'purchase', ?, ?, ?)").run(pay, `دفعة للمورد ${po.supplier_name} - ${po.number}`, po.number);
	})();
	return getPurchase(id);
}
function cancelPurchase(id) {
	if (getPurchase(id).status !== "pending") throw new Error("لا يمكن إلغاء أمر تم استلامه");
	db$2().prepare("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?").run(id);
	return getPurchase(id);
}
//#endregion
//#region electron/db/treasury.ts
var treasury_exports = /* @__PURE__ */ __exportAll({
	addCheque: () => addCheque,
	addTreasury: () => addTreasury,
	deleteCheque: () => deleteCheque,
	deleteTreasury: () => deleteTreasury,
	listCheques: () => listCheques,
	listTreasury: () => listTreasury,
	setChequeStatus: () => setChequeStatus,
	treasuryBalance: () => treasuryBalance
});
var db$1 = () => getDb();
function treasuryBalance() {
	return db$1().prepare("SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS b FROM treasury").get().b;
}
function listTreasury(filter = {}) {
	const where = [];
	const params = [];
	if (filter.from) {
		where.push("date(created_at) >= ?");
		params.push(filter.from);
	}
	if (filter.to) {
		where.push("date(created_at) <= ?");
		params.push(filter.to);
	}
	return db$1().prepare(`SELECT * FROM treasury ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 1000`).all(...params);
}
function addTreasury(input) {
	const amount = Math.round(input.amount);
	if (!(amount > 0)) throw new Error("المبلغ غير صحيح");
	if (!input.category?.trim()) throw new Error("التصنيف مطلوب");
	db$1().prepare("INSERT INTO treasury (type, category, amount, description) VALUES (?, ?, ?, ?)").run(input.type, input.category.trim(), amount, input.description?.trim() || null);
}
function deleteTreasury(id) {
	if (db$1().prepare("SELECT ref FROM treasury WHERE id = ?").get(id)?.ref) throw new Error("هذه الحركة مرتبطة بفاتورة أو أمر شراء ولا يمكن حذفها");
	db$1().prepare("DELETE FROM treasury WHERE id = ?").run(id);
}
function listCheques() {
	return db$1().prepare("SELECT * FROM cheques ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, due_date").all();
}
function addCheque(input) {
	const amount = Math.round(input.amount);
	if (!(amount > 0)) throw new Error("المبلغ غير صحيح");
	if (!input.number?.trim() || !input.party?.trim() || !input.due_date) throw new Error("رقم الشيك والجهة وتاريخ الاستحقاق مطلوبة");
	db$1().prepare("INSERT INTO cheques (direction, number, bank, party, amount, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.direction, input.number.trim(), input.bank?.trim() || null, input.party.trim(), amount, input.due_date, input.notes?.trim() || null);
}
/** Clearing a cheque records the money in the treasury; bouncing just marks it. */
function setChequeStatus(id, status) {
	const c = db$1().prepare("SELECT * FROM cheques WHERE id = ?").get(id);
	if (!c) throw new Error("الشيك غير موجود");
	if (c.status !== "pending") throw new Error("تم تحديث حالة هذا الشيك مسبقاً");
	db$1().transaction(() => {
		db$1().prepare("UPDATE cheques SET status = ? WHERE id = ?").run(status, id);
		if (status === "cleared") db$1().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES (?, 'cheque', ?, ?, ?)").run(c.direction, c.amount, `شيك رقم ${c.number} - ${c.party}`, `CHQ-${c.id}`);
	})();
}
function deleteCheque(id) {
	db$1().prepare("DELETE FROM cheques WHERE id = ? AND status = 'pending'").run(id);
}
//#endregion
//#region electron/db/seed.ts
var r = (omr) => Math.round(omr * 1e3);
function seedIfEmpty() {
	if (getMeta("seeded")) return;
	const db = getDb();
	const hasData = db.prepare("SELECT COUNT(*) AS c FROM products").get().c > 0;
	setMeta("seeded", "1");
	if (hasData) return;
	db.transaction(() => {
		const products = [
			[
				"أرز بسمتي 5 كجم",
				"6281001001",
				"مواد غذائية",
				"كيس",
				2.1,
				2.75,
				120,
				20
			],
			[
				"زيت دوار الشمس 1.8 لتر",
				"6281001002",
				"مواد غذائية",
				"علبة",
				1.15,
				1.5,
				80,
				15
			],
			[
				"سكر 2 كجم",
				"6281001003",
				"مواد غذائية",
				"كيس",
				.55,
				.75,
				6,
				20
			],
			[
				"حليب مجفف 900 جم",
				"6281001004",
				"ألبان",
				"علبة",
				2.4,
				3.1,
				45,
				10
			],
			[
				"شاي أحمر 100 كيس",
				"6281001005",
				"مشروبات",
				"علبة",
				.9,
				1.25,
				60,
				10
			],
			[
				"قهوة عربية 250 جم",
				"6281001006",
				"مشروبات",
				"كيس",
				1.8,
				2.5,
				4,
				8
			],
			[
				"معكرونة 500 جم",
				"6281001007",
				"مواد غذائية",
				"كيس",
				.18,
				.3,
				200,
				30
			],
			[
				"مياه معدنية 12×330مل",
				"6281001008",
				"مشروبات",
				"كرتون",
				.65,
				.95,
				150,
				25
			],
			[
				"منظف أرضيات 3 لتر",
				"6281001009",
				"منظفات",
				"علبة",
				.85,
				1.3,
				3,
				10
			],
			[
				"مناديل ورقية 5 حبات",
				"6281001010",
				"منظفات",
				"ربطة",
				.7,
				1.1,
				90,
				15
			],
			[
				"تونة 185 جم",
				"6281001011",
				"معلبات",
				"علبة",
				.32,
				.5,
				5,
				24
			],
			[
				"عسل طبيعي 500 جم",
				"6281001012",
				"مواد غذائية",
				"علبة",
				3.5,
				4.9,
				25,
				5
			]
		];
		const ids = products.map(([name, code, category, unit, cost, price, qty, min]) => saveProduct({
			name,
			code,
			category,
			unit,
			cost: r(cost),
			price: r(price),
			qty,
			min_qty: min
		}).id);
		const customers = [
			"مؤسسة الأفق",
			"شركة اليسر",
			"مؤسسة الثقة",
			"محلات النور"
		].map((name, i) => saveCustomer({
			name,
			phone: `9${i + 1}234567`,
			address: "مسقط",
			notes: null
		}));
		const suppliers = ["شركة الخليج للتوزيع", "مؤسسة الوادي التجارية"].map((name, i) => saveSupplier({
			name,
			phone: `2${i + 4}456789`,
			address: "صحار",
			notes: null
		}));
		const sales = [
			{
				c: null,
				ch: "retail",
				items: [[0, 2], [1, 1]]
			},
			{
				c: customers[0],
				ch: "wholesale",
				items: [[0, 10], [6, 30]]
			},
			{
				c: customers[1],
				ch: "distribution",
				items: [[7, 20], [4, 6]],
				credit: true
			},
			{
				c: customers[2],
				ch: "wholesale",
				items: [[3, 8], [11, 2]]
			},
			{
				c: null,
				ch: "retail",
				items: [
					[9, 2],
					[10, 3],
					[2, 2]
				]
			},
			{
				c: null,
				ch: "retail",
				items: [[5, 1], [4, 1]]
			},
			{
				c: customers[3],
				ch: "distribution",
				items: [[1, 12]],
				credit: true
			},
			{
				c: null,
				ch: "retail",
				items: [[7, 3], [6, 5]]
			}
		];
		const lastHour = Math.max(9, (/* @__PURE__ */ new Date()).getHours());
		const hours = sales.map((_, i) => 8 + Math.floor(i * (lastHour - 8) / sales.length));
		sales.forEach((s, i) => {
			const inv = createInvoice({
				customer_id: s.c,
				channel: s.ch,
				items: s.items.map(([p, qty]) => ({
					product_id: ids[p],
					qty,
					price: r(products[p][5])
				})),
				discount: 0,
				paid: 0,
				payment_method: s.credit ? "credit" : "cash",
				due_date: null,
				notes: null
			});
			const t = `${String(hours[i]).padStart(2, "0")}:${String(10 + i * 5).padStart(2, "0")}:00`;
			db.prepare("UPDATE sales_invoices SET created_at = date('now','localtime') || ' ' || ? WHERE id = ?").run(t, inv.id);
			db.prepare("UPDATE treasury SET created_at = date('now','localtime') || ' ' || ? WHERE ref = ?").run(t, inv.number);
		});
		const po1 = createPurchase({
			supplier_id: suppliers[0],
			items: [{
				product_id: ids[2],
				qty: 50,
				cost: r(.55)
			}, {
				product_id: ids[10],
				qty: 48,
				cost: r(.32)
			}],
			expected_date: null,
			notes: null
		});
		db.prepare("UPDATE purchase_orders SET expected_date = date('now','localtime','-2 days') WHERE id = ?").run(po1.id);
		createPurchase({
			supplier_id: suppliers[1],
			items: [{
				product_id: ids[8],
				qty: 24,
				cost: r(.85)
			}],
			expected_date: null,
			notes: null
		});
		receivePurchase(createPurchase({
			supplier_id: suppliers[1],
			items: [{
				product_id: ids[11],
				qty: 10,
				cost: r(3.5)
			}],
			expected_date: null,
			notes: null
		}).id, r(20));
		addTreasury({
			type: "out",
			category: "كهرباء",
			amount: r(18.5),
			description: "فاتورة الكهرباء"
		});
		addTreasury({
			type: "out",
			category: "نقل",
			amount: r(6),
			description: "توصيل بضاعة"
		});
		addCheque({
			direction: "in",
			number: "100245",
			bank: "بنك مسقط",
			party: "مؤسسة الأفق",
			amount: r(150),
			due_date: new Date(Date.now() + 2592e5).toISOString().slice(0, 10),
			notes: null
		});
	})();
}
//#endregion
//#region electron/db/reports.ts
var reports_exports = /* @__PURE__ */ __exportAll({
	dashboard: () => dashboard,
	salesReport: () => salesReport
});
var db = () => getDb();
var NON_EXPENSE = "('purchase','refund')";
/** Gross profit = net sales (before VAT) minus cost of goods sold, for invoices matching `where`. */
function profit(where, params) {
	const r = db().prepare(`
    SELECT
      COALESCE(SUM(s.subtotal - s.discount), 0) AS net,
      COALESCE((SELECT SUM(i.cost * i.qty) FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id WHERE s.status != 'cancelled' AND ${where}), 0) AS cogs
    FROM sales_invoices s WHERE s.status != 'cancelled' AND ${where}`).get(...params, ...params);
	return r.net - r.cogs;
}
function dashboard() {
	const one = (sql, ...params) => db().prepare(sql).get(...params);
	const monthWhere = "strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime')";
	const todayWhere = "date(s.created_at) = date('now', 'localtime')";
	const monthSales = one(`SELECT COALESCE(SUM(total), 0) AS v FROM sales_invoices s WHERE status != 'cancelled' AND ${monthWhere}`).v;
	const todayCollections = one("SELECT COALESCE(SUM(amount), 0) AS v FROM treasury WHERE type = 'in' AND date(created_at) = date('now','localtime')").v;
	const todayExpenses = one(`SELECT COALESCE(SUM(amount), 0) AS v FROM treasury WHERE type = 'out' AND category NOT IN ${NON_EXPENSE} AND date(created_at) = date('now','localtime')`).v;
	const customers = one("SELECT COUNT(*) AS v FROM customers").v;
	const stock = one("SELECT COUNT(*) AS count, COALESCE(SUM(qty * cost), 0) AS value FROM products WHERE deleted = 0");
	const pendingPurchases = one("SELECT COUNT(*) AS v FROM purchase_orders WHERE status = 'pending'").v;
	const alerts = {
		lowStock: one("SELECT COUNT(*) AS v FROM products WHERE deleted = 0 AND qty <= min_qty").v,
		dueInvoices: one("SELECT COUNT(*) AS v FROM sales_invoices WHERE status IN ('unpaid','partial')").v,
		latePurchases: one("SELECT COUNT(*) AS v FROM purchase_orders WHERE status = 'pending' AND expected_date < date('now','localtime')").v,
		dueCheques: one("SELECT COUNT(*) AS v FROM cheques WHERE status = 'pending' AND due_date <= date('now','localtime','+7 days')").v
	};
	const byHour = db().prepare(`SELECT CAST(strftime('%H', created_at) AS INTEGER) AS h, SUM(total) AS total FROM sales_invoices s WHERE status != 'cancelled' AND ${todayWhere} GROUP BY h`).all();
	const hourMap = new Map(byHour.map((r) => [r.h, r.total]));
	const firstHour = Math.min(8, ...byHour.map((r) => r.h));
	const hourly = [];
	for (let h = firstHour; h <= 23; h++) hourly.push({
		hour: `${String(h).padStart(2, "0")}:00`,
		total: hourMap.get(h) ?? 0
	});
	const channels = db().prepare(`SELECT channel, SUM(total) AS total FROM sales_invoices s WHERE status != 'cancelled' AND ${todayWhere} GROUP BY channel`).all();
	return {
		monthSales,
		todayCollections,
		todayExpenses,
		monthProfit: profit(monthWhere, []),
		customers,
		productCount: stock.count,
		stockValue: stock.value,
		pendingPurchases,
		latestInvoices: db().prepare("SELECT * FROM sales_invoices ORDER BY id DESC LIMIT 5").all(),
		alerts,
		hourly,
		channels
	};
}
function salesReport(from, to) {
	const range = "date(s.created_at) BETWEEN ? AND ?";
	const sums = db().prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(subtotal), 0) AS subtotal, COALESCE(SUM(discount), 0) AS discount,
           COALESCE(SUM(vat), 0) AS vat, COALESCE(SUM(total), 0) AS total
    FROM sales_invoices s WHERE status != 'cancelled' AND ${range}`).get(from, to);
	const daily = db().prepare(`
    SELECT date(s.created_at) AS day, SUM(s.total) AS total,
           SUM(s.subtotal - s.discount) - COALESCE(SUM((SELECT SUM(i.cost * i.qty) FROM sales_items i WHERE i.invoice_id = s.id)), 0) AS profit
    FROM sales_invoices s WHERE s.status != 'cancelled' AND ${range}
    GROUP BY day ORDER BY day`).all(from, to);
	const topProducts = db().prepare(`
    SELECT i.name, SUM(i.qty) AS qty, SUM(i.total) AS total
    FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id
    WHERE s.status != 'cancelled' AND ${range}
    GROUP BY COALESCE(i.product_id, i.name) ORDER BY total DESC LIMIT 15`).all(from, to);
	const expensesByCategory = db().prepare(`
    SELECT category, SUM(amount) AS total FROM treasury
    WHERE type = 'out' AND category NOT IN ${NON_EXPENSE} AND date(created_at) BETWEEN ? AND ?
    GROUP BY category ORDER BY total DESC`).all(from, to);
	return {
		...sums,
		profit: profit(range, [from, to]),
		expenses: expensesByCategory.reduce((s, e) => s + e.total, 0),
		daily,
		topProducts,
		expensesByCategory
	};
}
//#endregion
//#region electron/print.ts
var CHANNELS = {
	retail: "مبيعات محل",
	wholesale: "جملة",
	distribution: "توزيعات"
};
var METHODS = {
	cash: "نقداً",
	card: "بطاقة",
	transfer: "تحويل",
	credit: "آجل"
};
var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
})[c]);
var money = (baisa) => (baisa / 1e3).toLocaleString("en-US", {
	minimumFractionDigits: 3,
	maximumFractionDigits: 3
});
function receiptHtml(inv, s, paper) {
	const thermal = paper === "80mm";
	const rows = inv.items.map((i) => `
    <tr><td class="name">${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.total)}</td></tr>`).join("");
	const remaining = inv.total - inv.paid;
	return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { margin: ${thermal ? "0" : "12mm"}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Tahoma, 'Segoe UI', 'Geeza Pro', Arial, sans-serif; color: #000; font-size: ${thermal ? "11px" : "13px"}; }
    .wrap { width: ${thermal ? "72mm" : "100%"}; margin: 0 auto; padding: ${thermal ? "3mm 0" : "0"}; }
    h1 { font-size: ${thermal ? "16px" : "22px"}; margin: 0 0 2px; text-align: center; }
    .center { text-align: center; }
    .muted { color: #333; }
    .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 10px; margin: 8px 0; }
    .title { text-align: center; font-weight: bold; border: 1px solid #000; padding: 3px; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: ${thermal ? "3px 1px" : "6px 4px"}; text-align: center; }
    th { border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    td.name { text-align: right; }
    ${thermal ? "" : "th, td { border: 1px solid #999; } th { background: #eee; }"}
    .totals { margin-top: 6px; border-top: 1px dashed #000; padding-top: 4px; ${thermal ? "" : "width: 45%; margin-right: auto;"} }
    .totals div { display: flex; justify-content: space-between; padding: 1px 0; }
    .grand { font-weight: bold; font-size: 1.25em; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px !important; }
    .footer { margin-top: 10px; text-align: center; border-top: 1px dashed #000; padding-top: 6px; }
  </style></head><body><div class="wrap">
    <h1>${esc(s.shop_name)}</h1>
    ${s.shop_address ? `<div class="center muted">${esc(s.shop_address)}</div>` : ""}
    ${s.shop_phone ? `<div class="center muted">هاتف: ${esc(s.shop_phone)}</div>` : ""}
    ${s.vat_number ? `<div class="center muted">الرقم الضريبي: ${esc(s.vat_number)}</div>` : ""}
    <div class="title">${inv.vat > 0 ? "فاتورة ضريبية" : "فاتورة مبيعات"}${inv.status === "cancelled" ? " (ملغاة)" : ""}</div>
    <div class="meta">
      <span>رقم: <b>${esc(inv.number)}</b></span>
      <span>التاريخ: ${esc(inv.created_at)}</span>
      <span>العميل: ${esc(inv.customer_name)}</span>
      <span>النوع: ${CHANNELS[inv.channel]}</span>
    </div>
    <table>
      <thead><tr><th style="text-align:right">الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>المجموع</span><span>${money(inv.subtotal)}</span></div>
      ${inv.discount ? `<div><span>الخصم</span><span>- ${money(inv.discount)}</span></div>` : ""}
      ${inv.vat ? `<div><span>ضريبة القيمة المضافة ${inv.vat_rate}%</span><span>${money(inv.vat)}</span></div>` : ""}
      <div class="grand"><span>الإجمالي (ر.ع)</span><span>${money(inv.total)}</span></div>
      <div><span>طريقة الدفع</span><span>${METHODS[inv.payment_method]}</span></div>
      <div><span>المدفوع</span><span>${money(inv.paid)}</span></div>
      ${remaining > 0 && inv.status !== "cancelled" ? `<div><span>المتبقي</span><span>${money(remaining)}</span></div>` : ""}
    </div>
    ${s.receipt_footer ? `<div class="footer">${esc(s.receipt_footer)}</div>` : ""}
  </div></body></html>`;
}
async function renderWindow(html) {
	const win = new electron.BrowserWindow({
		show: false,
		width: 800,
		height: 1e3,
		webPreferences: { sandbox: true }
	});
	await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
	return win;
}
/** Thermal rolls have no fixed height: size the page to the rendered content. */
async function pageSizeFor(win, paper) {
	if (paper === "A4") return "A4";
	const heightPx = await win.webContents.executeJavaScript("document.querySelector(\".wrap\").scrollHeight");
	return {
		width: 8e4,
		height: Math.max(1e5, Math.ceil(heightPx * (25400 / 96)) + 1e4)
	};
}
async function printInvoice(id, opts = {}) {
	const settings = getSettings();
	const paper = opts.paper ?? settings.paper;
	const inv = getInvoice(id);
	const win = await renderWindow(receiptHtml(inv, settings, paper));
	try {
		const pageSize = await pageSizeFor(win, paper);
		if (opts.pdf) {
			const pdfSize = typeof pageSize === "string" ? pageSize : {
				width: pageSize.width / 25400,
				height: pageSize.height / 25400
			};
			const data = await win.webContents.printToPDF({
				pageSize: pdfSize,
				printBackground: true,
				margins: paper === "A4" ? {
					top: .5,
					bottom: .5,
					left: .5,
					right: .5
				} : {
					top: 0,
					bottom: 0,
					left: 0,
					right: 0
				}
			});
			const file = node_path.default.join(electron.app.getPath("temp"), `${inv.number}-${paper}.pdf`);
			node_fs.default.writeFileSync(file, data);
			await electron.shell.openPath(file);
			return {
				ok: true,
				file
			};
		}
		await new Promise((resolve, reject) => {
			win.webContents.print({
				silent: settings.silent_print,
				printBackground: true,
				deviceName: settings.printer_name || void 0,
				pageSize,
				margins: { marginType: "none" }
			}, (success, reason) => success || reason === "Print job canceled" || reason === "cancelled" ? resolve() : reject(/* @__PURE__ */ new Error(`فشلت الطباعة: ${reason}`)));
		});
		return { ok: true };
	} finally {
		win.destroy();
	}
}
async function listPrinters() {
	const win = electron.BrowserWindow.getAllWindows()[0];
	if (!win) return [];
	return (await win.webContents.getPrintersAsync()).map((p) => ({
		name: p.name,
		displayName: p.displayName || p.name
	}));
}
//#endregion
//#region electron/handlers.ts
var handlers = {
	...catalog_exports,
	...sales_exports,
	...purchases_exports,
	...treasury_exports,
	...reports_exports,
	getSettings,
	saveSettings,
	resetData,
	printInvoice,
	listPrinters,
	async saveCsv(defaultName, rows) {
		const win = electron.BrowserWindow.getFocusedWindow() ?? electron.BrowserWindow.getAllWindows()[0];
		const { canceled, filePath } = await electron.dialog.showSaveDialog(win, {
			defaultPath: defaultName,
			filters: [{
				name: "CSV (Excel)",
				extensions: ["csv"]
			}]
		});
		if (canceled || !filePath) return false;
		const cell = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, "\"\"")}"` : String(v);
		node_fs.default.writeFileSync(filePath, "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"), "utf8");
		return true;
	}
};
//#endregion
//#region electron/main.ts
process.env.APP_ROOT = node_path.default.join(__dirname, "..");
var DEV_URL = process.env.VITE_DEV_SERVER_URL;
function registerIpc() {
	for (const [name, fn] of Object.entries(handlers)) electron.ipcMain.handle(`api:${name}`, async (_e, ...args) => {
		try {
			return {
				ok: true,
				data: await fn(...args)
			};
		} catch (err) {
			console.error(`[api:${name}]`, err);
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	});
}
function createWindow() {
	const win = new electron.BrowserWindow({
		width: 1360,
		height: 860,
		minWidth: 1100,
		minHeight: 700,
		backgroundColor: "#0a1631",
		title: "Sales Inventory Pro",
		autoHideMenuBar: true,
		webPreferences: {
			preload: node_path.default.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	if (DEV_URL) win.loadURL(DEV_URL);
	else win.loadFile(node_path.default.join(process.env.APP_ROOT, "dist", "index.html"));
}
if (!electron.app.requestSingleInstanceLock()) electron.app.quit();
else {
	electron.app.on("second-instance", () => {
		const win = electron.BrowserWindow.getAllWindows()[0];
		if (win) {
			if (win.isMinimized()) win.restore();
			win.focus();
		}
	});
	electron.app.whenReady().then(() => {
		if (process.platform !== "darwin") electron.Menu.setApplicationMenu(null);
		openDb(node_path.default.join(electron.app.getPath("userData"), "store.db"));
		seedIfEmpty();
		registerIpc();
		createWindow();
		electron.app.on("activate", () => {
			if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});
	electron.app.on("window-all-closed", () => {
		if (process.platform !== "darwin") electron.app.quit();
	});
}
//#endregion
