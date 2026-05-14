const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

try {
    const invoiceId = 10;
    const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(invoiceId);
    console.log('Items for Invoice 10:');
    console.log(JSON.stringify(items, null, 2));

    const poItems = db.prepare("SELECT id, package, item_name, item_description FROM po_line_items").all();
    console.log('\nSample PO Items:');
    console.log(JSON.stringify(poItems.slice(0, 5), null, 2));

} catch (err) {
    console.error(err);
} finally {
    db.close();
}
