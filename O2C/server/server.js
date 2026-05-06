const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const xlsx = require('xlsx');

const JWT_SECRET = process.env.JWT_SECRET || 'o2c-super-secret-key-2026';
const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('foreign_keys = ON');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Migrations ---
const migrations = [
  "ALTER TABLE customers ADD COLUMN legal_name TEXT",
  "ALTER TABLE customers ADD COLUMN pan TEXT",
  "ALTER TABLE customers ADD COLUMN address_line1 TEXT",
  "ALTER TABLE customers ADD COLUMN address_line2 TEXT",
  "ALTER TABLE customers ADD COLUMN address_line3 TEXT",
  "ALTER TABLE customers ADD COLUMN city TEXT",
  "ALTER TABLE customers ADD COLUMN state TEXT",
  "ALTER TABLE customers ADD COLUMN pincode TEXT",
  "ALTER TABLE customers ADD COLUMN contact_name TEXT",
  "ALTER TABLE customers ADD COLUMN contact_department TEXT",
  "ALTER TABLE customers ADD COLUMN contact_email TEXT",
  "ALTER TABLE customers ADD COLUMN contact_phone TEXT",
  "ALTER TABLE customer_locations ADD COLUMN address_line2 TEXT",
  "ALTER TABLE customer_locations ADD COLUMN address_line3 TEXT",
  "ALTER TABLE customer_locations ADD COLUMN city TEXT",
  "ALTER TABLE customer_locations ADD COLUMN state TEXT",
  "ALTER TABLE customer_locations ADD COLUMN pincode TEXT",
  "ALTER TABLE customer_locations ADD COLUMN gstin TEXT",
  "ALTER TABLE customers ADD COLUMN spoc2_name TEXT",
  "ALTER TABLE customers ADD COLUMN spoc2_department TEXT",
  "ALTER TABLE customers ADD COLUMN spoc2_email TEXT",
  "ALTER TABLE customers ADD COLUMN spoc2_phone TEXT",
  "ALTER TABLE customer_locations ADD COLUMN gst_is_different BOOLEAN DEFAULT 0",
  "ALTER TABLE customer_locations ADD COLUMN spoc2_name TEXT",
  "ALTER TABLE customer_locations ADD COLUMN spoc2_department TEXT",
  "ALTER TABLE customer_locations ADD COLUMN spoc2_email TEXT",
  "ALTER TABLE customer_locations ADD COLUMN spoc2_phone TEXT",
  "ALTER TABLE purchase_orders ADD COLUMN po_copy_path TEXT",
  "ALTER TABLE purchase_orders ADD COLUMN po_annex_path TEXT",
  "ALTER TABLE purchase_orders ADD COLUMN other_attachment_path TEXT",
  "ALTER TABLE po_line_items ADD COLUMN supply_qty REAL",
  "ALTER TABLE po_line_items ADD COLUMN supply_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN supply_gst_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN service_qty REAL",
  "ALTER TABLE po_line_items ADD COLUMN service_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN service_gst_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN taxable_supply REAL",
  "ALTER TABLE po_line_items ADD COLUMN gst_supply REAL",
  "ALTER TABLE po_line_items ADD COLUMN total_supply REAL",
  "ALTER TABLE po_line_items ADD COLUMN taxable_service REAL",
  "ALTER TABLE po_line_items ADD COLUMN gst_service REAL",
  "ALTER TABLE po_line_items ADD COLUMN total_service REAL",
  "ALTER TABLE po_line_items ADD COLUMN total_taxable REAL",
  "ALTER TABLE po_line_items ADD COLUMN total_gst REAL",
  "ALTER TABLE po_line_items ADD COLUMN total_invoice REAL",
  "ALTER TABLE po_line_items ADD COLUMN edit_supply_qty REAL",
  "ALTER TABLE po_line_items ADD COLUMN edit_supply_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN edit_supply_gst_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN edit_service_qty REAL",
  "ALTER TABLE po_line_items ADD COLUMN edit_service_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN edit_service_gst_rate REAL"
];

