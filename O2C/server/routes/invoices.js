const express = require('express');
const router = express.Router();

module.exports = (db, authenticate, requireRole, auditLog) => {
  // GET all invoices
  router.get('/', authenticate, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT inv.*, c.name as customer_name, po.po_number, po.order_id,
               dc.dc_number, u.full_name as created_by_name
        FROM invoices inv
        LEFT JOIN customers c ON inv.customer_id = c.id
        LEFT JOIN purchase_orders po ON inv.po_id = po.id
        LEFT JOIN delivery_challans dc ON inv.dc_id = dc.id
        LEFT JOIN users u ON inv.created_by = u.id
        ORDER BY inv.created_at DESC
      `).all();
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET single invoice
  router.get('/:id', authenticate, (req, res) => {
    try {
      const inv = db.prepare(`
        SELECT inv.*, c.name as customer_name, po.po_number, dc.dc_number
        FROM invoices inv
        LEFT JOIN customers c ON inv.customer_id = c.id
        LEFT JOIN purchase_orders po ON inv.po_id = po.id
        LEFT JOIN delivery_challans dc ON inv.dc_id = dc.id
        WHERE inv.id = ?
      `).get(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });
      inv.items = db.prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ?').all(inv.id);
      res.json(inv);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST create invoice
  router.post('/', requireRole(['accounts', 'admin']), (req, res) => {
    const { po_id, dc_id, invoice_date, due_date, notes, items } = req.body;
    if (!po_id || !items || !items.length) return res.status(400).json({ error: 'po_id and items required' });
    try {
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
      if (!po) return res.status(404).json({ error: 'PO not found' });

      let subtotal = 0, gst_total = 0;
      const calcItems = items.map(it => {
        const qty = parseFloat(it.quantity) || 0;
        const rate = parseFloat(it.rate_per_unit) || 0;
        const gstPct = parseFloat(it.gst_percent) || 0;
        const taxable = parseFloat(it.taxable_value) || (qty * rate);
        const gst = parseFloat(it.gst_amount) || (taxable * gstPct / 100);
        const total = taxable + gst;
        subtotal += taxable; gst_total += gst;
        return { ...it, taxable_value: taxable, gst_amount: gst, total_value: total };
      });
      const grand_total = subtotal + gst_total;
      const invoice_number = 'INV-' + Date.now();

      db.exec('BEGIN');
      const invRes = db.prepare(`
        INSERT INTO invoices (invoice_number, po_id, dc_id, customer_id, status, invoice_date, subtotal, gst_total, grand_total, due_date, notes, created_by)
        VALUES (?, ?, ?, ?, 'raised', ?, ?, ?, ?, ?, ?, ?)
      `).run(invoice_number, po_id, dc_id || null, po.customer_id, invoice_date, subtotal, gst_total, grand_total, due_date, notes, req.user.id);
      const invId = invRes.lastInsertRowid;

      const itemStmt = db.prepare(`INSERT INTO invoice_line_items (invoice_id, po_line_item_id, dc_line_item_id, item_name, quantity, rate_per_unit, gst_percent, taxable_value, gst_amount, total_value) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      calcItems.forEach(it => itemStmt.run(invId, it.po_line_item_id || null, it.dc_line_item_id || null, it.item_name, it.quantity || 0, it.rate_per_unit || 0, it.gst_percent || 0, it.taxable_value, it.gst_amount, it.total_value));

      // Create AR entry
      db.prepare(`INSERT INTO ar_entries (invoice_id, po_id, customer_id, amount_due, balance, status) VALUES (?,?,?,?,?,'pending')`).run(invId, po_id, po.customer_id, grand_total, grand_total);

      // Update PO status
      db.prepare(`UPDATE purchase_orders SET status = 'invoice_raised', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(po_id);

      db.exec('COMMIT');
      auditLog(req.user.id, 'CREATE', 'INVOICE', invId, { invoice_number, po_id, grand_total });
      res.json({ success: true, invoice_number, invoice_id: invId });
    } catch (err) { db.exec('ROLLBACK'); res.status(500).json({ error: err.message }); }
  });

  // PUT close invoice
  router.put('/:id/status', requireRole(['accounts', 'admin']), (req, res) => {
    const { status } = req.body;
    try {
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, req.params.id);
      if (status === 'closed') {
        const inv = db.prepare('SELECT po_id FROM invoices WHERE id = ?').get(req.params.id);
        if (inv) db.prepare(`UPDATE purchase_orders SET status='invoice_closed', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(inv.po_id);
      }
      auditLog(req.user.id, 'STATUS_CHANGE', 'INVOICE', req.params.id, { status });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET AR entries
  router.get('/ar/entries', authenticate, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT ar.*, inv.invoice_number, inv.invoice_date, inv.due_date,
               c.name as customer_name, po.po_number
        FROM ar_entries ar
        LEFT JOIN invoices inv ON ar.invoice_id = inv.id
        LEFT JOIN customers c ON ar.customer_id = c.id
        LEFT JOIN purchase_orders po ON ar.po_id = po.id
        ORDER BY ar.created_at DESC
      `).all();
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT record payment on AR entry
  router.put('/ar/:id/payment', requireRole(['accounts', 'admin']), (req, res) => {
    const { amount_received, payment_date, payment_reference } = req.body;
    try {
      const ar = db.prepare('SELECT * FROM ar_entries WHERE id = ?').get(req.params.id);
      if (!ar) return res.status(404).json({ error: 'AR entry not found' });
      const newReceived = parseFloat(((ar.amount_received || 0) + parseFloat(amount_received || 0)).toFixed(2));
      const balance = Math.max(0, parseFloat(((ar.amount_due || 0) - newReceived).toFixed(2)));
      const status = balance <= 0.01 ? 'paid' : 'partial';
      db.prepare(`UPDATE ar_entries SET amount_received=?, balance=?, payment_date=?, payment_reference=?, status=? WHERE id=?`)
        .run(newReceived, balance, payment_date, payment_reference, status, req.params.id);
      auditLog(req.user.id, 'PAYMENT', 'AR', req.params.id, { amount_received, payment_reference });
      res.json({ success: true, balance, status });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
