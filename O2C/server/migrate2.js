const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('foreign_keys = OFF');

// Drop existing empty tables that don't match the new schema
db.exec('DROP TABLE IF EXISTS delivery_challans');
db.exec('DROP TABLE IF EXISTS dc_line_items');
db.exec('DROP TABLE IF EXISTS invoices');
db.exec('DROP TABLE IF EXISTS invoice_line_items');
db.exec('DROP TABLE IF EXISTS ar_entries');

// Recreate them exactly as per the spec
db.exec(`CREATE TABLE IF NOT EXISTS delivery_challans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_number TEXT UNIQUE NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  customer_id INTEGER REFERENCES customers(id),
  location_id INTEGER REFERENCES locations(id),
  status TEXT DEFAULT 'draft',
  dc_date DATE,
  dispatch_date DATE,
  vehicle_number TEXT,
  driver_name TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS dc_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_id INTEGER REFERENCES delivery_challans(id),
  po_line_item_id INTEGER REFERENCES po_line_items(id),
  item_name TEXT,
  description TEXT,
  quantity_dispatched REAL DEFAULT 0,
  uom TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  dc_id INTEGER REFERENCES delivery_challans(id),
  customer_id INTEGER REFERENCES customers(id),
  status TEXT DEFAULT 'draft',
  invoice_date DATE,
  subtotal REAL DEFAULT 0,
  gst_total REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  due_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS ar_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  customer_id INTEGER REFERENCES customers(id),
  amount_due REAL DEFAULT 0,
  amount_received REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  payment_date DATE,
  payment_reference TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.pragma('foreign_keys = ON');
console.log('Migration 2 complete');
db.close();
