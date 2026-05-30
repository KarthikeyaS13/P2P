const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign keys
db.pragma('foreign_keys = ON');

// 1. Define auditLog helper mock so autoGenerateInvoiceForDC runs successfully
global.auditLog = function(username, action, entity, id, oldVal, newVal) {
  /* console.log(`[AUDIT LOG] ${username} ${action} ${entity} #${id}`, newVal); */
};

global.generateInvoiceHash = function(invoice) {
  const dataToHash = {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    po_no: invoice.po_no || '',
    subtotal: invoice.subtotal,
    gst_total: invoice.gst_total,
    grand_total: invoice.grand_total,
    items: (invoice.items || []).map(it => ({
      item_name: it.item_name,
      quantity: it.quantity,
      rate: it.rate,
      gst_percent: it.gst_percent,
      taxable_value: it.taxable_value,
      gst_amount: it.gst_amount,
      total_value: it.total_value
    })),
    signed_by: invoice.signed_by || '',
    signed_at: invoice.signed_at || new Date().toISOString()
  };
  return crypto.createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
};

// Import our helper from server.js
// Since server.js is a script, we'll extract autoGenerateInvoiceForDC or just define it here exactly as in server.js to test it perfectly against the database.

const fs = require('fs');
const serverContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// Use eval/Function to inject or recreate the exact same autoGenerateInvoiceForDC helper
const autoGenerateInvoiceForDC = new Function('dcId', 'po', 'createdByUserId', 'username', 'db', 'crypto', 'generateInvoiceHash', 'auditLog', `
  ${serverContent.match(/function autoGenerateInvoiceForDC[\s\S]*?\n\}/)[0]}
  return autoGenerateInvoiceForDC(dcId, po, createdByUserId, username);
`);

