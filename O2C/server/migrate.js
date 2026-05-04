/**
 * migrate.js — Run once to add all missing tables/columns
 * node server/migrate.js
 */
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('foreign_keys = OFF');

function tryAlter(sql) {
  try { db.exec(sql); console.log('OK:', sql.substring(0, 60)); }
  catch (e) { console.log('SKIP (exists):', sql.substring(20, 60)); }
}

// po_line_items — add missing spec columns
tryAlter('ALTER TABLE po_line_items ADD COLUMN gst_percent REAL DEFAULT 0');
tryAlter('ALTER TABLE po_line_items ADD COLUMN taxable_value REAL DEFAULT 0');
tryAlter('ALTER TABLE po_line_items ADD COLUMN total_value REAL DEFAULT 0');
tryAlter('ALTER TABLE po_line_items ADD COLUMN description TEXT');
tryAlter('ALTER TABLE po_line_items ADD COLUMN package_name TEXT');

// Migrate existing po_line_items data to new columns
db.exec(`UPDATE po_line_items SET
  gst_percent   = COALESCE(gst_rate, 0),
  taxable_value = COALESCE(value / 100.0, 0),
  total_value   = COALESCE((value + gst_amount) / 100.0, 0),
  description   = item_description,
  package_name  = package
WHERE gst_percent = 0`);

// purchase_orders — add missing spec columns
tryAlter('ALTER TABLE purchase_orders ADD COLUMN end_date DATE');
// Migrate: subtotal from total_value (old paise storage)
db.exec(`UPDATE purchase_orders SET subtotal = total_value / 100.0 WHERE subtotal = 0 AND total_value > 0`);

// Create delivery_challans
db.exec(`CREATE TABLE IF NOT EXISTS delivery_challans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_number       TEXT UNIQUE NOT NULL,
  po_id           INTEGER REFERENCES purchase_orders(id),
  customer_id     INTEGER REFERENCES customers(id),
  location_id     INTEGER REFERENCES customer_locations(id),
  status          TEXT DEFAULT 'draft',
  dc_date         DATE,
  dispatch_date   DATE,
  vehicle_number  TEXT,
  driver_name     TEXT,
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create dc_line_items
db.exec(`CREATE TABLE IF NOT EXISTS dc_line_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_id               INTEGER REFERENCES delivery_challans(id),
  po_line_item_id     INTEGER REFERENCES po_line_items(id),
  item_name           TEXT,
  description         TEXT,
  quantity_dispatched REAL DEFAULT 0,
  uom                 TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create invoices
db.exec(`CREATE TABLE IF NOT EXISTS invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number  TEXT UNIQUE NOT NULL,
  po_id           INTEGER REFERENCES purchase_orders(id),
  dc_id           INTEGER REFERENCES delivery_challans(id),
  customer_id     INTEGER REFERENCES customers(id),
  status          TEXT DEFAULT 'draft',
  invoice_date    DATE,
  subtotal        REAL DEFAULT 0,
  gst_total       REAL DEFAULT 0,
  grand_total     REAL DEFAULT 0,
  due_date        DATE,
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create invoice_line_items
db.exec(`CREATE TABLE IF NOT EXISTS invoice_line_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id      INTEGER REFERENCES invoices(id),
  po_line_item_id INTEGER REFERENCES po_line_items(id),
  dc_line_item_id INTEGER REFERENCES dc_line_items(id),
  item_name       TEXT,
  quantity        REAL DEFAULT 0,
  rate_per_unit   REAL DEFAULT 0,
  gst_percent     REAL DEFAULT 0,
  taxable_value   REAL DEFAULT 0,
  gst_amount      REAL DEFAULT 0,
  total_value     REAL DEFAULT 0
)`);

// Create ar_entries
db.exec(`CREATE TABLE IF NOT EXISTS ar_entries (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id         INTEGER REFERENCES invoices(id),
  po_id              INTEGER REFERENCES purchase_orders(id),
  customer_id        INTEGER REFERENCES customers(id),
  amount_due         REAL DEFAULT 0,
  amount_received    REAL DEFAULT 0,
  balance            REAL DEFAULT 0,
  payment_date       DATE,
  payment_reference  TEXT,
  status             TEXT DEFAULT 'pending',
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create audit_log (spec table — separate from audit_logs)
db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  module     TEXT NOT NULL,
  record_id  INTEGER,
  details    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Seed additional users (stores, accounts, management) with bcrypt passwords
const hash = bcrypt.hashSync('password123', 10);
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, full_name, email, password_hash) VALUES (?, ?, ?, ?)');
const getRole   = db.prepare('SELECT id FROM roles WHERE name = ?');
const assignRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');

const newUsers = [
  { user: 'stores1',     name: 'Bob Stores',      email: 'stores@o2c.local',     role: 'stores' },
  { user: 'accounts1',   name: 'Jane Accounts',   email: 'accounts@o2c.local',   role: 'accounts' },
  { user: 'mgmt1',       name: 'Tom Management',  email: 'mgmt@o2c.local',       role: 'management' },
  { user: 'audit1',      name: 'Audit User',      email: 'audit@o2c.local',      role: 'auditor' },
];

// Ensure roles exist
['stores', 'accounts', 'management', 'auditor', 'projects'].forEach(r => {
  try { db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)').run(r); } catch(e) {}
});

newUsers.forEach(u => {
  const res = insertUser.run(u.user, u.name, u.email, hash);
  if (res.changes > 0) {
    const roleRow = getRole.get(u.role);
    if (roleRow) assignRole.run(res.lastInsertRowid, roleRow.id);
    console.log('Seeded user:', u.user);
  }
});

// Update existing users with proper bcrypt hashes (old ones used 'hashed_password_mock')
db.prepare(`UPDATE users SET password_hash = ? WHERE password_hash = 'hashed_password_mock'`).run(hash);

db.pragma('foreign_keys = ON');
console.log('\n✅ Migration complete!');
db.close();
