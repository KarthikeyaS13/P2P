const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

try {
  const dcId = 12; 
  console.log('Testing DC query for ID:', dcId);
  
  const dc = db.prepare(`
    SELECT 
      d.*,
      dr.dc_request_no,
      p.po_number, p.po_date, p.grand_total,
      c.name as customer_name, c.legal_name as customer_legal_name, c.gstin as customer_gstin,
      c.address_line1 as customer_addr1, c.address_line2 as customer_addr2, c.city as customer_city, c.pincode as customer_pin,
      cl.label as location_name, cl.address_line1 as loc_addr1, cl.address_line2 as loc_addr2, cl.city as loc_city, cl.pincode as loc_pin
    FROM delivery_challans d
    LEFT JOIN dc_requests dr ON d.dc_request_id = dr.id
    LEFT JOIN purchase_orders p ON d.po_id = p.id
    LEFT JOIN customers c ON d.customer_id = c.id
    LEFT JOIN customer_locations cl ON d.customer_location_id = cl.id
    WHERE d.id = ?
  `).get(dcId);
  
  console.log('DC Query Success:', dc ? 'Found' : 'Not Found');
  
  if (dc) {
    const items = db.prepare(`
      SELECT 
        di.*, 
        pi.reference_number as ref_no, 
        pi.package_name as package,
        pi.heading,
        pi.sub_heading,
        pi.item_name,
        pi.description,
        pi.uom,
        COALESCE(pi.supply_qty, pi.qty) as supply_qty,
        pi.qty_delivered as current_total_delivered
      FROM dc_line_items di
      LEFT JOIN po_line_items pi ON di.po_line_item_id = pi.id
      WHERE di.dc_id = ?
    `).all(dcId);
    
    console.log('Items Query Success, Count:', items.length);
  }
} catch (err) {
  console.error('SQL ERROR:', err.message);
}
