const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

try {
    console.log('Starting backfill for invoice_items...');
    
    // Check if columns exist (they should after migrations run, but let's be sure)
    const tableInfo = db.prepare("PRAGMA table_info(invoice_items)").all();
    const hasPackage = tableInfo.some(c => c.name === 'package_name');
    const hasDesc = tableInfo.some(c => c.name === 'description');
    
    if (!hasPackage || !hasDesc) {
        console.log('Columns missing. Adding them...');
        if (!hasPackage) db.prepare("ALTER TABLE invoice_items ADD COLUMN package_name TEXT").run();
        if (!hasDesc) db.prepare("ALTER TABLE invoice_items ADD COLUMN description TEXT").run();
    }

    // Backfill from po_line_items
    const result = db.prepare(`
        UPDATE invoice_items
        SET 
            package_name = (SELECT package_name FROM po_line_items WHERE id = invoice_items.po_line_item_id),
            description = (SELECT description FROM po_line_items WHERE id = invoice_items.po_line_item_id)
        WHERE package_name IS NULL OR description IS NULL
    `).run();

    console.log(`Backfill completed. Updated ${result.changes} rows.`);

} catch (err) {
    console.error('Backfill failed:', err.message);
} finally {
    db.close();
}