migrations.forEach(sql => {
  try { db.exec(sql); } catch(e) {}
});

// --- File upload ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({ destination: (req,file,cb)=>cb(null,uploadDir), filename: (req,file,cb)=>cb(null,Date.now()+'-'+file.originalname.replace(/\s+/g,'-')) });
const upload = multer({ storage });

// --- Auth middleware ---
const authenticate = (req, res, next) => {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const token = h.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired. Please log in again.' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/upload-multi', authenticate, upload.fields([
  { name: 'po_copy', maxCount: 1 },
  { name: 'po_annex', maxCount: 1 },
  { name: 'other', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files;
    res.json({
      po_copy: files['po_copy']?.[0]?.filename,
      po_annex: files['po_annex']?.[0]?.filename,
      other: files['other']?.[0]?.filename
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', authenticate, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.id, u.username, u.full_name, r.name as role 
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function requireRole(roles) {
  return (req, res, next) => authenticate(req, res, () => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Forbidden: requires [${roles.join(',')}]` });
    next();
  });
}

function auditLog(userId, action, module, recordId, details) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, module, record_id, details) VALUES (?,?,?,?,?)').run(userId, action, module, recordId||null, details ? JSON.stringify(details) : null);
  } catch(e) { console.error('[Audit]', e.message); }
}

// --- Login ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare(`SELECT u.id, u.username, u.full_name, u.password_hash, r.name as role
    FROM users u JOIN user_roles ur ON u.id=ur.user_id JOIN roles r ON ur.role_id=r.id WHERE u.username=?`).get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});

app.get('/api/users/me', authenticate, (req, res) => res.json(req.user));

// --- Audit log ---
app.get('/api/audit-log', requireRole(['admin','auditor','management']), (req, res) => {
  try {
    const rows = db.prepare(`SELECT al.*, u.full_name as user_name FROM audit_log al LEFT JOIN users u ON al.user_id=u.id ORDER BY al.created_at DESC LIMIT 500`).all();
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// --- Dashboard ---
app.get('/api/dashboard', authenticate, (req, res) => {
  try {
    const stats = {
      active_pos: db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE status NOT IN ('rejected','invoice_closed')`).get().c,
      pending_pos: db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE status='pending'`).get().c,
      pending_dcs: db.prepare(`SELECT COUNT(*) as c FROM delivery_challans WHERE status IN ('draft','raised')`).get().c,
      pending_invoices: db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE status IN ('draft','raised')`).get().c,
      pending_ar: db.prepare(`SELECT COUNT(*) as c FROM ar_entries WHERE status IN ('pending','partial')`).get().c,
      total_customers: db.prepare(`SELECT COUNT(*) as c FROM customers`).get().c,
    };
    const recent_pos = db.prepare(`SELECT po.po_number, po.order_id, po.status, po.grand_total, c.name as customer_name, po.updated_at FROM purchase_orders po JOIN customers c ON po.customer_id=c.id ORDER BY po.updated_at DESC LIMIT 5`).all();
    const recent_dcs = db.prepare(`SELECT dc.dc_number, dc.status, po.po_number, dc.created_at FROM delivery_challans dc JOIN purchase_orders po ON dc.po_id=po.id ORDER BY dc.created_at DESC LIMIT 5`).all();
    const recent_invoices = db.prepare(`SELECT inv.invoice_number, inv.status, inv.grand_total, c.name as customer_name, inv.created_at FROM invoices inv JOIN customers c ON inv.customer_id=c.id ORDER BY inv.created_at DESC LIMIT 5`).all();
    res.json({ stats, recent_pos, recent_dcs, recent_invoices });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// --- Customers ---
app.get('/api/customers', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        id, cust_code, name, legal_name, pan,
        gstin, gst_status,
        address_line1, address_line2, address_line3, city, state, pincode,
        contact_name, contact_department,
        contact_email, contact_phone,
        email, phone, is_active, created_at,
        (SELECT COUNT(*) FROM customer_locations 
         WHERE customer_id = customers.id) as location_count
      FROM customers
      WHERE is_active = 1 OR is_active IS NULL
      ORDER BY name ASC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', authenticate, (req, res) => {
  try {
    const customer = db.prepare(`
      SELECT * FROM customers WHERE id = ?
    `).get(req.params.id);

    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const locations = db.prepare(`
      SELECT * FROM customer_locations 
      WHERE customer_id = ?
      ORDER BY is_primary DESC, id ASC
    `).all(req.params.id);

    res.json({ ...customer, locations });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', requireRole(['admin']), (req, res) => {
  try {
    const {
      cust_code, name, legal_name, pan, gstin,
      address_line1, address_line2, address_line3, pincode,
      city, state,
      contact_name, contact_department,
      contact_email, contact_phone,
      spoc2_name, spoc2_department,
      spoc2_email, spoc2_phone,
      email, phone
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!gstin) return res.status(400).json({ error: 'GSTIN is required' });
    if (!pincode) return res.status(400).json({ error: 'Pincode is required' });
    if (!cust_code) return res.status(400).json({ error: 'Customer ID is required' });

    const existingCode = db.prepare('SELECT id FROM customers WHERE cust_code = ?').get(cust_code);
    if (existingCode) return res.status(400).json({ error: 'Customer ID already exists' });

    const result = db.prepare(`
      INSERT INTO customers (
        cust_code, name, legal_name, pan, gstin,
        address_line1, address_line2, address_line3, city, state, pincode,
        contact_name, contact_department,
        contact_email, contact_phone,
        spoc2_name, spoc2_department,
        spoc2_email, spoc2_phone,
        email, phone, is_active, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      cust_code, name, legal_name||'', pan||'', gstin,
      address_line1||'', address_line2||'', address_line3||'', city||'', state||'', pincode,
      contact_name||'', contact_department||'',
      contact_email||'', contact_phone||'',
      spoc2_name||'', spoc2_department||'',
      spoc2_email||'', spoc2_phone||'',
      email||'', phone||'',
      1, req.user.id
    );

    res.json({ success: true, id: result.lastInsertRowid, cust_code });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', requireRole(['admin']), (req, res) => {
  try {
    const {
      cust_code, name, legal_name, pan, gstin,
      address_line1, address_line2, address_line3, city, state, pincode,
      contact_name, contact_department,
      contact_email, contact_phone,
      spoc2_name, spoc2_department,
      spoc2_email, spoc2_phone,
      email, phone
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!gstin) return res.status(400).json({ error: 'GSTIN is required' });
    if (!pincode) return res.status(400).json({ error: 'Pincode is required' });
    if (!cust_code) return res.status(400).json({ error: 'Customer ID is required' });

    db.prepare(`
      UPDATE customers SET
        cust_code=?, name=?, legal_name=?, pan=?, gstin=?,
        address_line1=?, address_line2=?, address_line3=?, city=?, state=?, pincode=?,
        contact_name=?, contact_department=?,
        contact_email=?, contact_phone=?,
        spoc2_name=?, spoc2_department=?,
        spoc2_email=?, spoc2_phone=?,
        email=?, phone=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      cust_code, name, legal_name||'', pan||'', gstin,
      address_line1||'', address_line2||'', address_line3||'', city||'', state||'', pincode,
      contact_name||'', contact_department||'',
      contact_email||'', contact_phone||'',
      spoc2_name||'', spoc2_department||'',
      spoc2_email||'', spoc2_phone||'',
      email||'', phone||'',
      req.params.id
    );

    res.json({ success: true });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Locations ---
app.get('/api/locations', authenticate, (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
    const rows = db.prepare('SELECT * FROM customer_locations WHERE customer_id = ?').all(customer_id);
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', requireRole(['admin']), (req, res) => {
  try {
    const {
      customer_id, label, address_line1, address_line2, 
      address_line3, city, state, pincode, gstin,
      gst_is_different, contact_name, contact_email, contact_phone,
      spoc2_name, spoc2_department, spoc2_email, spoc2_phone
    } = req.body;

    if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
    if (!label) return res.status(400).json({ error: 'label required' });
    if (!pincode) return res.status(400).json({ error: 'pincode required' });

    const result = db.prepare(`
      INSERT INTO customer_locations (
        customer_id, label, address_line1, address_line2,
        address_line3, city, state, pincode, gstin,
        gst_is_different, contact_name, contact_email, contact_phone,
        spoc2_name, spoc2_department, spoc2_email, spoc2_phone
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      customer_id, label, address_line1||'', address_line2||'',
      address_line3||'', city||'', state||'', pincode, gstin||'',
      gst_is_different ? 1 : 0, contact_name||'', contact_email||'', contact_phone||'',
      spoc2_name||'', spoc2_department||'', spoc2_email||'', spoc2_phone||''
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch(err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', requireRole(['admin']), (req, res) => {
  try {
    const {
      label, address_line1, address_line2, address_line3, 
      city, state, pincode, gstin, gst_is_different,
      contact_name, contact_email, contact_phone,
      spoc2_name, spoc2_department, spoc2_email, spoc2_phone
    } = req.body;

    if (!label) return res.status(400).json({ error: 'label required' });
    if (!pincode) return res.status(400).json({ error: 'pincode required' });

    db.prepare(`
      UPDATE customer_locations SET
        label=?, address_line1=?, address_line2=?,
        address_line3=?, city=?, state=?, pincode=?, gstin=?,
        gst_is_different=?, contact_name=?, 
        contact_email=?, contact_phone=?,
        spoc2_name=?, spoc2_department=?,
        spoc2_email=?, spoc2_phone=?
      WHERE id=?
    `).run(
      label, address_line1||'', address_line2||'',
      address_line3||'', city||'', state||'', pincode, gstin||'',
      gst_is_different ? 1 : 0, contact_name||'', 
      contact_email||'', contact_phone||'',
      spoc2_name||'', spoc2_department||'',
      spoc2_email||'', spoc2_phone||'',
      req.params.id
    );

    res.json({ success: true });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', requireRole(['admin']), (req, res) => {
  try {
    const poLinked = db.prepare(
      'SELECT id FROM purchase_orders WHERE location_id = ? LIMIT 1'
    ).get(req.params.id);

    if (poLinked) {
      return res.status(400).json({ 
        error: 'Cannot delete location linked to existing POs' 
      });
    }

    db.prepare('DELETE FROM customer_locations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Purchase Orders ---
app.get('/api/pos', authenticate, (req, res) => {
  try {
    const { status, type } = req.query;
    let sql = `
      SELECT 
        p.id, p.order_id, p.po_number, p.status,
        p.is_nt_po, p.is_temporary, p.is_temp_po,
        p.grand_total, p.subtotal, p.gst_total,
        p.total_value, p.po_date, p.created_at,
        p.customer_id, p.location_id,
        c.name as customer_name,
        cl.label as location_name,
        cl.city as location_city,
        (SELECT COUNT(*) FROM purchase_orders WHERE linked_po_id = p.id) as nt_count
      FROM purchase_orders p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN customer_locations cl ON p.location_id = cl.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push(`p.status = ?`);
      params.push(status);
    }
    
    if (type === 'original') {
      conditions.push(`p.is_nt_po = 0 AND p.is_temporary = 0`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY p.created_at DESC`;

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pos/:id', authenticate, (req, res) => {
  try {
    const po = db.prepare(`
      SELECT 
        p.*,
        c.name as customer_name,
        c.gstin as customer_gst,
        cl.label as location_name,
        cl.city as location_city,
        cl.contact_name as spoc_name,
        cl.contact_phone as spoc_phone
      FROM purchase_orders p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN customer_locations cl ON p.location_id = cl.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!po) return res.status(404).json({ error: 'PO not found' });

    const items = db.prepare(`
      SELECT 
        *,
        reference_number AS ref_no
      FROM po_line_items
      WHERE po_id = ?
      ORDER BY line_number ASC
    `).all(req.params.id);

    res.json({ ...po, items });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pos', authenticate, (req, res) => {
  try {
    const {
      customer_id, location_id, po_number, po_date,
      start_date, end_date, is_nt_po, is_temporary,
      linked_po_id, subtotal, gst_total, grand_total,
      po_copy_path, po_annex_path, other_attachment_path,
      items
    } = req.body;

    const safeLinkedPoId = linked_po_id && linked_po_id !== '' ? parseInt(linked_po_id) : null;
    const safeIsNtPo = is_nt_po ? 1 : 0;
    const safeIsTemp = is_temporary ? 1 : 0;

    let finalPONumber = po_number;
    const existing = db.prepare(
      'SELECT id FROM purchase_orders WHERE po_number = ?'
    ).get(finalPONumber);
    if (existing) {
      finalPONumber = finalPONumber + '-' + Date.now();
    }

    const order_id = 'ORD-' + Date.now();
    const status = safeIsNtPo ? 'nt_created' : 'pending';

    db.exec('BEGIN');
    const r = db.prepare(`
      INSERT INTO purchase_orders (
        order_id, customer_id, location_id,
        po_number, po_date, start_date, end_date,
        status, is_nt_po, is_temporary,
        linked_po_id, subtotal, gst_total, grand_total,
        total_value, po_copy_path, po_annex_path, other_attachment_path,
        created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      order_id, customer_id, location_id,
      finalPONumber, po_date||null, start_date||null, end_date||null,
      status, safeIsNtPo, safeIsTemp,
      safeLinkedPoId, subtotal||0, gst_total||0, grand_total||0,
      grand_total||0, po_copy_path||null, po_annex_path||null, other_attachment_path||null,
      req.user.id
    );

    const poId = r.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO po_line_items (
        po_id, line_number, reference_number, package_name, heading,
        sub_heading, item_name, description,
        uom, supply_qty, supply_rate, supply_gst_rate,
        service_qty, service_rate, service_gst_rate,
        taxable_supply, gst_supply, total_supply,
        taxable_service, gst_service, total_service,
        total_taxable, total_gst, total_invoice,
        edit_supply_qty, edit_supply_rate, edit_supply_gst_rate,
        edit_service_qty, edit_service_rate, edit_service_gst_rate
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    (items || []).forEach((item, index) => {
      itemStmt.run(
        poId, index + 1,
        item.ref_no || '',
        item.package_name || '',
        item.heading || '',
        item.sub_heading || '',
        item.item_name || 'Item',
        item.description || '',
        item.uom || '',
        item.supply_qty || 0,
        item.supply_rate || 0,
        item.supply_gst_rate || 0,
        item.service_qty || 0,
        item.service_rate || 0,
        item.service_gst_rate || 0,
        item.taxable_supply || 0,
        item.gst_supply || 0,
        item.total_supply || 0,
        item.taxable_service || 0,
        item.gst_service || 0,
        item.total_service || 0,
        item.total_taxable || 0,
        item.total_gst || 0,
        item.total_invoice || 0,
        item.edit_supply_qty || null,
        item.edit_supply_rate || null,
        item.edit_supply_gst_rate || null,
        item.edit_service_qty || null,
        item.edit_service_rate || null,
        item.edit_service_gst_rate || null
      );
    });

    db.exec('COMMIT');
    res.json({ success: true, order_id, po_id: poId });
  } catch(err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pos/:id/status', authenticate, (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending','nt_created','accepted','rejected',
                   'dc_raised','invoice_raised','closed'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.prepare(
      'UPDATE purchase_orders SET status = ? WHERE id = ?'
    ).run(status, req.params.id);
    res.json({ success: true, status });
  } catch (err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pos/:id', requireRole(['sales','admin','accounts','management']), (req, res) => {
  const { status, items } = req.body;
  try {
    db.exec('BEGIN');
    if (status) db.prepare(`UPDATE purchase_orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, req.params.id);
    if (items && items.length) {
      db.prepare(`DELETE FROM po_line_items WHERE po_id=?`).run(req.params.id);
      const stmt = db.prepare(`
        INSERT INTO po_line_items (
          po_id, line_number, reference_number, package_name, heading,
          sub_heading, item_name, description,
          uom, supply_qty, supply_rate, supply_gst_rate,
          service_qty, service_rate, service_gst_rate,
          taxable_supply, gst_supply, total_supply,
          taxable_service, gst_service, total_service,
          total_taxable, total_gst, total_invoice,
          edit_supply_qty, edit_supply_rate, edit_supply_gst_rate,
          edit_service_qty, edit_service_rate, edit_service_gst_rate,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `);
      
      let subtotal=0, gst_total=0;
      items.forEach((it, i) => {
        subtotal += (it.total_taxable || 0);
        gst_total += (it.total_gst || 0);
        
        stmt.run(
          req.params.id, i + 1,
          it.ref_no || '',
          it.package_name || '',
          it.heading || '',
          it.sub_heading || '',
          it.item_name || 'Item',
          it.description || '',
          it.uom || '',
          it.supply_qty || 0,
          it.supply_rate || 0,
          it.supply_gst_rate || 0,
          it.service_qty || 0,
          it.service_rate || 0,
          it.service_gst_rate || 0,
          it.taxable_supply || 0,
          it.gst_supply || 0,
          it.total_supply || 0,
          it.taxable_service || 0,
          it.gst_service || 0,
          it.total_service || 0,
          it.total_taxable || 0,
          it.total_gst || 0,
          it.total_invoice || 0,
          it.edit_supply_qty || null,
          it.edit_supply_rate || null,
          it.edit_supply_gst_rate || null,
          it.edit_service_qty || null,
          it.edit_service_rate || null,
          it.edit_service_gst_rate || null
        );
      });
      db.prepare(`UPDATE purchase_orders SET subtotal=?, gst_total=?, grand_total=?, total_value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(subtotal, gst_total, subtotal + gst_total, subtotal + gst_total, req.params.id);
    }
    db.exec('COMMIT');
    res.json({ success: true });
  } catch(err) { db.exec('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

app.delete('/api/pos/:id', requireRole(['admin']), (req, res) => {
  try {
    db.exec('BEGIN');
    db.prepare(`DELETE FROM dc_line_items WHERE dc_id IN (SELECT id FROM delivery_challans WHERE po_id=?)`).run(req.params.id);
    db.prepare(`DELETE FROM delivery_challans WHERE po_id=?`).run(req.params.id);
    db.prepare(`DELETE FROM po_line_items WHERE po_id=?`).run(req.params.id);
    db.prepare(`DELETE FROM purchase_orders WHERE id=?`).run(req.params.id);
    db.exec('COMMIT');
    auditLog(req.user.id, 'DELETE', 'PO', req.params.id, {});
    res.json({ success: true });
  } catch(err) { db.exec('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

// --- Excel Parse ---
app.post('/api/parse-po-excel', requireRole(['sales','admin']), upload.single('document'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = xlsx.readFile(req.file.path);
    const rawData = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });
    let headerIdx=0, maxScore=-1;
    for (let i=0; i<Math.min(rawData.length,20); i++) {
      const s = rawData[i].map(c=>String(c).toLowerCase()).join(' ');
      let sc=0;
      if(s.includes('s.no')||s.includes('sl')||s.includes('serial'))sc+=2;
      if(s.includes('description')||s.includes('item')||s.includes('particulars'))sc+=2;
      if(s.includes('qty')||s.includes('quantity'))sc+=2;
      if(s.includes('rate')||s.includes('unit cost'))sc+=2;
      if(s.includes('amount')||s.includes('value')||s.includes('total'))sc+=2;
      if(s.includes('gst')||s.includes('tax'))sc+=2;
      if(s.includes('package'))sc+=2;
      sc+=rawData[i].filter(c=>c!=='').length*0.5;
      if(sc>maxScore){maxScore=sc;headerIdx=i;}
    }
    const rawHeaders = rawData[headerIdx];
    const validIdx = rawHeaders.map((h,i)=>h!==''&&h!==null&&h!==undefined?i:-1).filter(i=>i>=0);
    const headers = validIdx.map(i=>rawHeaders[i]);
    const rows = rawData.slice(headerIdx+1).filter(r=>r.some(c=>c!=='')).map(r=>validIdx.map(i=>r[i]||''));

    // Column mapping
    const hLow = headers.map(h=>String(h).toLowerCase().replace(/\s+/g,''));
    const colIdx = (keys) => { for(const k of keys){ const i=hLow.findIndex(h=>h.includes(k)); if(i>=0)return i; } return -1; };
    const mapping = {
      serial: colIdx(['s.no','slno','sno','no.']),
      package: colIdx(['package']),
      heading: colIdx(['heading']),
      sub_heading: colIdx(['subheading','sub-heading']),
      item_name: colIdx(['description','item','particulars','material']),
      uom: colIdx(['uom','unit']),
      quantity: colIdx(['qty','quantity']),
      rate: colIdx(['rate','unitcost','unitprice']),
      gst_percent: colIdx(['gstrate','gst%','igst','taxrate']),
      taxable_value: colIdx(['taxablevalue','taxableamount']),
      gst_amount: colIdx(['gstamount','gstvalue']),
      total_value: colIdx(['total','invoicevalue','amount']),
    };

    const skipWords = ['total','gst','taxable','subtotal','cgst','sgst','igst','grand'];
    const items = []; let lastItem = null;
    for (const row of rows) {
      const get = (col) => col>=0 ? row[col] : '';
      const nameVal = String(get(mapping.item_name)).trim();
      if (!nameVal) continue;
      if (skipWords.some(w=>nameVal.toLowerCase().includes(w))) continue;
      const qty = parseFloat(get(mapping.quantity))||0;
      const rate = parseFloat(get(mapping.rate))||0;
      if (qty>0 || rate>0) {
        const gstPct = parseFloat(get(mapping.gst_percent))||0;
        const taxable = parseFloat(get(mapping.taxable_value))||(qty*rate);
        const gstAmt = parseFloat(get(mapping.gst_amount))||(taxable*gstPct/100);
        const total = parseFloat(get(mapping.total_value))||(taxable+gstAmt);
        lastItem = { package_name: String(get(mapping.package)).trim()||'', heading: String(get(mapping.heading)).trim()||'', sub_heading: String(get(mapping.sub_heading)).trim()||'', item_name: nameVal, description: '', uom: String(get(mapping.uom)).trim()||'', quantity: qty, rate_per_unit: rate, gst_percent: gstPct, taxable_value: taxable, gst_amount: gstAmt, total_value: total };
        items.push(lastItem);
      } else if (lastItem) {
        lastItem.description = (lastItem.description ? lastItem.description+'\n' : '') + nameVal;
      }
    }
    res.json({ items, headers, rows, file_path: req.file.path });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// --- Invoices & AR ---
app.post('/api/invoices', authenticate, (req, res) => {
  try {
    const { po_id, dc_id, customer_id, invoice_date, due_date, notes, subtotal, gst_total, grand_total } = req.body;
    const invoice_number = 'INV-' + Date.now();

    db.exec('BEGIN');
    const invResult = db.prepare(`
      INSERT INTO invoices (
        invoice_number, po_id, dc_id, customer_id,
        status, invoice_date, due_date, notes,
        subtotal, gst_total, grand_total, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      invoice_number, po_id, dc_id, customer_id,
      'raised', invoice_date, due_date||null, notes||'',
      subtotal||0, gst_total||0, grand_total||0, req.user.id
    );

    const invoiceId = invResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO ar_entries (
        invoice_id, po_id, customer_id,
        amount_due, amount_received,
        balance, status
      ) VALUES (?,?,?,?,?,?,?)
    `).run(
      invoiceId, po_id, customer_id,
      grand_total||0, 0, grand_total||0, 'pending'
    );

    db.prepare(`
      UPDATE delivery_challans 
      SET status='invoice_raised' WHERE id=?
    `).run(dc_id);

    db.exec('COMMIT');
    res.json({ success: true, invoice_number });
  } catch(err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        i.*,
        c.name as customer_name,
        p.po_number,
        d.dc_number
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      LEFT JOIN delivery_challans d ON i.dc_id = d.id
      ORDER BY i.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ar', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        ar.*,
        c.name as customer_name,
        i.invoice_number, i.invoice_date, i.due_date,
        p.po_number
      FROM ar_entries ar
      LEFT JOIN customers c ON ar.customer_id = c.id
      LEFT JOIN invoices i ON ar.invoice_id = i.id
      LEFT JOIN purchase_orders p ON ar.po_id = p.id
      ORDER BY ar.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc', authenticate, (req, res) => {
  try {
    const {
      po_id, customer_id, location_id,
      dc_date, vehicle_number, driver_name, notes, items
    } = req.body;

    const dc_number = 'DC-' + Date.now();

    const dcResult = db.prepare(`
      INSERT INTO delivery_challans (
        dc_number, po_id, customer_id, location_id,
        status, dc_date, vehicle_number,
        driver_name, notes, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      dc_number, po_id, customer_id, location_id,
      'raised', dc_date, vehicle_number||'',
      driver_name||'', notes||'', req.user.id
    );

    const dcId = dcResult.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO dc_line_items (
        dc_id, po_line_item_id, item_name,
        description, quantity_dispatched, uom
      ) VALUES (?,?,?,?,?,?)
    `);

    (items || []).forEach(item => {
      itemStmt.run(
        dcId,
        item.po_line_item_id || null,
        item.item_name,
        item.description || '',
        parseFloat(item.quantity_dispatched) || 0,
        item.uom || ''
      );
    });

    db.prepare(
      "UPDATE purchase_orders SET status='dc_raised' WHERE id=?"
    ).run(po_id);

    res.json({ success: true, dc_number, dc_id: dcId });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dc', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        d.id, d.dc_number, d.status,
        d.dc_date, d.vehicle_number, d.driver_name,
        d.created_at,
        p.po_number,
        c.name as customer_name,
        cl.label as location_name
      FROM delivery_challans d
      LEFT JOIN purchase_orders p ON d.po_id = p.id
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN customer_locations cl ON d.location_id = cl.id
      ORDER BY d.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dc/:id', authenticate, (req, res) => {
  try {
    const dc = db.prepare(`
      SELECT 
        d.*,
        p.po_number, p.grand_total,
        c.name as customer_name,
        cl.label as location_name, cl.contact_name as spoc_name
      FROM delivery_challans d
      LEFT JOIN purchase_orders p ON d.po_id = p.id
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN customer_locations cl ON d.location_id = cl.id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!dc) return res.status(404).json({ error: 'DC not found' });

    const items = db.prepare(
      'SELECT * FROM dc_line_items WHERE dc_id = ?'
    ).all(req.params.id);

    res.json({ ...dc, items });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/dc/:id/status', authenticate, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE delivery_challans SET status=? WHERE id=?').run(status, req.params.id);
    res.json({ success: true });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`O2C Server running on port ${PORT}`));
