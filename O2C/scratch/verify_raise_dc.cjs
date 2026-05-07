const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('/home/surendra/O2C/O2C/server/database.sqlite');

try {
    const requestId = 2; // From previous query
    const poId = 59;
    
    console.log('--- Initial State ---');
    const initialRequest = db.prepare('SELECT status FROM dc_requests WHERE id = ?').get(requestId);
    console.log('Request Status:', initialRequest.status);
    
    // Simulate the logic in the endpoint
    db.exec('BEGIN');
    
    const customDCNo = 'TEST-DC-' + Date.now();
    const manualDC = 'M-123';
    const dispatchFrom = { line1: 'Overridden Line 1', line2: 'Overridden Line 2', pin: '123456' };
    const itemHSNs = { 10: '12345678' }; // Assuming item id 10 exists in the request
    
    const request = db.prepare('SELECT * FROM dc_requests WHERE id = ?').get(requestId);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(request.po_id);
    const items = db.prepare('SELECT * FROM dc_request_items WHERE dc_request_id = ?').all(requestId);
    
    const df1 = dispatchFrom?.line1 || 'Plot 18A, Sy No 118';
    const df2 = dispatchFrom?.line2 || 'IDA Balanagar, Hyderabad 500037';
    const dfp = dispatchFrom?.pin || '500037';

    const dc_number = customDCNo;

    const result = db.prepare(`
      INSERT INTO delivery_challans (
        dc_number, manual_dc_number, dc_request_id, po_id, customer_id, 
        customer_location_id, status, dispatch_date,
        dispatch_from_address1, dispatch_from_address2, dispatch_from_pincode,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?)
    `).run(
      dc_number, manualDC, requestId, po.id, po.customer_id, request.location_id, request.dispatch_date,
      df1, df2, dfp, 1
    );

    const dcId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO dc_line_items (dc_id, po_line_item_id, item_name, description, quantity_dispatched, uom, hsn)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const poItem = db.prepare('SELECT item_name, description, uom FROM po_line_items WHERE id = ?').get(item.line_item_id);
      insertItem.run(
        dcId, item.line_item_id, poItem.item_name, poItem.description || '', item.qty, poItem.uom || '',
        itemHSNs[item.line_item_id] || ''
      );
    }

    db.prepare("UPDATE dc_requests SET status = 'approved' WHERE id = ?").run(requestId);
    db.prepare("UPDATE purchase_orders SET status = 'dc_raised' WHERE id = ?").run(po.id);

    db.exec('COMMIT');
    
    console.log('--- Final State ---');
    const finalRequest = db.prepare('SELECT status FROM dc_requests WHERE id = ?').get(requestId);
    console.log('Request Status:', finalRequest.status);
    const dc = db.prepare('SELECT * FROM delivery_challans WHERE id = ?').get(dcId);
    console.log('DC Created:', dc.dc_number, 'Address:', dc.dispatch_from_address1);
    
} catch (err) {
    console.error('ERROR:', err);
    if (db.inTransaction) db.exec('ROLLBACK');
}
