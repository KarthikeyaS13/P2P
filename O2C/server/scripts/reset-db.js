const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('Opening database at:', dbPath);

const db = new Database(dbPath);

try {
  console.log('Disabling foreign keys temporarily...');
  db.pragma('foreign_keys = OFF');

  db.transaction(() => {
    console.log('Clearing transactional tables...');
    db.prepare('DELETE FROM ar_payments').run();
    db.prepare('DELETE FROM ar_receipts').run();
    db.prepare('DELETE FROM ar_entries').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoice_request_dcs').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM invoice_requests').run();
    db.prepare('DELETE FROM dc_line_items').run();
    db.prepare('DELETE FROM delivery_challans').run();
    db.prepare('DELETE FROM dc_request_items').run();
    db.prepare('DELETE FROM dc_requests').run();
    db.prepare('DELETE FROM po_version_history').run();
    db.prepare('DELETE FROM po_line_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM customer_locations').run();
    db.prepare('DELETE FROM customers').run();
    db.prepare('DELETE FROM audit_logs').run();
    db.prepare('DELETE FROM master_addresses').run();
    db.prepare('DELETE FROM global_settings').run();
    try { db.prepare('DELETE FROM enterprise_audit_trail').run(); } catch(e){}

    console.log('Resetting sequence counters...');
    const tablesToReset = [
      'ar_payments', 'ar_receipts', 'ar_entries', 'invoice_items', 'invoices', 
      'invoice_requests', 'dc_line_items', 'delivery_challans', 'dc_request_items', 
      'dc_requests', 'po_version_history', 'po_line_items', 'purchase_orders', 
      'customer_locations', 'customers', 'audit_logs', 'enterprise_audit_trail',
      'master_addresses'
    ];
    
    for (const table of tablesToReset) {
      db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
    }
  })();

  console.log('Re-enabling foreign keys...');
  db.pragma('foreign_keys = ON');
  
  console.log('Running VACUUM...');
  db.prepare('VACUUM').run();
  
  console.log('DATABASE RESET SUCCESSFUL!');

} catch (err) {
  console.error('DATABASE RESET FAILED:', err);
} finally {
  db.close();
}

// 2. Clear Uploaded Files
const uploadsDir = path.join(__dirname, '..', 'uploads');
const signedPdfsDir = path.join(uploadsDir, 'signed-pdfs');

console.log('Clearing uploads directory...');

function clearDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      clearDirectoryContents(filePath);
    } else {
      fs.unlinkSync(filePath);
      console.log(`Deleted file: ${filePath}`);
    }
  }
}

try {
  // Clear files directly in uploads (except the signed-pdfs directory)
  if (fs.existsSync(uploadsDir)) {
    const items = fs.readdirSync(uploadsDir);
    for (const item of items) {
      if (item === 'signed-pdfs') continue;
      const itemPath = path.join(uploadsDir, item);
      const stat = fs.statSync(itemPath);
      if (!stat.isDirectory()) {
        fs.unlinkSync(itemPath);
        console.log(`Deleted upload file: ${itemPath}`);
      }
    }
  }

  // Clear signed PDFs
  clearDirectoryContents(signedPdfsDir);
  console.log('UPLOADS CLEANUP SUCCESSFUL!');
} catch (uploadErr) {
  console.error('UPLOADS CLEANUP FAILED:', uploadErr);
}
