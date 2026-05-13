const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

try {
    db.exec('BEGIN');
    
    // Find duplicates
    const duplicates = db.prepare(`
        SELECT invoice_id, MIN(id) as keep_id
        FROM ar_entries
        GROUP BY invoice_id
        HAVING COUNT(*) > 1
    `).all();

    console.log(`Found ${duplicates.length} invoices with duplicate AR entries.`);

    for (const dup of duplicates) {
        const deleted = db.prepare('DELETE FROM ar_entries WHERE invoice_id = ? AND id != ?').run(dup.invoice_id, dup.keep_id);
        console.log(`Invoice ID ${dup.invoice_id}: Deleted ${deleted.changes} duplicate(s), kept AR Entry ID ${dup.keep_id}`);
    }

    db.exec('COMMIT');
    console.log('Database cleanup completed successfully.');
} catch (err) {
    db.exec('ROLLBACK');
    console.error('Cleanup failed:', err.message);
}
