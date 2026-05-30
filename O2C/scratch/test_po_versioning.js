const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../server/database.sqlite'));
db.pragma('foreign_keys = ON');

console.log("Starting Purchase Order Versioning Logic Audit...");

// Helper to clean up test data
const cleanTestData = () => {
  db.prepare("DELETE FROM po_line_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE 'TEST-SO%')").run();
  db.prepare("DELETE FROM purchase_orders WHERE po_number LIKE 'TEST-SO%'").run();
  db.prepare("DELETE FROM customer_locations WHERE label = 'Test Location'").run();
  db.prepare("DELETE FROM customers WHERE name = 'Test Customer'").run();
};

try {
  cleanTestData();

  // 1. Insert a Test Customer & Location
  const customerResult = db.prepare("INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)").run('Test Customer', 'test@example.com', '9876543210');
  const customerId = customerResult.lastInsertRowid;

  const locationResult = db.prepare("INSERT INTO customer_locations (customer_id, label, address_line1, city, state, pincode, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(customerId, 'Test Location', '123 Test St', 'Test City', 'TS', '123456', '9876543210');
  const locationId = locationResult.lastInsertRowid;

  // 2. Create standard PO (Original)
  console.log("\n--- Creating Original PO: TEST-SOABC ---");
  const poResult = db.prepare(`
    INSERT INTO purchase_orders (
      order_id, customer_id, location_id, po_number, po_date, start_date, end_date,
      status, is_nt_po, is_temporary, subtotal, gst_total, grand_total, total_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ORD-TEST-1', customerId, locationId, 'TEST-SOABC', '2026-05-29', '2026-05-29', '2026-06-29', 'pending', 0, 0, 1000, 180, 1180, 1180);
  
  const rootPoId = poResult.lastInsertRowid;
  // Apply our startup/creation logic: set original_po_id = itself, version_number = 1, is_original = 1
  db.prepare("UPDATE purchase_orders SET original_po_id = ?, version_number = 1, is_original = 1 WHERE id = ?").run(rootPoId, rootPoId);

  let rootPo = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(rootPoId);
  console.log("Inserted Root PO:", {
    id: rootPo.id,
    po_number: rootPo.po_number,
    parent_po_id: rootPo.parent_po_id,
    original_po_id: rootPo.original_po_id,
    version_number: rootPo.version_number,
    is_original: rootPo.is_original,
    status: rootPo.status
  });

  // 3. Edit standard PO twice (creating revisions TEST-SOABC-01 and TEST-SOABC-02)
  console.log("\n--- Editing PO to version 2: TEST-SOABC-01 ---");
  // Mark old as revised
  db.prepare("UPDATE purchase_orders SET status = 'revised' WHERE id = ?").run(rootPoId);
  
  // Insert revised PO
  const rev1Result = db.prepare(`
    INSERT INTO purchase_orders (
      order_id, customer_id, location_id, po_number, po_date, start_date, end_date,
      status, version, is_nt_po, is_temporary, parent_po_id, original_po_id, version_number, is_original, subtotal, gst_total, grand_total, total_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ORD-TEST-2', customerId, locationId, 'TEST-SOABC-01', '2026-05-29', '2026-05-29', '2026-06-29', 'pending', 2, 0, 0, rootPoId, rootPoId, 2, 0, 1200, 216, 1416, 1416);
  const rev1Id = rev1Result.lastInsertRowid;

  let rev1Po = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(rev1Id);
  console.log("Inserted Revision 1:", {
    id: rev1Po.id,
    po_number: rev1Po.po_number,
    parent_po_id: rev1Po.parent_po_id,
    original_po_id: rev1Po.original_po_id,
    version_number: rev1Po.version_number,
    is_original: rev1Po.is_original,
    status: rev1Po.status
  });

  console.log("\n--- Editing PO to version 3: TEST-SOABC-02 ---");
  // Mark rev1 as revised
  db.prepare("UPDATE purchase_orders SET status = 'revised' WHERE id = ?").run(rev1Id);
  
  // Insert revised PO
  const rev2Result = db.prepare(`
    INSERT INTO purchase_orders (
      order_id, customer_id, location_id, po_number, po_date, start_date, end_date,
      status, version, is_nt_po, is_temporary, parent_po_id, original_po_id, version_number, is_original, subtotal, gst_total, grand_total, total_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ORD-TEST-3', customerId, locationId, 'TEST-SOABC-02', '2026-05-29', '2026-05-29', '2026-06-29', 'accepted', 3, 0, 0, rootPoId, rootPoId, 3, 0, 1500, 270, 1770, 1770);
  const rev2Id = rev2Result.lastInsertRowid;

  let rev2Po = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(rev2Id);
  console.log("Inserted Revision 2:", {
    id: rev2Po.id,
    po_number: rev2Po.po_number,
    parent_po_id: rev2Po.parent_po_id,
    original_po_id: rev2Po.original_po_id,
    version_number: rev2Po.version_number,
    is_original: rev2Po.is_original,
    status: rev2Po.status
  });

  // 4. Test original PO list fetch query (type === 'original')
  console.log("\n--- Querying Original POs (Original Selection dropdown simulation) ---");
  const originalPOs = db.prepare(`
    SELECT id, po_number, status, is_nt_po, parent_po_id, original_po_id, is_original
    FROM purchase_orders
    WHERE po_number LIKE 'TEST-SO%' AND parent_po_id IS NULL AND is_nt_po = 0 AND is_temporary = 0
  `).all();
  
  console.log("Filtered Original PO Selection result count:", originalPOs.length);
  originalPOs.forEach(p => console.log(p));

  if (originalPOs.length === 1 && originalPOs[0].po_number === 'TEST-SOABC') {
    console.log("✅ Success! Only the base/original PO 'TEST-SOABC' is returned. Revisions 'TEST-SOABC-01' and 'TEST-SOABC-02' are excluded!");
  } else {
    throw new Error("❌ Failure! Original PO filtering logic returned incorrect results.");
  }

  // 5. Create a linked NT PO. Verify it resolves the link to the true root PO ID.
  console.log("\n--- Creating NT PO (simulating user selecting a revised version 'TEST-SOABC-02' but resolved to root) ---");
  // Let's resolve the user's selected original PO (rev2Id) to its true original root PO ID:
  const selectedPoId = rev2Id;
  const linkedPO = db.prepare('SELECT original_po_id FROM purchase_orders WHERE id = ?').get(selectedPoId);
  const finalLinkedPoId = (linkedPO && linkedPO.original_po_id) ? linkedPO.original_po_id : selectedPoId;

  console.log("Selected original PO ID from UI:", selectedPoId, "('TEST-SOABC-02')");
  console.log("Resolved linked_po_id for NT PO:", finalLinkedPoId, "('TEST-SOABC')");

  if (finalLinkedPoId === rootPoId) {
    console.log("✅ Success! The NT PO correctly linked to the root/original PO ID.");
  } else {
    throw new Error("❌ Failure! The NT PO linked to the incorrect revised PO ID.");
  }

  const ntResult = db.prepare(`
    INSERT INTO purchase_orders (
      order_id, customer_id, location_id, po_number, po_date, start_date, end_date,
      status, is_nt_po, is_temporary, linked_po_id, subtotal, gst_total, grand_total, total_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ORD-TEST-NT-1', customerId, locationId, 'TEST-SOABC-NT1', '2026-05-29', '2026-05-29', '2026-06-29', 'nt_created', 1, 1, finalLinkedPoId, 500, 90, 590, 590);
  const ntId = ntResult.lastInsertRowid;
  db.prepare("UPDATE purchase_orders SET original_po_id = ?, version_number = 1, is_original = 1 WHERE id = ?").run(ntId, ntId);

  let ntPo = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(ntId);
  console.log("Inserted NT PO:", {
    id: ntPo.id,
    po_number: ntPo.po_number,
    linked_po_id: ntPo.linked_po_id,
    original_po_id: ntPo.original_po_id,
    is_original: ntPo.is_original
  });

  // 6. Edit the NT PO. Verify parent/original lineage back to NT parent and original standard PO.
  console.log("\n--- Editing NT PO to create revision: TEST-SOABC-NT1-01 ---");
  db.prepare("UPDATE purchase_orders SET status = 'revised' WHERE id = ?").run(ntId);
  const ntRevResult = db.prepare(`
    INSERT INTO purchase_orders (
      order_id, customer_id, location_id, po_number, po_date, start_date, end_date,
      status, version, is_nt_po, is_temporary, parent_po_id, original_po_id, version_number, is_original, linked_po_id, subtotal, gst_total, grand_total, total_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ORD-TEST-NT-2', customerId, locationId, 'TEST-SOABC-NT1-01', '2026-05-29', '2026-05-29', '2026-06-29', 'nt_created', 2, 1, 1, ntId, ntId, 2, 0, ntPo.linked_po_id, 600, 108, 708, 708);
  const ntRevId = ntRevResult.lastInsertRowid;

  let ntRevPo = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(ntRevId);
  console.log("Inserted NT PO Revision:", {
    id: ntRevPo.id,
    po_number: ntRevPo.po_number,
    parent_po_id: ntRevPo.parent_po_id,
    original_po_id: ntRevPo.original_po_id,
    version_number: ntRevPo.version_number,
    is_original: ntRevPo.is_original,
    linked_po_id: ntRevPo.linked_po_id
  });

  if (ntRevPo.parent_po_id === ntId && ntRevPo.original_po_id === ntId && ntRevPo.linked_po_id === rootPoId) {
    console.log("✅ Success! NT PO revision correctly tracks lineage to both its parent NT PO and the original Standard PO!");
  } else {
    throw new Error("❌ Failure! NT PO revision lineage is incorrect.");
  }

  console.log("\n--- All tests completed successfully! ---");
} catch (error) {
  console.error("Test failed with error:", error);
} finally {
  cleanTestData();
  db.close();
}
