const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');
const tables = [
  'purchase_orders',
  'po_line_items',
  'delivery_challans',
  'dc_line_items',
  'invoices',
  'invoice_items'
];
for (const t of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    /* console.log(`Table ${t} (${rows.length} rows):`, rows.slice(0, 5)); */
  } catch (err) {
    /* console.error(`Error reading table ${t}:`, err.message); */
  }
}
