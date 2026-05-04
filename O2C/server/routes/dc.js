const express = require('express');
const router = express.Router();

module.exports = (db, authenticate, requireRole, auditLog) => {
  // GET all DCs
  router.get('/', authenticate, (req, res) => {
    try {
      const dcs = db.prepare(`
        SELECT dc.*, c.name as customer_name, cl.label as location_name,
               po.po_number, po.order_id,
               u.full_name as created_by_name
        FROM delivery_challans dc
        LEFT JOIN customers c ON dc.customer_id = c.id
        LEFT JOIN customer_locations cl ON dc.location_id = cl.id
        LEFT JOIN purchase_orders po ON dc.po_id = po.id
        LEFT JOIN users u ON dc.created_by = u.id
        ORDER BY dc.created_at DESC
      `).all();
      res.json(dcs);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET single DC with items
  router.get('/:id', authenticate, (req, res) => {
    try {
      const dc = db.prepare(`
        SELECT dc.*, c.name as customer_name, cl.label as location_name,
               po.po_number, po.order_id, po.subtotal as po_subtotal
        FROM delivery_challans dc
        LEFT JOIN customers c ON dc.customer_id = c.id
        LEFT JOIN customer_locations cl ON dc.location_id = cl.id
        LEFT JOIN purchase_orders po ON dc.po_id = po.id
        WHERE dc.id = ?
      `).get(req.params.id);
      if (!dc) return res.status(404).json({ error: 'DC not found' });
      dc.items = db.prepare(`
        SELECT di.*, pi.item_name as po_item_name, pi.quantity as po_qty
        FROM dc_line_items di
        LEFT JOIN po_line_items pi ON di.po_line_item_id = pi.id
        WHERE di.dc_id = ?
      `).all(dc.id);
      res.json(dc);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST create DC
  router.post('/', requireRole(['stores', 'accounts', 'admin']), (req, res) => {
    const { po_id, dc_date, dispatch_date, vehicle_number, driver_name, notes, items } = req.body;
    if (!po_id || !items || !items.length) return res.status(400).json({ error: 'po_id and items required' });
    try {
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
      if (!po) return res.status(404).json({ error: 'PO not found' });
      const dc_number = 'DC-' + Date.now();
      db.exec('BEGIN');
      const dcRes = db.prepare(`
        INSERT INTO delivery_challans (dc_number, po_id, customer_id, location_id, status, dc_date, dispatch_date, vehicle_number, driver_name, notes, created_by)
        VALUES (?, ?, ?, ?, 'raised', ?, ?, ?, ?, ?, ?)
      `).run(dc_number, po_id, po.customer_id, po.location_id, dc_date, dispatch_date, vehicle_number, driver_name, notes, req.user.id);
      const dcId = dcRes.lastInsertRowid;
      const itemStmt = db.prepare(`INSERT INTO dc_line_items (dc_id, po_line_item_id, item_name, description, quantity_dispatched, uom) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const item of items) {
        if (parseFloat(item.quantity_dispatched) > 0) {
          itemStmt.run(dcId, item.po_line_item_id, item.item_name, item.description || '', item.quantity_dispatched, item.uom || '');
        }
      }
      db.prepare(`UPDATE purchase_orders SET status = 'dc_raised', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(po_id);
      db.exec('COMMIT');
      auditLog(req.user.id, 'CREATE', 'DC', dcId, { dc_number, po_id });
      res.json({ success: true, dc_number, dc_id: dcId });
    } catch (err) { db.exec('ROLLBACK'); res.status(500).json({ error: err.message }); }
  });

  // PUT update DC status
  router.put('/:id/status', requireRole(['stores', 'accounts', 'admin', 'projects']), (req, res) => {
    const { status } = req.body;
    const valid = ['draft','raised','accepted','closed'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
      db.prepare('UPDATE delivery_challans SET status = ? WHERE id = ?').run(status, req.params.id);
      if (status === 'closed') {
        const dc = db.prepare('SELECT po_id FROM delivery_challans WHERE id = ?').get(req.params.id);
        if (dc) db.prepare(`UPDATE purchase_orders SET status = 'dc_closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(dc.po_id);
      }
      auditLog(req.user.id, 'STATUS_CHANGE', 'DC', req.params.id, { status });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
