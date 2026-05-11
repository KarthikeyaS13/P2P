const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

const id = 14;

try {
    db.exec('BEGIN');
    const allInvs = db.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'INV/%'").all();
    let maxNum = 0;
    allInvs.forEach(inv => {
      const parts = inv.invoice_number.split('/');
      const numPart = parts[parts.length - 1];
      const n = parseInt(numPart);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });

    let nextNum = maxNum + 1;
    let invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;

    console.log('Calculated initial:', invoice_number);

    while (db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number)) {
      nextNum++;
      invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;
    }
    
    console.log('Final to use:', invoice_number);

    const info = db.prepare("UPDATE invoices SET invoice_number = ?, status = 'raised', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice_number, id);
    console.log('Update success:', info);
    
    db.exec('COMMIT');
} catch (err) {
    console.error('FAILED:', err.message);
    if (db.inTransaction) db.exec('ROLLBACK');
}