async function runTests() {
  /* console.log('--- STARTING AUTO-INVOICE SYSTEM TESTS ---'); */

  db.exec('BEGIN');

  try {
    // A. Seed unique test customer & location
    const testSuffix = Date.now();
    const custResult = db.prepare(`
      INSERT INTO customers (cust_code, name, legal_name, gstin, email, phone, state, city, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `CUST-${testSuffix}`,
      'Test Corp',
      'Test Corp India Ltd',
      '36ABCDE1234F1Z1',
      'test@corp.com',
      '9876543210',
      'Telangana',
      'Hyderabad',
      '500037'
    );
    const customerId = custResult.lastInsertRowid;

    const locResult = db.prepare(`
      INSERT INTO customer_locations (customer_id, label, address_line1, address_line2, city, state, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      'Site Bangalore',
      '44 Phase 2',
      'Electronic City',
      'Bangalore',
      'Karnataka',
      '560100'
    );
    const locationId = locResult.lastInsertRowid;

    // B. Create PO with need_sales_invoice_approval = 'no' (Generate Invoice Automatically = NO)
    const poResult = db.prepare(`
      INSERT INTO purchase_orders (
        order_id, customer_id, location_id, po_number, po_date, total_value, gst_total, grand_total, need_sales_invoice_approval, status
      ) VALUES (?, ?, ?, ?, '2026-05-26', 10000, 1800, 11800, 'yes', 'accepted')
    `).run(
      `PO-${testSuffix}`,
      customerId,
      locationId,
      `PO-NO-AUTO-${testSuffix}`
    );
    const poId = poResult.lastInsertRowid;
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);

    // C. Create PO line item
    const poItemResult = db.prepare(`
      INSERT INTO po_line_items (
        po_id, line_number, item_name, quantity, rate_per_unit, value, gst_rate, gst_amount, package_name, description, supply_qty, supply_rate, supply_gst_rate
      ) VALUES (?, 1, 'Premium Widget', 10, 1000, 10000, 18, 1800, 'Gold Pack', 'Premium Widget description', 10, 1000, 18)
    `).run(poId);
    const poItemId = poItemResult.lastInsertRowid;

    // D. Create DC & DC line item
    const dcResult = db.prepare(`
      INSERT INTO delivery_challans (
        dc_number, po_id, customer_id, customer_location_id, status, dispatch_date, created_by
      ) VALUES (?, ?, ?, ?, 'raised', '2026-05-26', 1)
    `).run(
      `DC-${testSuffix}`,
      poId,
      customerId,
      locationId
    );
    const dcId = dcResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO dc_line_items (
        dc_id, po_line_item_id, item_name, description, quantity_dispatched, uom, hsn
      ) VALUES (?, ?, 'Premium Widget', 'Premium Widget description', 5, 'PCS', '9876-54-32')
    `).run(
      dcId,
      poItemId
    );

    // E. Execute autoGenerateInvoiceForDC
    /* console.log('Running autoGenerateInvoiceForDC for the first time...'); */
    autoGenerateInvoiceForDC(dcId, po, 1, 'accounts_test', db, crypto, global.generateInvoiceHash, global.auditLog);

    // F. Validate generated invoice in database
    const invoice = db.prepare('SELECT * FROM invoices WHERE dc_id = ?').get(dcId);
    if (!invoice) {
      throw new Error('Invoice was NOT generated for the DC!');
    }

    /* console.log('SUCCESS: Invoice generated successfully!', invoice); */

    // Assertions
    if (invoice.status !== 'requested') {
      throw new Error(`Expected invoice status to be 'requested', but got '${invoice.status}'`);
    }
    /* console.log(`Assertion Passed: Invoice status is 'requested'`); */

    if (!invoice.invoice_number.startsWith('REQ/2026/')) {
      throw new Error(`Expected invoice_number to start with 'REQ/2026/', but got '${invoice.invoice_number}'`);
    }
    /* console.log(`Assertion Passed: Invoice number matches format REQ/2026/XXXX`); */

    if (invoice.place_of_supply !== 'Karnataka') {
      throw new Error(`Expected place_of_supply to match location state 'Karnataka', but got '${invoice.place_of_supply}'`);
    }
    /* console.log(`Assertion Passed: Place of Supply is correctly mapped to Location State: 'Karnataka'`); */

    // Financial calculations assertion (5 items dispatched at supply_rate of 1000 each = 5000 subtotal, 900 gst @18%, 5900 grand_total)
    if (invoice.subtotal !== 5000 || invoice.gst_total !== 900 || invoice.grand_total !== 5900) {
      throw new Error(`Financial mismatch! Subtotal: ${invoice.subtotal}, GST: ${invoice.gst_total}, Grand Total: ${invoice.grand_total}`);
    }
    /* console.log(`Assertion Passed: Calculations are correct. Subtotal = 5000, GST = 900, Grand Total = 5900`); */

    // Verify invoice items insertion
    const invoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
    if (invoiceItems.length !== 1) {
      throw new Error(`Expected exactly 1 invoice item, but got ${invoiceItems.length}`);
    }
    const invItem = invoiceItems[0];
    if (invItem.quantity !== 5 || invItem.rate !== 1000 || invItem.gst_percent !== 18 || invItem.taxable_value !== 5000 || invItem.gst_amount !== 900 || invItem.total_value !== 5900) {
      throw new Error(`Invoice item financial mismatch!`, invItem);
    }
    /* console.log(`Assertion Passed: Invoice line item is correctly populated`, invItem); */

    // G. Test Idempotency (Duplicate Prevention)
    /* console.log('Running autoGenerateInvoiceForDC a second time to test idempotency...'); */
    autoGenerateInvoiceForDC(dcId, po, 1, 'accounts_test', db, crypto, global.generateInvoiceHash, global.auditLog);

    const invoicesCount = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE dc_id = ?').get(dcId).count;
    if (invoicesCount !== 1) {
      throw new Error(`Duplicate invoices created! Count is ${invoicesCount}`);
    }
    /* console.log(`Assertion Passed: Idempotency check verified. No duplicate invoices created.`); */

  } finally {
    // Rollback test changes to preserve database clean state
    db.exec('ROLLBACK');
    db.close();
    /* console.log('--- TEST TRANSACTION ROLLBACKED AND DATABASE CLOSED ---'); */
  }
}

runTests().catch(err => {
  /* console.error('TEST FAILED:', err); */
  process.exit(1);
});
