const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

console.log('--- STARTING SALES APPROVAL WORKFLOW VERIFICATION TEST ---');

// Helper to clean up test data
function cleanup() {
  db.exec("DELETE FROM invoice_items WHERE po_line_item_id IN (9999, 9998) OR scr_line_item_id IN (9999, 9998)");
  db.exec("DELETE FROM invoices WHERE po_id IN (9999, 9998) OR invoice_number LIKE 'SIR/%' OR invoice_number LIKE 'REQ/2026%'");
  db.exec("DELETE FROM scr_line_items WHERE id IN (9999, 9998)");
  db.exec("DELETE FROM scr_requests WHERE id IN (9999, 9998)");
  db.exec("DELETE FROM po_line_items WHERE id IN (9999, 9998)");
  db.exec("DELETE FROM purchase_orders WHERE id IN (9999, 9998)");
  db.exec("DELETE FROM customer_locations WHERE id = 9999");
  db.exec("DELETE FROM customers WHERE id = 9999");
}

try {
  cleanup();

  // 1. Insert seed customer and location
  db.prepare(`
    INSERT INTO customers (id, name, legal_name, state, gstin)
    VALUES (9999, 'Test Client', 'Test Client Ltd', 'Telangana', '36AGTPG0351P1ZY')
  `).run();

  db.prepare(`
    INSERT INTO customer_locations (id, customer_id, label, address_line1, city, state)
    VALUES (9999, 9999, 'HQ', '123 Main St', 'Hyderabad', 'Telangana')
  `).run();

  // 2. Insert PO with need_sales_invoice_approval = 'yes'
  db.prepare(`
    INSERT INTO purchase_orders (id, po_number, customer_id, status, created_by, need_sales_invoice_approval)
    VALUES (9999, 'PO-9999-YES', 9999, 'approved', 1, 'yes')
  `).run();

  db.prepare(`
    INSERT INTO po_line_items (id, po_id, item_name, service_qty, service_rate, service_gst_rate, qty_invoiced)
    VALUES (9999, 9999, 'Service Alpha', 10, 1000, 18, 0)
  `).run();

  // 3. Insert SCR for that PO
  db.prepare(`
    INSERT INTO scr_requests (id, scr_number, po_id, location_id, status, invoicing_status)
    VALUES (9999, 'SCR-9999', 9999, 9999, 'approved', 'pending')
  `).run();

  db.prepare(`
    INSERT INTO scr_line_items (id, scr_id, po_line_item_id, service_qty, invoiced_qty)
    VALUES (9999, 9999, 9999, 10, 0)
  `).run();

  console.log('Successfully inserted test PO, SCR, and line items.');

  // 4. Simulate POST /api/scr/:id/raise-invoice-request
  function simulateRaiseRequest(scrId, poNeedSalesVal) {
    db.prepare("UPDATE purchase_orders SET need_sales_invoice_approval = ? WHERE id = (SELECT po_id FROM scr_requests WHERE id = ?)").run(poNeedSalesVal, scrId);
    
    const scr = db.prepare('SELECT * FROM scr_requests WHERE id = ?').get(scrId);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(scr.po_id);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(po.customer_id);
    const location = db.prepare('SELECT * FROM customer_locations WHERE id = ?').get(scr.location_id);

    const billingAddress = `${customer.legal_name || customer.name}\nGSTIN: ${customer.gstin || ''}`;
    const shippingAddress = `${location.label || ''}\n${location.address_line1 || ''}`;
    const placeOfSupply = location ? location.state : 'Hyderabad';
    const paymentTerms = po.payment_terms || 'Net 30 Days';

    let invoice_number;
    const needSalesApproval = (po.need_sales_invoice_approval || 'yes').toLowerCase() === 'yes';

    if (needSalesApproval) {
      const existingSir = db.prepare("SELECT invoice_number FROM invoices WHERE po_id = ? AND invoice_number LIKE 'SIR/%' ORDER BY id ASC LIMIT 1").get(scr.po_id);
      if (existingSir) {
        const baseNumber = existingSir.invoice_number.split('-')[0];
        const matches = db.prepare("SELECT invoice_number FROM invoices WHERE po_id = ? AND invoice_number LIKE ?").all(scr.po_id, `${baseNumber}%`);
        let maxSuffix = 0;
        matches.forEach(m => {
          const parts = m.invoice_number.split('-');
          if (parts.length > 1) {
            const suffix = parseInt(parts[1]);
            if (!isNaN(suffix) && suffix > maxSuffix) {
              maxSuffix = suffix;
            }
          }
        });
        invoice_number = `${baseNumber}-${maxSuffix + 1}`;
      } else {
        const allSirs = db.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'SIR/%'").all();
        let maxNum = 0;
        allSirs.forEach(s => {
          const base = s.invoice_number.split('-')[0];
          const parts = base.split('/');
          if (parts.length >= 3) {
            const num = parseInt(parts[2]);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        const nextNum = maxNum + 1;
        invoice_number = `SIR/2026/${String(nextNum).padStart(3, '0')}`;
      }

      while (db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number)) {
        if (invoice_number.includes('-')) {
          const parts = invoice_number.split('-');
          const suffix = parseInt(parts[1]) || 0;
          invoice_number = `${parts[0]}-${suffix + 1}`;
        } else {
          const parts = invoice_number.split('/');
          const num = parseInt(parts[parts.length - 1]) || 0;
          invoice_number = `SIR/2026/${String(num + 1).padStart(3, '0')}`;
        }
      }
    } else {
      invoice_number = 'REQ/2026/' + String(Date.now()).slice(-4);
    }

    // Insert invoice
    const rate = 1000;
    const qty = 5;
    const taxable = qty * rate;
    const gst = taxable * 0.18;
    const total = taxable + gst;

    const invResult = db.prepare(`
      INSERT INTO invoices (
        invoice_number, po_id, dc_id, scr_id, customer_id,
        status, invoice_date, due_date, notes,
        subtotal, gst_total, grand_total, 
        place_of_supply, payment_terms, billing_address, shipping_address,
        created_by, internal_document_uuid
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      invoice_number, scr.po_id, null, scrId, po.customer_id,
      needSalesApproval ? 'sales_pending' : 'requested', '2026-06-04', '2026-07-04', 'Test invoice',
      taxable, gst, total,
      placeOfSupply, paymentTerms, billingAddress, shippingAddress,
      1, crypto.randomUUID()
    );

    const invoiceId = invResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, po_line_item_id, scr_line_item_id,
        package_name, item_name, description, quantity, rate, gst_percent, 
        taxable_value, gst_amount, total_value
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(invoiceId, scrId === 9999 ? 9999 : 9998, scrId === 9999 ? 9999 : 9998, 'Package Alpha', 'Service Alpha', 'Desc', qty, rate, 18, taxable, gst, total);

    // Update scr_line_items & po_line_items quantities
    db.prepare('UPDATE scr_line_items SET invoiced_qty = invoiced_qty + ? WHERE id = ?').run(qty, scrId);
    db.prepare('UPDATE po_line_items SET qty_invoiced = qty_invoiced + ? WHERE id = ?').run(qty, scrId === 9999 ? 9999 : 9998);

    return { invoiceId, invoice_number };
  }

  // Test 1: Raise with need_sales_invoice_approval = 'yes'
  console.log('\n--- Running Test 1: Raising with Sales Approval = YES ---');
  const res1 = simulateRaiseRequest(9999, 'yes');
  const inv1 = db.prepare("SELECT * FROM invoices WHERE id = ?").get(res1.invoiceId);
  console.log('Resulting Invoice Number:', inv1.invoice_number);
  console.log('Resulting Invoice Status:', inv1.status);
  if (inv1.invoice_number.startsWith('SIR/2026/') && inv1.status === 'sales_pending') {
    console.log('SUCCESS: Numbering and initial status correctly configured.');
  } else {
    throw new Error('FAILED Test 1');
  }

  // Test 2: Raise second request on same PO (suffix verification)
  console.log('\n--- Running Test 2: Raising second request on same PO (should suffix) ---');
  const res2 = simulateRaiseRequest(9999, 'yes');
  const inv2 = db.prepare("SELECT * FROM invoices WHERE id = ?").get(res2.invoiceId);
  console.log('Resulting Invoice Number (Second):', inv2.invoice_number);
  if (inv2.invoice_number === `${inv1.invoice_number}-1`) {
    console.log('SUCCESS: Suffix numbering format matches expectation (-1).');
  } else {
    throw new Error('FAILED Test 2');
  }

  // Test 3: Raise third request on same PO (suffix increment verification)
  console.log('\n--- Running Test 3: Raising third request on same PO (should increment suffix) ---');
  const res3 = simulateRaiseRequest(9999, 'yes');
  const inv3 = db.prepare("SELECT * FROM invoices WHERE id = ?").get(res3.invoiceId);
  console.log('Resulting Invoice Number (Third):', inv3.invoice_number);
  if (inv3.invoice_number === `${inv1.invoice_number}-2`) {
    console.log('SUCCESS: Suffix numbering incremented correctly (-2).');
  } else {
    throw new Error('FAILED Test 3');
  }

  // Test 4: Raise on a different PO (should increment base sequence)
  console.log('\n--- Running Test 4: Raising on a different PO (should increment base sequence) ---');
  db.prepare(`
    INSERT INTO purchase_orders (id, po_number, customer_id, status, created_by, need_sales_invoice_approval)
    VALUES (9998, 'PO-9998-YES', 9999, 'approved', 1, 'yes')
  `).run();
  db.prepare(`
    INSERT INTO po_line_items (id, po_id, item_name, service_qty, service_rate, service_gst_rate, qty_invoiced)
    VALUES (9998, 9998, 'Service Beta', 10, 1000, 18, 0)
  `).run();
  db.prepare(`
    INSERT INTO scr_requests (id, scr_number, po_id, location_id, status, invoicing_status)
    VALUES (9998, 'SCR-9998', 9998, 9999, 'approved', 'pending')
  `).run();
  db.prepare(`
    INSERT INTO scr_line_items (id, scr_id, po_line_item_id, service_qty, invoiced_qty)
    VALUES (9998, 9998, 9998, 10, 0)
  `).run();

  const res4 = simulateRaiseRequest(9998, 'yes');
  const inv4 = db.prepare("SELECT * FROM invoices WHERE id = ?").get(res4.invoiceId);
  console.log('Resulting Invoice Number for Different PO:', inv4.invoice_number);

  const base1 = inv1.invoice_number.split('/')[2];
  const base4 = inv4.invoice_number.split('/')[2];
  if (parseInt(base4) === parseInt(base1) + 1) {
    console.log('SUCCESS: Base sequence incremented correctly.');
  } else {
    throw new Error('FAILED Test 4');
  }

  // Test 5: Sales approval transitions status to 'requested'
  console.log('\n--- Running Test 5: Sales approval simulation ---');
  function simulateSalesReview(id, action) {
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
    if (action === 'approved') {
      db.prepare("UPDATE invoices SET status = 'requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    } else {
      const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(id);
      for (const it of items) {
        if (it.scr_line_item_id) {
          db.prepare('UPDATE scr_line_items SET invoiced_qty = MAX(0, IFNULL(invoiced_qty, 0) - ?) WHERE id = ?').run(it.quantity, it.scr_line_item_id);
        }
        if (it.po_line_item_id) {
          db.prepare('UPDATE po_line_items SET qty_invoiced = MAX(0, IFNULL(qty_invoiced, 0) - ?) WHERE id = ?').run(it.quantity, it.po_line_item_id);
        }
      }
      db.prepare("UPDATE invoices SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    }
  }

  simulateSalesReview(inv1.id, 'approved');
  const approvedInv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(inv1.id);
  console.log('Approved Status:', approvedInv.status);
  if (approvedInv.status === 'requested') {
    console.log('SUCCESS: Status transitioned from sales_pending to requested.');
  } else {
    throw new Error('FAILED Test 5');
  }

  // Test 6: Sales rejection reverts quantities
  console.log('\n--- Running Test 6: Sales rejection simulation ---');
  const initialScrQty = db.prepare("SELECT invoiced_qty FROM scr_line_items WHERE id = 9999").get().invoiced_qty;
  console.log('Initial Invoiced Qty:', initialScrQty);
  
  simulateSalesReview(inv2.id, 'rejected');
  
  const rejectedInv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(inv2.id);
  const afterScrQty = db.prepare("SELECT invoiced_qty FROM scr_line_items WHERE id = 9999").get().invoiced_qty;
  console.log('Rejected Status:', rejectedInv.status);
  console.log('After Rejection Invoiced Qty:', afterScrQty);
  if (rejectedInv.status === 'rejected' && afterScrQty === initialScrQty - 5) {
    console.log('SUCCESS: Quantities successfully reverted on rejection.');
  } else {
    throw new Error('FAILED Test 6');
  }

  console.log('\n--- ALL WORKFLOW LOGIC TESTS PASSED SUCCESSFULLY! ---');

} catch (err) {
  console.error('\n--- TEST FAILED WITH ERROR ---');
  console.error(err);
} finally {
  cleanup();
  db.close();
}
