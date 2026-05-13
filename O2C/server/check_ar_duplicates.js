const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

const arEntries = db.prepare('SELECT * FROM ar_entries').all();
console.log('AR Entries:');
console.table(arEntries);

const invoices = db.prepare('SELECT id, invoice_number FROM invoices').all();
console.log('\nInvoices:');
console.table(invoices);
