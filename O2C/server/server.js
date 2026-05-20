const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const xlsx = require('xlsx');
const crypto = require('crypto');

const { generateInvoicePDFBuffer } = require('./services/pdfGenerator');
const { signInvoicePDF } = require('./services/pdfSigner');
const { verifyInvoicePDF, extractWatermarkMetadata } = require('./services/pdfVerifier');
const pdfParse = require('pdf-parse');

const JWT_SECRET = process.env.JWT_SECRET || 'o2c-super-secret-key-2026';
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('foreign_keys = ON');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Migrations ---
const migrations = [
  "CREATE TABLE IF NOT EXISTS dc_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, po_id INTEGER, location_id INTEGER, dc_request_no TEXT, dispatch_date TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, transporter TEXT, special_instructions TEXT)",
  "CREATE TABLE IF NOT EXISTS dc_request_items (id INTEGER PRIMARY KEY AUTOINCREMENT, dc_request_id INTEGER, line_item_id INTEGER, qty REAL)",
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
  "ALTER TABLE po_line_items ADD COLUMN edit_service_gst_rate REAL",
  "ALTER TABLE po_line_items ADD COLUMN qty_delivered REAL DEFAULT 0",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_cust_code ON customers(cust_code)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin)",
  "ALTER TABLE delivery_challans ADD COLUMN manual_dc_number TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN dc_request_id INTEGER",
  "ALTER TABLE dc_line_items ADD COLUMN hsn TEXT",
  "ALTER TABLE dc_requests ADD COLUMN vehicle_no TEXT",
  "ALTER TABLE dc_requests ADD COLUMN driver_name TEXT",
  "ALTER TABLE dc_requests ADD COLUMN driver_phone TEXT",
  "ALTER TABLE dc_requests ADD COLUMN lr_no TEXT",
  "ALTER TABLE dc_requests ADD COLUMN eway_bill_no TEXT",
  "ALTER TABLE dc_requests ADD COLUMN dispatch_proof_path TEXT",
  "ALTER TABLE dc_requests ADD COLUMN logistics_remarks TEXT",
  "ALTER TABLE dc_requests ADD COLUMN dispatched_at DATETIME",
  "ALTER TABLE delivery_challans ADD COLUMN delivery_status TEXT DEFAULT 'awaiting_confirmation'",
  "ALTER TABLE delivery_challans ADD COLUMN received_by TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN receiver_phone TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN receiver_designation TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN site_remarks TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN damage_remarks TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN shortage_remarks TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN pod_path TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN signed_dc_path TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN grn_path TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN site_photos_path TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN delivery_confirmed_at DATETIME",
  "ALTER TABLE delivery_challans ADD COLUMN vehicle_no TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN driver_name TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN transporter TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN driver_phone TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN lr_no TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN eway_bill_no TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN dispatch_proof_path TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN logistics_remarks TEXT",
  "ALTER TABLE delivery_challans ADD COLUMN dispatched_at DATETIME",
  "ALTER TABLE dc_line_items ADD COLUMN received_qty REAL",
  "ALTER TABLE dc_line_items ADD COLUMN item_condition TEXT DEFAULT 'OK'",
  "ALTER TABLE dc_requests ADD COLUMN dispatch_from_address1 TEXT",
  "ALTER TABLE dc_requests ADD COLUMN dispatch_from_address2 TEXT",
  "ALTER TABLE dc_requests ADD COLUMN dispatch_from_pincode TEXT",
  "ALTER TABLE dc_requests ADD COLUMN dispatch_from_landmark TEXT",
  "ALTER TABLE dc_requests ADD COLUMN requested_dc_number TEXT",
  "ALTER TABLE dc_requests ADD COLUMN is_manual_dc BOOLEAN DEFAULT 0",
  "ALTER TABLE dc_requests ADD COLUMN proof_path TEXT",
  "ALTER TABLE dc_requests ADD COLUMN logistics_remarks TEXT",
  "CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT, po_id INTEGER, dc_id INTEGER, customer_id INTEGER, status TEXT DEFAULT 'raised', invoice_date TEXT, due_date TEXT, notes TEXT, subtotal REAL, gst_total REAL, grand_total REAL, place_of_supply TEXT, payment_terms TEXT, billing_address TEXT, shipping_address TEXT, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "ALTER TABLE invoices ADD COLUMN place_of_supply TEXT",
  "ALTER TABLE invoices ADD COLUMN payment_terms TEXT",
  "ALTER TABLE invoices ADD COLUMN billing_address TEXT",
  "ALTER TABLE invoices ADD COLUMN shipping_address TEXT",
  "ALTER TABLE invoices ADD COLUMN customer_id INTEGER",
  "ALTER TABLE invoices ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE invoices ADD COLUMN signature_data TEXT",
  "CREATE TABLE IF NOT EXISTS invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, po_line_item_id INTEGER, dc_line_item_id INTEGER, item_name TEXT, quantity REAL, rate REAL, gst_percent REAL, taxable_value REAL, gst_amount REAL, total_value REAL)",
  "ALTER TABLE invoice_items ADD COLUMN item_name TEXT",
  "ALTER TABLE invoice_items ADD COLUMN quantity REAL",
  "ALTER TABLE invoice_items ADD COLUMN rate REAL",
  "ALTER TABLE invoice_items ADD COLUMN gst_percent REAL",
  "ALTER TABLE invoice_items ADD COLUMN taxable_value REAL",
  "ALTER TABLE invoice_items ADD COLUMN gst_amount REAL",
  "ALTER TABLE invoice_items ADD COLUMN total_value REAL",
  "CREATE TABLE IF NOT EXISTS ar_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, po_id INTEGER, customer_id INTEGER, amount_due REAL, amount_received REAL DEFAULT 0, balance REAL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS ar_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, amount REAL, payment_date TEXT, payment_mode TEXT, transaction_ref TEXT, recorded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "ALTER TABLE dc_line_items ADD COLUMN invoiced_qty REAL DEFAULT 0",
  "ALTER TABLE delivery_challans ADD COLUMN invoicing_status TEXT DEFAULT 'pending'",
  "ALTER TABLE invoices ADD COLUMN verification_state TEXT",
  "ALTER TABLE purchase_orders ADD COLUMN nt_count INTEGER DEFAULT 0",
  "CREATE TABLE IF NOT EXISTS master_addresses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, addr_line1 TEXT, addr_line2 TEXT, city TEXT, state TEXT, pincode TEXT, landmark TEXT, is_default BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "ALTER TABLE invoice_items ADD COLUMN package_name TEXT",
  "ALTER TABLE invoice_items ADD COLUMN description TEXT",
  "CREATE TABLE IF NOT EXISTS enterprise_audit_trail (id INTEGER PRIMARY KEY AUTOINCREMENT, module_name TEXT, action_type TEXT, performed_by TEXT, reference_id TEXT, old_value TEXT, new_value TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "ALTER TABLE invoices ADD COLUMN signature_hash TEXT",
  "ALTER TABLE invoices ADD COLUMN signed_at DATETIME",
  "ALTER TABLE invoices ADD COLUMN signed_by TEXT",
  "ALTER TABLE invoices ADD COLUMN integrity_status TEXT DEFAULT 'verified'",
  "CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT)",
  "ALTER TABLE invoices ADD COLUMN internal_document_uuid TEXT",
  "ALTER TABLE invoices ADD COLUMN signed_pdf_path TEXT",
  "ALTER TABLE invoices ADD COLUMN pdf_file_hash TEXT",
  "ALTER TABLE invoices ADD COLUMN certificate_serial TEXT",
  "ALTER TABLE invoices ADD COLUMN signer_name TEXT"
];

migrations.forEach(sql => {
  try {
    db.prepare(sql).run();
  } catch(e) {}
});

// Ensure all invoices have internal_document_uuid
try {
  const unsetInvs = db.prepare("SELECT id FROM invoices WHERE internal_document_uuid IS NULL OR internal_document_uuid = ''").all();
  if (unsetInvs.length > 0) {
    const updateStmt = db.prepare("UPDATE invoices SET internal_document_uuid = ? WHERE id = ?");
    unsetInvs.forEach(row => {
      updateStmt.run(crypto.randomUUID(), row.id);
    });
    console.log(`Initialized internal_document_uuid for ${unsetInvs.length} invoices.`);
  }
} catch (uuidErr) {
  console.error("Failed to initialize internal_document_uuid for old invoices:", uuidErr);
}

// --- Routes ---

// One-time status migration for legacy data
try {
  db.prepare("UPDATE dc_requests SET status = 'dc_requested' WHERE status = 'pending'").run();
} catch(e) {}

const seed = () => {
  const rolesCount = db.prepare('SELECT count(*) as count FROM roles').get().count;
  if (rolesCount === 0) {
    const r1 = db.prepare('INSERT INTO roles (name) VALUES (?)').run('accounts');
    const r2 = db.prepare('INSERT INTO roles (name) VALUES (?)').run('stores');
    const r3 = db.prepare('INSERT INTO roles (name) VALUES (?)').run('projects');
  }
};
// --- Seed Accounts User ---
try {
  const accountsUser = db.prepare('SELECT id FROM users WHERE username = ?').get('accounts');
  if (!accountsUser) {
    const hash = bcrypt.hashSync('qwe123', 10);
    const res = db.prepare('INSERT INTO users (username, full_name, password_hash) VALUES (?,?,?)').run('accounts', 'Accounts Department', hash);
    const userId = res.lastInsertRowid;
    
    let roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('accounts')?.id;
    if (!roleId) {
      const r = db.prepare('INSERT INTO roles (name) VALUES (?)').run('accounts');
      roleId = r.lastInsertRowid;
    }
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)').run(userId, roleId);
    console.log('Seeded accounts user successfully');
  }
} catch (err) {
  console.error('Failed to seed accounts user:', err.message);
}

// --- Seed Stores User ---
try {
  const storesUser = db.prepare('SELECT id FROM users WHERE username = ?').get('stores');
  if (!storesUser) {
    const hash = bcrypt.hashSync('qwe123', 10);
    const res = db.prepare('INSERT INTO users (username, full_name, password_hash) VALUES (?,?,?)').run('stores', 'Stores Department', hash);
    const userId = res.lastInsertRowid;
    
    let roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('stores')?.id;
    if (!roleId) {
      const r = db.prepare('INSERT INTO roles (name) VALUES (?)').run('stores');
      roleId = r.lastInsertRowid;
    }
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)').run(userId, roleId);
    console.log('Seeded stores user successfully');
  }
} catch (err) {
  console.error('Failed to seed stores user:', err.message);
}

// --- Seed Projects User ---
try {
  const projectsUser = db.prepare('SELECT id FROM users WHERE username = ?').get('projects');
  if (!projectsUser) {
    const hash = bcrypt.hashSync('qwe123', 10);
    const res = db.prepare('INSERT INTO users (username, full_name, password_hash) VALUES (?,?,?)').run('projects', 'Projects Team', hash);
    const userId = res.lastInsertRowid;
    
    let roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('projects')?.id;
    if (!roleId) {
      const r = db.prepare('INSERT INTO roles (name) VALUES (?)').run('projects');
      roleId = r.lastInsertRowid;
    }
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)').run(userId, roleId);
    console.log('Seeded projects user successfully');
  }
} catch (err) {
  console.error('Failed to seed projects user:', err.message);
}

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

function auditLog(performed_by, action_type, module_name, reference_id, old_value, new_value) {
  try {
    db.prepare(`
      INSERT INTO enterprise_audit_trail (performed_by, action_type, module_name, reference_id, old_value, new_value) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      performed_by, 
      action_type, 
      module_name, 
      String(reference_id), 
      old_value ? JSON.stringify(old_value) : null, 
      new_value ? JSON.stringify(new_value) : null
    );
  } catch(e) { console.error('[Audit Error]', e.message); }
}

function generateInvoiceHash(invoice) {
  const dataToHash = {
    invoice_number: invoice.invoice_number,
    po_no: invoice.po_no,
    items: invoice.items?.map(it => ({
      item_name: it.item_name,
      quantity: it.quantity,
      rate: it.rate,
      taxable_value: it.taxable_value,
      total_value: it.total_value
    })),
    subtotal: invoice.subtotal,
    gst_total: invoice.gst_total,
    grand_total: invoice.grand_total,
    approved_by: invoice.signed_by || 'Accounts',
    timestamp: invoice.signed_at || new Date().toISOString()
  };
  
  return crypto.createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
}

app.get('/api/public/verify-document/:hash', (req, res) => {
  const { hash } = req.params;
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.signature_hash = ? OR i.pdf_file_hash = ?
    `).get(hash, hash);

    if (!invoice) {
      return res.status(404).json({ error: 'Invalid cryptographic signature hash. The document may be forged or altered.' });
    }

    const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(invoice.id);
    res.json({ ...invoice, items });
  } catch (err) {
    console.error('Public verification error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id/pdf
app.get('/api/invoices/:id/pdf', authenticate, async (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT 
        i.*,
        c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
        c.gstin as customer_gstin, c.address_line1 as customer_address,
        p.po_number as po_no, p.po_date
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Generate internal_document_uuid if missing
    if (!invoice.internal_document_uuid) {
      invoice.internal_document_uuid = crypto.randomUUID();
      db.prepare("UPDATE invoices SET internal_document_uuid = ? WHERE id = ?").run(invoice.internal_document_uuid, invoice.id);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id);
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);

    let pdfPath = invoice.signed_pdf_path;
    let absolutePath = pdfPath ? path.join(__dirname, pdfPath) : null;

    if (absolutePath && fs.existsSync(absolutePath) && req.query.regenerate !== 'true') {
      const fileBytes = fs.readFileSync(absolutePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice.invoice_number.replace(/\//g, '_')}.pdf`);
      return res.send(fileBytes);
    }

    try {
      // 1. Generate PDF
      let frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl) {
        const referer = req.headers['referer'];
        if (referer) {
          try {
            const parsedUrl = new URL(referer);
            frontendUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
          } catch (e) {
            console.error('Failed to parse referer URL:', e);
          }
        }
      }
      if (!frontendUrl) {
        const host = req.get('host') || 'localhost:5000';
        const hostname = host.split(':')[0];
        if (host.includes(':')) {
          frontendUrl = `${req.protocol}://${hostname}:5173`;
        } else {
          frontendUrl = `${req.protocol}://${host}`;
        }
      }
      const pdfDoc = await generateInvoicePDFBuffer(invoice, items, customer, frontendUrl);

      // 2. Sign PDF
      const signedResult = await signInvoicePDF(pdfDoc, invoice.id, invoice.invoice_number);

      // 3. Update DB with signing details
      db.prepare(`
        UPDATE invoices SET
          signed_pdf_path = ?,
          pdf_file_hash = ?,
          certificate_serial = ?,
          signer_name = ?
        WHERE id = ?
      `).run(
        signedResult.relativePath,
        signedResult.hash,
        signedResult.certificateSerial,
        signedResult.signerName,
        invoice.id
      );

      // 4. Send PDF bytes
      const fileBytes = fs.readFileSync(signedResult.absolutePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice.invoice_number.replace(/\//g, '_')}.pdf`);
      return res.send(fileBytes);
    } catch (pdfErr) {
      console.error('[PDF Route] Error generating/signing PDF:', pdfErr);
      return res.status(500).json({ error: 'Failed to generate signed PDF' });
    }
  } catch (err) {
    console.error('ERROR in /api/invoices/:id/pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/verify-pdf
app.post('/api/public/verify-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  try {
    const pdfBuffer = fs.readFileSync(req.file.path);

    // Clean up temp uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.error('Failed to remove temp uploaded verification file:', unlinkErr);
    }

    // 1. Cryptographically verify signature
    const verification = verifyInvoicePDF(pdfBuffer);
    const signaturePresent = verification.details !== null;

    // 2. Extract watermark metadata
    const watermark = await extractWatermarkMetadata(pdfBuffer);

    let dbInvoice = null;
    if (watermark && watermark.invoice_id) {
      dbInvoice = db.prepare(`
        SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
               c.gstin as customer_gstin, c.address_line1 as customer_address,
               p.po_number as po_no, p.po_date
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN purchase_orders p ON i.po_id = p.id
        WHERE i.id = ?
      `).get(watermark.invoice_id);

      if (dbInvoice) {
        dbInvoice.items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(dbInvoice.id);
      }
    }

    // 3. Extract grand total from PDF text using pdf-parse to detect visual tampering
    let pdfGrandTotal = null;
    let pdfGrandTotalStr = null;
    try {
      const pdfData = await pdfParse(pdfBuffer);
      const text = pdfData.text;
      const regex = /Grand\s+Total:\s*(?:INR\s*)?([\d,]+\.\d{2})/i;
      const match = text.match(regex);
      if (match) {
        pdfGrandTotalStr = match[1];
        pdfGrandTotal = parseFloat(match[1].replace(/,/g, ''));
      }
    } catch (parseErr) {
      console.error('[Verify PDF] Error parsing PDF text:', parseErr.message);
    }

    // Compute file hash
    const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    let hashMatched = verification.valid;

    if (dbInvoice && dbInvoice.pdf_file_hash) {
      hashMatched = (dbInvoice.pdf_file_hash === fileHash);
    }

    // Determine overall validity
    const overallValid = verification.valid && hashMatched;
    let finalMessage = verification.message;
    if (signaturePresent && !hashMatched) {
      finalMessage = 'WARNING: Document has been tampered with or modified after the digital signature was applied! The cryptographic seal is broken.';
    }

    // If UUIDs mismatch, the document is counterfeit
    if (dbInvoice && watermark && dbInvoice.internal_document_uuid !== watermark.uuid) {
      return res.json({
        valid: false,
        signaturePresent,
        hashMatched: false,
        message: 'Document verification failed: The internal metadata token does not match the ledger database.',
        pdfGrandTotal,
        pdfGrandTotalStr: pdfGrandTotalStr ? `INR ${pdfGrandTotalStr}` : null,
        invoice: null,
        details: null
      });
    }

    return res.json({
      valid: overallValid,
      signaturePresent,
      hashMatched,
      message: finalMessage,
      pdfGrandTotal,
      pdfGrandTotalStr: pdfGrandTotalStr ? `INR ${pdfGrandTotalStr}` : null,
      invoice: dbInvoice,
      details: verification.details
    });
  } catch (err) {
    console.error('ERROR in /api/public/verify-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/verify-qr
app.get('/api/public/verify-qr', (req, res) => {
  const { invoice_id, token } = req.query;
  if (!invoice_id || !token) {
    return res.status(400).json({ error: 'invoice_id and token query parameters are required' });
  }

  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             c.gstin as customer_gstin, c.address_line1 as customer_address,
             p.po_number as po_no, p.po_date
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      WHERE i.id = ?
    `).get(invoice_id);

    if (!invoice) {
      return res.status(404).json({ valid: false, message: 'QR Code Verification failed. Invoice not found.' });
    }

    if (invoice.internal_document_uuid !== token) {
      return res.status(404).json({ valid: false, message: 'QR Code Verification failed. Token mismatch.' });
    }

    invoice.items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(invoice.id);

    return res.json({
      valid: true,
      message: 'QR Code Verification Successful: The document is authentic.',
      invoice
    });
  } catch (err) {
    console.error('ERROR in /api/public/verify-qr:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs/:module/:id', authenticate, (req, res) => {
  const { module, id } = req.params;
  try {
    const logs = db.prepare(`
      SELECT * FROM enterprise_audit_trail 
      WHERE module_name = ? AND reference_id = ? 
      ORDER BY timestamp DESC
    `).all(module, id);
    res.json(logs);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Global Settings API ---
app.get('/api/global-settings/:key', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM global_settings WHERE key = ?').get(req.params.key);
    res.json({ value: row ? row.value : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/global-settings/:key', authenticate, (req, res) => {
  const { value } = req.body;
  try {
    db.prepare('INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(req.params.key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Master Addresses API ---
app.get('/api/master-addresses', authenticate, (req, res) => {
  try {
    const addresses = db.prepare("SELECT * FROM master_addresses ORDER BY created_at DESC").all();
    res.json(addresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-addresses', requireRole(['admin']), (req, res) => {
  console.log('POST /api/master-addresses hit by', req.user.username);
  const { name, addr_line1, addr_line2, city, state, pincode, landmark, is_default } = req.body;
  try {
    if (is_default) {
      db.prepare("UPDATE master_addresses SET is_default = 0").run();
    }
    const info = db.prepare("INSERT INTO master_addresses (name, addr_line1, addr_line2, city, state, pincode, landmark, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(name, addr_line1, addr_line2, city, state, pincode, landmark, is_default ? 1 : 0);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/master-addresses/:id', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { name, addr_line1, addr_line2, city, state, pincode, landmark, is_default } = req.body;
  try {
    if (is_default) {
      db.prepare("UPDATE master_addresses SET is_default = 0").run();
    }
    db.prepare(`
      UPDATE master_addresses 
      SET name = ?, addr_line1 = ?, addr_line2 = ?, city = ?, state = ?, pincode = ?, landmark = ?, is_default = ?
      WHERE id = ?
    `).run(name, addr_line1, addr_line2, city, state, pincode, landmark, is_default ? 1 : 0, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/master-addresses/:id', requireRole(['admin']), (req, res) => {
  try {
    db.prepare("DELETE FROM master_addresses WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Login ---
app.post('/api/login', (req, res) => {
  let { username, password } = req.body;
  username = username?.toLowerCase().trim();
  password = password?.trim();
  try {
    const user = db.prepare(`SELECT u.id, u.username, u.full_name, u.password_hash, r.name as role
      FROM users u JOIN user_roles ur ON u.id=ur.user_id JOIN roles r ON ur.role_id=r.id WHERE u.username=?`).get(username);
    
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/me', authenticate, (req, res) => res.json(req.user));

// --- Global Search ---
app.get('/api/search', authenticate, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  
  try {
    const searchVal = `%${q}%`;
    
    // Search Purchase Orders
    const pos = db.prepare(`
      SELECT id, po_number as title, 'Purchase Order' as type, '/pos/' || id as link
      FROM purchase_orders 
      WHERE po_number LIKE ? 
      LIMIT 5
    `).all(searchVal);
    
    // Search Customers
    const customers = db.prepare(`
      SELECT id, name as title, 'Customer' as type, '/customers/' || id || '/edit' as link
      FROM customers
      WHERE name LIKE ? OR cust_code LIKE ?
      LIMIT 5
    `).all(searchVal, searchVal);

    // Search DC Requests
    const dcRequests = db.prepare(`
      SELECT id, requested_dc_number as title, 'DC Request' as type, '/dc-request' as link
      FROM dc_requests
      WHERE requested_dc_number LIKE ?
      LIMIT 5
    `).all(searchVal);

    res.json([...pos, ...customers, ...dcRequests]);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

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
      pending_invoice_requests: db.prepare(`SELECT COUNT(*) as c FROM delivery_challans WHERE delivery_status = 'delivery_confirmed'`).get().c,
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

    const existingGST = db.prepare('SELECT id FROM customers WHERE gstin = ?').get(gstin);
    if (existingGST) return res.status(400).json({ error: 'GSTIN already exists for another customer' });

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

app.delete('/api/customers/:id', requireRole(['admin']), (req, res) => {
  console.log('DELETE REQUEST FOR CUSTOMER:', req.params.id);
  const customerId = req.params.id;
  try {
    const deleteTx = db.transaction(() => {
      const poIds = db.prepare('SELECT id FROM purchase_orders WHERE customer_id = ?').all(customerId).map(r => r.id);
      const dcIds = db.prepare('SELECT id FROM delivery_challans WHERE customer_id = ?').all(customerId).map(r => r.id);
      const invoiceIds = db.prepare('SELECT id FROM invoices WHERE customer_id = ?').all(customerId).map(r => r.id);
      const invoiceReqIds = poIds.length > 0 ? db.prepare(`SELECT id FROM invoice_requests WHERE po_id IN (${poIds.map(()=>'?').join(',')})`).all(...poIds).map(r => r.id) : [];
      const dcReqIds = poIds.length > 0 ? db.prepare(`SELECT id FROM dc_requests WHERE po_id IN (${poIds.map(()=>'?').join(',')})`).all(...poIds).map(r => r.id) : [];

      // 1. Finance / AR (Top of the chain)
      if (invoiceIds.length > 0) {
        const placeholders = invoiceIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM ar_receipts WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch(e){}
        try { db.prepare(`DELETE FROM ar_payments WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch(e){}
        try { db.prepare(`DELETE FROM ar_entries WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch(e){}
        try { db.prepare(`DELETE FROM invoice_items WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch(e){}
      }
      try { db.prepare('DELETE FROM ar_entries WHERE customer_id = ?').run(customerId); } catch(e){}
      try { db.prepare('DELETE FROM ar_receipts WHERE customer_id = ?').run(customerId); } catch(e){}

      // 2. Invoices & Requests
      if (invoiceReqIds.length > 0) {
        const placeholders = invoiceReqIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM invoice_request_dcs WHERE invoice_request_id IN (${placeholders})`).run(...invoiceReqIds); } catch(e){}
      }
      if (dcIds.length > 0) {
        const placeholders = dcIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM invoice_request_dcs WHERE dc_id IN (${placeholders})`).run(...dcIds); } catch(e){}
      }
      db.prepare('DELETE FROM invoices WHERE customer_id = ?').run(customerId);
      if (poIds.length > 0) {
        const placeholders = poIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM invoice_requests WHERE po_id IN (${placeholders})`).run(...poIds); } catch(e){}
      }

      // 3. Logistics / DC
      if (dcIds.length > 0) {
        const placeholders = dcIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM dc_line_items WHERE dc_id IN (${placeholders})`).run(...dcIds); } catch(e){}
        try { db.prepare(`DELETE FROM delivery_challan_items WHERE dc_id IN (${placeholders})`).run(...dcIds); } catch(e){}
      }
      db.prepare('DELETE FROM delivery_challans WHERE customer_id = ?').run(customerId);

      if (dcReqIds.length > 0) {
        const placeholders = dcReqIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM dc_request_items WHERE dc_request_id IN (${placeholders})`).run(...dcReqIds); } catch(e){}
        try { db.prepare(`DELETE FROM dc_requests WHERE id IN (${placeholders})`).run(...dcReqIds); } catch(e){}
      }

      // 4. Orders / PO
      if (poIds.length > 0) {
        const placeholders = poIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM po_version_history WHERE po_id IN (${placeholders})`).run(...poIds); } catch(e){}
        try { db.prepare(`DELETE FROM po_line_items WHERE po_id IN (${placeholders})`).run(...poIds); } catch(e){}
        
        // Break all self-references
        db.prepare('UPDATE purchase_orders SET parent_po_id = NULL, linked_po_id = NULL WHERE customer_id = ?').run(customerId);
        db.prepare(`DELETE FROM purchase_orders WHERE id IN (${placeholders})`).run(...poIds);
      }

      // 5. Master Data
      db.prepare('DELETE FROM customer_locations WHERE customer_id = ?').run(customerId);
      db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
      
      return true;
    });

    deleteTx();
    auditLog(req.user.username, 'DELETE', 'Customer', customerId, { note: 'Hard delete (cascading)' }, null);
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    console.error('DELETE ERROR:', err);
    res.status(500).json({ error: 'Failed: ' + err.message });
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

    const existingCode = db.prepare('SELECT id FROM customers WHERE cust_code = ? AND id != ?').get(cust_code, req.params.id);
    if (existingCode) return res.status(400).json({ error: 'Customer ID already exists' });

    const existingGST = db.prepare('SELECT id FROM customers WHERE gstin = ? AND id != ?').get(gstin, req.params.id);
    if (existingGST) return res.status(400).json({ error: 'GSTIN already exists for another customer' });

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
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        cl.address_line1 as location_address,
        cl.address_line2 as location_address2,
        cl.address_line3 as location_address3,
        cl.city as location_city,
        cl.state as location_state,
        cl.pincode as location_pincode,
        cl.gstin as location_gstin,
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
        cl.address_line1 as location_address,
        cl.address_line2 as location_address2,
        cl.address_line3 as location_address3,
        cl.city as location_city,
        cl.state as location_state,
        cl.pincode as location_pincode,
        CASE 
          WHEN cl.gst_is_different = 1 THEN cl.gstin 
          ELSE c.gstin 
        END as location_gstin,
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

app.get('/api/pos/check-unique', authenticate, (req, res) => {
  const { po_number } = req.query;
  if (!po_number) return res.status(400).json({ error: 'po_number is required' });
  try {
    const existing = db.prepare('SELECT id FROM purchase_orders WHERE po_number = ?').get(po_number);
    res.json({ unique: !existing });
  } catch (err) {
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
    ).get(po_number);
    if (existing) {
      return res.status(400).json({ error: 'Purchase Order number already exists in the system.' });
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
    auditLog(req.user.username, 'CREATE', 'PurchaseOrder', poId, null, req.body);

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
    const statusToUpdate = status === 'approved' ? 'accepted' : status;
    if (!valid.includes(statusToUpdate)) {
      return res.status(400).json({ error: 'Invalid status: ' + status });
    }
    db.prepare(
      'UPDATE purchase_orders SET status = ? WHERE id = ?'
    ).run(statusToUpdate, req.params.id);
    res.json({ success: true, status: statusToUpdate });
  } catch (err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pos/:id', requireRole(['sales','admin','accounts','management']), (req, res) => {
  const { status, items } = req.body;
  try {
    db.exec('BEGIN');
    const oldPO = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(req.params.id);
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
    auditLog(req.user.username, 'UPDATE', 'PurchaseOrder', req.params.id, oldPO, req.body);
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
    auditLog(req.user.username, 'DELETE', 'PurchaseOrder', req.params.id, { note: 'Hard delete (cascading)' }, null);
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
    const { 
      po_id, dc_id, customer_id, invoice_date, due_date, notes, 
      subtotal, gst_total, grand_total, 
      place_of_supply, payment_terms, billing_address, shipping_address,
      items 
    } = req.body;
    
    const userRole = req.user.role?.toLowerCase();
    const isAccountsOrAdmin = userRole === 'accounts' || userRole === 'admin';
    
    let invoice_number;
    let initialStatus;

    if (isAccountsOrAdmin) {
      // Generate official INV number
      const lastInv = db.prepare("SELECT invoice_number FROM invoices WHERE status != 'requested' AND invoice_number LIKE 'INV/%' ORDER BY id DESC LIMIT 1").get();
      let nextNum = 1;
      if (lastInv && lastInv.invoice_number) {
        const parts = lastInv.invoice_number.split('/');
        if (parts.length >= 3) {
          nextNum = parseInt(parts[2]) + 1;
        }
      }
      invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;
      initialStatus = 'raised';
    } else {
      // Generate REQ number
      invoice_number = 'REQ/' + new Date().getFullYear() + '/' + String(Date.now()).slice(-4);
      initialStatus = 'requested';
    }

    // Filter to only include items with quantity > 0
    const validItems = (items || []).filter(it => it.quantity > 0);
    if (validItems.length === 0) {
      return res.status(400).json({ error: 'Cannot create invoice with zero billable quantity' });
    }

    // Backend validation: Check if requested_qty > remaining_qty
    for (const it of validItems) {
      if (it.dc_line_item_id) {
         const dcItem = db.prepare('SELECT quantity_dispatched, received_qty, invoiced_qty FROM dc_line_items WHERE id = ?').get(it.dc_line_item_id);
         if (dcItem) {
           const delivered = parseFloat(dcItem.received_qty ?? dcItem.quantity_dispatched) || 0;
           const invoiced = parseFloat(dcItem.invoiced_qty) || 0;
           const remaining = Math.max(0, delivered - invoiced);
           if (it.quantity > remaining) {
             return res.status(400).json({ error: `Invoice quantity (${it.quantity}) exceeds remaining billable quantity (${remaining}) for item ${it.item_name}` });
           }
         }
      }
    }

    const docUuid = crypto.randomUUID();

    db.exec('BEGIN');
    const invResult = db.prepare(`
      INSERT INTO invoices (
        invoice_number, po_id, dc_id, customer_id,
        status, invoice_date, due_date, notes,
        subtotal, gst_total, grand_total, 
        place_of_supply, payment_terms, billing_address, shipping_address,
        created_by, internal_document_uuid
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      invoice_number, po_id, dc_id, customer_id,
      initialStatus, invoice_date, due_date||null, notes||'',
      subtotal||0, gst_total||0, grand_total||0,
      place_of_supply || '', payment_terms || '', billing_address || '', shipping_address || '',
      req.user.id, docUuid
    );

    const invoiceId = invResult.lastInsertRowid;

    // Persist Invoice Items and Update DC Item Tracking
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, po_line_item_id, dc_line_item_id, 
        package_name, item_name, description, quantity, rate, gst_percent, 
        taxable_value, gst_amount, total_value
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const updateDCItemStmt = db.prepare(`
      UPDATE dc_line_items 
      SET invoiced_qty = IFNULL(invoiced_qty, 0) + ? 
      WHERE id = ?
    `);

    (validItems).forEach(it => {
      itemStmt.run(
        invoiceId, it.po_line_item_id, it.dc_line_item_id,
        it.package_name || '-', it.item_name, it.description || '',
        it.quantity, it.rate_per_unit, it.gst_percent,
        it.taxable_value, it.gst_amount, it.total_value
      );
      
      if (it.dc_line_item_id) {
        updateDCItemStmt.run(it.quantity, it.dc_line_item_id);
      }
    });

    // Check DC Invoicing Status
    if (dc_id) {
      const dcItems = db.prepare('SELECT quantity_dispatched, received_qty, invoiced_qty FROM dc_line_items WHERE dc_id = ?').all(dc_id);
      const isFullyInvoiced = dcItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.received_qty ?? item.quantity_dispatched) || 0));
      const isPartiallyInvoiced = dcItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);
      
      let invStatus = 'pending';
      if (isFullyInvoiced) invStatus = 'fully_invoiced';
      else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

      db.prepare(`
        UPDATE delivery_challans 
        SET status = ?, invoicing_status = ?
        WHERE id = ?
      `).run(isFullyInvoiced ? 'fully_invoiced' : 'partially_invoiced', invStatus, dc_id);
    }

    if (initialStatus === 'raised') {
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
    }

    db.exec('COMMIT');
    auditLog(req.user.username, initialStatus === 'raised' ? 'CREATE' : 'REQUEST', 'Invoice', invoiceId, null, { invoice_number, grand_total });
    res.json({ success: true, invoice_number, id: invoiceId });
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
        d.dc_number,
        ar.amount_received,
        ar.balance,
        ar.status as ar_status
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      LEFT JOIN delivery_challans d ON i.dc_id = d.id
      LEFT JOIN ar_entries ar ON i.id = ar.invoice_id
      ORDER BY i.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices/:id', authenticate, (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT 
        i.*,
        c.name as customer_name, c.legal_name as customer_legal_name, c.gstin as customer_gstin,
        c.pan as customer_pan,
        p.po_number as po_no, p.po_date,
        d.dc_number as dc_no, d.dispatch_date,
        ar.amount_received, ar.balance, ar.status as ar_status
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      LEFT JOIN delivery_challans d ON i.dc_id = d.id
      LEFT JOIN ar_entries ar ON i.id = ar.invoice_id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(req.params.id);
    const payments = db.prepare(`SELECT * FROM ar_payments WHERE invoice_id = ? ORDER BY created_at DESC`).all(req.params.id);

    let is_tampered = false;
    if (invoice.signature_hash) {
      const currentHash = generateInvoiceHash({ ...invoice, items });
      if (currentHash !== invoice.signature_hash) {
        is_tampered = true;
        auditLog('SYSTEM', 'TAMPER_DETECTED', 'Invoice', invoice.id, { stored: invoice.signature_hash, current: currentHash }, null);
      }
    }

    res.json({ ...invoice, items, payments, is_tampered });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pos/:id/payments', authenticate, (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT 
        p.*,
        i.invoice_number
      FROM ar_payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i.po_id = ?
      ORDER BY p.payment_date DESC
    `).all(req.params.id);
    res.json(payments);
  } catch (err) {
    console.error('ERROR in /api/pos/:id/payments:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pos/:id/invoices', authenticate, (req, res) => {
  try {
    const invoices = db.prepare(`
      SELECT 
        i.*,
        d.dc_number
      FROM invoices i
      LEFT JOIN delivery_challans d ON i.dc_id = d.id
      WHERE i.po_id = ? AND i.status != 'rejected'
      ORDER BY i.invoice_date DESC
    `).all(req.params.id);
    res.json(invoices);
  } catch (err) {
    console.error('ERROR in /api/pos/:id/invoices:', err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/pos/:id/supplied-details', authenticate, (req, res) => {
  try {
    const details = db.prepare(`
      SELECT 
        dc.dc_number,
        dc.manual_dc_number,
        dc.dispatch_date,
        dc.status,
        dc.delivery_status,
        dc.vehicle_no,
        SUM(dli.quantity_dispatched) as total_qty,
        SUM(dli.quantity_dispatched * (
          CASE 
            WHEN pli.supply_qty > 0 THEN (pli.total_supply / pli.supply_qty)
            WHEN pli.service_qty > 0 THEN (pli.total_service / pli.service_qty)
            ELSE 0 
          END
        )) as total_value
      FROM delivery_challans dc
      JOIN dc_line_items dli ON dc.id = dli.dc_id
      JOIN po_line_items pli ON dli.po_line_item_id = pli.id
      WHERE dc.po_id = ? AND dc.status != 'cancelled'
      GROUP BY dc.id
      ORDER BY dc.dispatch_date DESC
    `).all(req.params.id);
    res.json(details);
  } catch (err) {
    console.error('ERROR in /api/pos/:id/supplied-details:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pos/:id/pending-details', authenticate, (req, res) => {
  try {
    const details = db.prepare(`
      SELECT 
        pli.item_name,
        pli.package_name,
        pli.description,
        pli.supply_qty,
        pli.qty_delivered,
        (pli.supply_qty - pli.qty_delivered) as pending_qty,
        (CASE 
          WHEN pli.supply_qty > 0 THEN (pli.total_supply / pli.supply_qty)
          WHEN pli.service_qty > 0 THEN (pli.total_service / pli.service_qty)
          ELSE 0 
        END) as rate,
        (pli.supply_qty - pli.qty_delivered) * (CASE 
          WHEN pli.supply_qty > 0 THEN (pli.total_supply / pli.supply_qty)
          WHEN pli.service_qty > 0 THEN (pli.total_service / pli.service_qty)
          ELSE 0 
        END) as pending_value
      FROM po_line_items pli
      WHERE pli.po_id = ? AND (pli.supply_qty - pli.qty_delivered) > 0
      ORDER BY pli.line_number ASC
    `).all(req.params.id);
    res.json(details);
  } catch (err) {
    console.error('ERROR in /api/pos/:id/pending-details:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/approve', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    db.exec('BEGIN');
    // Robust Next Number Logic
    const allInvs = db.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'INV/%'").all();
    let maxNum = 0;
    allInvs.forEach(inv => {
      const parts = inv.invoice_number.split('/');
      const numPart = parts[parts.length - 1];
      const n = parseInt(numPart);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });

    let nextNum = maxNum + 1;
    let invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;

    // Collision check loop (safety belt)
    while (db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number)) {
      nextNum++;
      invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;
    }

    // Fetch global signature to stamp on the approved invoice
    let globalSig = null;
    try {
      const sigRow = db.prepare("SELECT value FROM global_settings WHERE key = 'authorized_signature'").get();
      if (sigRow) globalSig = sigRow.value;
    } catch(e) {}

    db.prepare("UPDATE invoices SET invoice_number = ?, status = 'raised', signature_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice_number, globalSig, id);
    
    // Phase 3: Hashing for integrity
    const invoiceFull = db.prepare(`
      SELECT i.*, p.po_number as po_no, p.po_date 
      FROM invoices i
      JOIN purchase_orders p ON i.po_id = p.id
      WHERE i.id = ?
    `).get(id);
    invoiceFull.items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(id);
    invoiceFull.signed_by = req.user.username;
    invoiceFull.signed_at = new Date().toISOString();
    
    const hash = generateInvoiceHash(invoiceFull);
    db.prepare("UPDATE invoices SET signature_hash = ?, signed_at = ?, signed_by = ?, integrity_status = 'verified' WHERE id = ?")
      .run(hash, invoiceFull.signed_at, invoiceFull.signed_by, id);

    auditLog(req.user.username, 'APPROVE', 'Invoice', id, null, { invoice_number, hash });
    
    // Insert into AR database (if not already exists)
    const existingAR = db.prepare("SELECT id FROM ar_entries WHERE invoice_id = ?").get(id);
    if (!existingAR) {
      const invData = db.prepare("SELECT po_id, customer_id, grand_total FROM invoices WHERE id = ?").get(id);
      if (invData) {
        db.prepare("INSERT INTO ar_entries (invoice_id, po_id, customer_id, amount_due, amount_received, balance, status) VALUES (?,?,?,?,?,?,?)").run(
          id, invData.po_id, invData.customer_id, invData.grand_total, 0, invData.grand_total, 'pending'
        );
      }
    }
    
    db.exec('COMMIT');
    res.json({ success: true, invoice_number });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/reject', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("UPDATE invoices SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/invoices/:id/draft', authenticate, (req, res) => {
  const { id } = req.params;
  const { verification_state, notes } = req.body;
  try {
    const inv = db.prepare("SELECT status FROM invoices WHERE id = ?").get(id);
    if (inv && inv.status !== 'requested') {
      return res.status(403).json({ error: 'Cannot modify an approved/locked invoice.' });
    }
    db.prepare("UPDATE invoices SET verification_state = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(verification_state ? JSON.stringify(verification_state) : null, notes, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/payment', authenticate, (req, res) => {
  const { amount, payment_date, payment_mode, transaction_ref } = req.body;
  const invoiceId = req.params.id;

  try {
    db.exec('BEGIN');
    
    // 1. Record payment
    db.prepare(`
      INSERT INTO ar_payments (invoice_id, amount, payment_date, payment_mode, transaction_ref, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(invoiceId, amount, payment_date, payment_mode, transaction_ref, req.user.id);

    // 2. Update AR Entry
    const ar = db.prepare('SELECT * FROM ar_entries WHERE invoice_id = ?').get(invoiceId);
    if (ar) {
      const newReceived = (ar.amount_received || 0) + parseFloat(amount);
      const newBalance = ar.amount_due - newReceived;
      const newStatus = newBalance <= 0 ? 'paid' : (newReceived > 0 ? 'partial' : 'pending');

      db.prepare(`
        UPDATE ar_entries 
        SET amount_received = ?, balance = ?, status = ?
        WHERE invoice_id = ?
      `).run(newReceived, newBalance, newStatus, invoiceId);

      // 3. Update Invoice Status
      db.prepare(`UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(newStatus === 'paid' ? 'paid' : (newStatus === 'partial' ? 'partially_paid' : 'sent'), invoiceId);
    }

    db.exec('COMMIT');
    auditLog(req.user.username, 'PAYMENT', 'Invoice', invoiceId, null, req.body);
    res.json({ success: true });
  } catch(err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/signature', authenticate, (req, res) => {
  const { id } = req.params;
  const { signature_data } = req.body;
  try {
    db.prepare('UPDATE invoices SET signature_data = ? WHERE id = ?').run(signature_data, id);
    auditLog(req.user.username, 'SIGN', 'Invoice', id, null, { note: 'Applied signature' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices/ar/entries', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        ar.*,
        i.invoice_number, i.invoice_date, i.due_date,
        c.name as customer_name,
        p.po_number
      FROM ar_entries ar
      JOIN invoices i ON ar.invoice_id = i.id
      JOIN customers c ON ar.customer_id = c.id
      JOIN purchase_orders p ON ar.po_id = p.id
      ORDER BY ar.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
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
        driver_name, notes, created_by,
        dc_request_id, manual_dc_number,
        delivery_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      dc_number, po_id, customer_id, location_id,
      'issued', dc_date, vehicle_number||'',
      driver_name||'', notes||'', req.user.id,
      requestId, manualDC || null,
      'awaiting_confirmation'
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
        d.*,
        p.po_number as po_no,
        c.name as customer_name,
        cl.label as location_name,
        cl.city as location_city,
        dr.dc_request_no,
        i.id as invoice_id,
        i.invoice_number
      FROM delivery_challans d
      LEFT JOIN purchase_orders p ON d.po_id = p.id
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN customer_locations cl ON d.customer_location_id = cl.id
      LEFT JOIN dc_requests dr ON d.dc_request_id = dr.id
      LEFT JOIN invoices i ON i.dc_id = d.id
      ORDER BY d.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('GET /api/dc ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dc/:id', authenticate, (req, res) => {
  try {
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
    `).get(req.params.id);

    if (!dc) return res.status(404).json({ error: 'DC not found' });

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
        pi.supply_rate as unit_price,
        pi.supply_gst_rate as gst_rate,
        pi.total_taxable as po_taxable_value,
        pi.total_gst as po_gst_amount,
        pi.total_invoice as po_total_amount
      FROM dc_line_items di
      LEFT JOIN po_line_items pi ON di.po_line_item_id = pi.id
      WHERE di.dc_id = ?
    `).all(req.params.id);

    res.json({ ...dc, items });
  } catch(err) {
    console.error('GET /api/dc/:id ERROR:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});
app.post('/api/dc/:id/confirm-delivery', authenticate, upload.fields([
  { name: 'pod', maxCount: 1 },
  { name: 'signed_dc', maxCount: 1 },
  { name: 'grn', maxCount: 1 },
  { name: 'photos', maxCount: 5 }
]), (req, res) => {
  const dcId = req.params.id;
  const { 
    receivedBy, phone, designation, 
    siteRemarks, damageRemarks, shortageRemarks,
    items // JSON string of [{id, received_qty, condition}]
  } = req.body;

  try {
    const parsedItems = JSON.parse(items || '[]');

    
    // Start Transaction
    const transaction = db.transaction(() => {
      // 1. Update DC Status and Acknowledgement info
      db.prepare(`
        UPDATE delivery_challans 
        SET 
          status = 'delivery_confirmed',
          delivery_status = 'delivery_confirmed',
          received_by = ?,
          receiver_phone = ?,
          receiver_designation = ?,
          site_remarks = ?,
          damage_remarks = ?,
          shortage_remarks = ?,
          pod_path = ?,
          signed_dc_path = ?,
          grn_path = ?,
          delivery_confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        receivedBy, phone, designation, 
        siteRemarks, damageRemarks, shortageRemarks,
        req.files['pod'] ? `/uploads/${req.files['pod'][0].filename}` : null,
        req.files['signed_dc'] ? `/uploads/${req.files['signed_dc'][0].filename}` : null,
        req.files['grn'] ? `/uploads/${req.files['grn'][0].filename}` : null,
        dcId
      );

      // 2. Update item-level verification
      const updateItem = db.prepare(`
        UPDATE dc_line_items 
        SET received_qty = ?, item_condition = ?
        WHERE id = ?
      `);

      for (const item of parsedItems) {
        updateItem.run(item.received_qty, item.condition, item.id);
      }
    });

    transaction();
    res.json({ success: true, message: 'Delivery confirmed successfully' });
  } catch(err) {
    console.error('CONFIRM DELIVERY ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/dc/:id/sign', authenticate, (req, res) => {
  const { signature } = req.body;
  try {
    db.prepare('UPDATE delivery_challans SET signature_data = ? WHERE id = ?').run(signature, req.params.id);
    res.json({ success: true });
  } catch (err) {
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

app.get('/api/dc-requests/pos', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        p.id, p.po_number as po, c.name as customer, c.cust_code, p.customer_id, p.grand_total,
        cl.label as location_label, cl.city
      FROM purchase_orders p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN customer_locations cl ON p.location_id = cl.id
      WHERE p.status IN ('accepted', 'dc_raised')
      AND (
        SELECT SUM(MAX(0, pli.supply_qty - pli.qty_delivered))
        FROM po_line_items pli
        WHERE pli.po_id = p.id
      ) > 0
      ORDER BY p.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

    // Ensure tables exist with new schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS dc_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        po_id INTEGER, 
        location_id INTEGER,
        dc_request_no TEXT, 
        dispatch_date TEXT, 
        status TEXT DEFAULT 'dc_requested', 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        transporter TEXT, 
        special_instructions TEXT,
        vehicle_no TEXT,
        driver_name TEXT,
        driver_phone TEXT,
        dispatch_from_address1 TEXT,
        dispatch_from_address2 TEXT,
        dispatch_from_pincode TEXT,
        dispatch_from_landmark TEXT,
        requested_dc_number TEXT,
        is_manual_dc BOOLEAN DEFAULT 0,
        proof_path TEXT,
        logistics_remarks TEXT
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS dc_request_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        dc_request_id INTEGER, 
        line_item_id INTEGER, 
        qty REAL
      )
    `);

app.post('/api/dc-requests', authenticate, upload.single('proof'), (req, res) => {
  try {
    const { 
      po_id, location_id, dispatch_date, transporter, special_instructions, items,
      vehicle_no, driver_name, driver_phone,
      dispatch_from_line1, dispatch_from_line2, dispatch_from_pin, dispatch_from_landmark,
      requested_dc_number, is_manual_dc, logistics_remarks
    } = req.body;
    
    // items will be a JSON string if using FormData
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    if (!po_id || !location_id || !parsedItems || parsedItems.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: po_id, location_id, or items' });
    }

    const lastDCR = db.prepare('SELECT dc_request_no FROM dc_requests ORDER BY id DESC LIMIT 1').get();
    let nextNum = 1;
    if (lastDCR && lastDCR.dc_request_no && lastDCR.dc_request_no.startsWith('DCR/')) {
      const parts = lastDCR.dc_request_no.split('/');
      nextNum = parseInt(parts[parts.length - 1]) + 1;
    }
    const dc_request_no = `DCR/2026/${String(nextNum).padStart(3, '0')}`;
    const proofPath = req.file ? `/uploads/${req.file.filename}` : null;
    
    const result = db.prepare(`
      INSERT INTO dc_requests (
        po_id, location_id, dc_request_no, dispatch_date, transporter, 
        special_instructions, status,
        vehicle_no, driver_name, driver_phone,
        dispatch_from_address1, dispatch_from_address2, dispatch_from_pincode, dispatch_from_landmark,
        requested_dc_number, is_manual_dc, proof_path, logistics_remarks
      )
      VALUES (?, ?, ?, ?, ?, ?, 'dc_requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      po_id, location_id, dc_request_no, dispatch_date || '', transporter || '', 
      special_instructions || '',
      vehicle_no || '', driver_name || '', driver_phone || '',
      dispatch_from_line1 || '', dispatch_from_line2 || '', dispatch_from_pin || '', dispatch_from_landmark || '',
      requested_dc_number || '', (is_manual_dc === 'true' || is_manual_dc === true) ? 1 : 0,
      proofPath, logistics_remarks || ''
    );
    
    const dc_request_id = result.lastInsertRowid;
    const insertItem = db.prepare(`INSERT INTO dc_request_items (dc_request_id, line_item_id, qty) VALUES (?, ?, ?)`);
    
    for (const item of parsedItems) {
      insertItem.run(dc_request_id, item.line_item_id, item.qty);
    }
    
    res.json({ success: true, dc_request: dc_request_no, id: dc_request_id });
  } catch(err) {
    console.error('ERROR IN POST /api/dc-requests:', err);
    res.status(500).json({ error: 'Server Error: ' + err.message });
  }
});

app.get('/api/dc-requests', authenticate, (req, res) => {
  try {
    const status = req.query.status;
    let sql = `
      SELECT 
        dr.*,
        p.po_number as po_no,
        c.name as customer_name,
        cl.label as location_name,
        cl.city as location_city
      FROM dc_requests dr
      JOIN purchase_orders p ON dr.po_id = p.id
      JOIN customers c ON p.customer_id = c.id
      JOIN customer_locations cl ON dr.location_id = cl.id
    `;
    
    const params = [];
    if (status) {
      sql += " WHERE dr.status = ?";
      params.push(status);
    }
    
    sql += " ORDER BY dr.created_at DESC";
    
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc-requests/:id/confirm-dispatch', authenticate, upload.single('proof'), (req, res) => {
  const { vehicle_no, driver_name, driver_phone, lr_no, eway_bill_no, remarks, transporter } = req.body;
  const requestId = req.params.id;
  const proofPath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    db.prepare(`
      UPDATE delivery_challans 
      SET 
        status = 'in_transit',
        vehicle_no = ?,
        driver_name = ?,
        driver_phone = ?,
        lr_no = ?,
        eway_bill_no = ?,
        logistics_remarks = ?,
        dispatch_proof_path = ?,
        transporter = ?,
        dispatched_at = CURRENT_TIMESTAMP
      WHERE dc_request_id = ?
    `).run(vehicle_no, driver_name, driver_phone, lr_no, eway_bill_no, remarks, proofPath, transporter, requestId);
    
    // Also update request status
    db.prepare("UPDATE dc_requests SET status = 'dispatched' WHERE id = ?").run(requestId);

    res.json({ success: true, message: 'Shipment confirmed and marked as dispatched' });
  } catch(err) {
    console.error('ERROR CONFIRMING DISPATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dc-requests/:id', authenticate, (req, res) => {
  try {
    const request = db.prepare(`
      SELECT 
        dr.*,
        p.po_number,
        p.start_date as po_date,
        p.created_at as po_created_at,
        c.name as customer_name,
        cl.label as location_name,
        cl.address_line1 as location_address,
        cl.address_line2 as location_address2,
        cl.address_line3 as location_address3,
        cl.city as location_city,
        cl.state as location_state,
        cl.pincode as location_pincode,
        c.address_line1 as customer_addr1,
        c.address_line2 as customer_addr2,
        c.city as customer_city,
        c.pincode as customer_pin,
        c.gstin as customer_gstin
      FROM dc_requests dr
      JOIN purchase_orders p ON dr.po_id = p.id
      JOIN customers c ON p.customer_id = c.id
      JOIN customer_locations cl ON dr.location_id = cl.id
      WHERE dr.id = ?
    `).get(req.params.id);

    if (!request) return res.status(404).json({ error: 'Request not found' });

    const items = db.prepare(`
      SELECT 
        dri.*,
        pli.reference_number as ref_no,
        pli.package_name,
        pli.heading,
        pli.sub_heading,
        pli.item_name,
        pli.description,
        pli.uom,
        pli.supply_qty as total_po_qty,
        (SELECT SUM(qty) FROM dc_request_items WHERE line_item_id = pli.id AND dc_request_id IN (SELECT id FROM dc_requests WHERE status='approved')) as qty_delivered
      FROM dc_request_items dri
      JOIN po_line_items pli ON dri.line_item_id = pli.id
      WHERE dri.dc_request_id = ?
    `).all(req.params.id);

    res.json({ ...request, items });
  } catch(err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc-requests/:id/raise', authenticate, (req, res) => {
  const requestId = req.params.id;
  const { customDCNo, manualDC, dispatchFrom, itemHSNs, signature } = req.body;

  try {
    const request = db.prepare('SELECT * FROM dc_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'DC Request not found' });

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(request.po_id);
    if (!po) return res.status(404).json({ error: 'PO not found' });

    const items = db.prepare('SELECT * FROM dc_request_items WHERE dc_request_id = ?').all(requestId);
    if (items.length === 0) return res.status(400).json({ error: 'No items in this request' });

    db.exec('BEGIN');

    // Determine Despatch From Address (Fallback to PO location's address)
    const loc = db.prepare('SELECT address_line1, address_line2, pincode FROM customer_locations WHERE id = ?').get(po.location_id);
    const df1 = dispatchFrom?.line1 || 'Plot No. 44, Shed No. 3, Phase-I, IDA Balanagar';
    const df2 = dispatchFrom?.line2 || 'Hyderabad, Telangana';
    const dfp = dispatchFrom?.pin || '500037';

    const dc_number = customDCNo || request.requested_dc_number || ('DC-' + Date.now());

    const result = db.prepare(`
      INSERT INTO delivery_challans (
        dc_number, manual_dc_number, dc_request_id, po_id, customer_id, 
        customer_location_id, status, dispatch_date,
        dispatch_from_address1, dispatch_from_address2, dispatch_from_pincode,
        vehicle_no, driver_name, driver_phone, transporter,
        created_by, delivery_status, dispatched_at,
        dispatch_proof_path, logistics_remarks, signature_data
      ) VALUES (?, ?, ?, ?, ?, ?, 'in_transit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
    `).run(
      dc_number, 
      manualDC || request.requested_dc_number || null, 
      requestId, 
      po.id, 
      po.customer_id, 
      request.location_id, 
      request.dispatch_date,
      dispatchFrom?.line1 || request.dispatch_from_address1 || df1, 
      dispatchFrom?.line2 || request.dispatch_from_address2 || df2, 
      dispatchFrom?.pin || request.dispatch_from_pincode || dfp,
      request.vehicle_no || '',
      request.driver_name || '',
      request.driver_phone || '',
      request.transporter || '',
      req.user.id,
      'awaiting_site_confirmation',
      request.proof_path || null,
      request.logistics_remarks || '',
      signature || null
    );

    const dcId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO dc_line_items (dc_id, po_line_item_id, item_name, description, quantity_dispatched, uom, hsn)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const poItem = db.prepare('SELECT item_name, description, uom FROM po_line_items WHERE id = ?').get(item.line_item_id);
      insertItem.run(
        dcId, 
        item.line_item_id, 
        poItem.item_name, 
        poItem.description || '', 
        item.qty, 
        poItem.uom || '',
        itemHSNs[item.line_item_id] || ''
      );
      
      // Update PO Line Item delivered qty
      db.prepare('UPDATE po_line_items SET qty_delivered = (qty_delivered + ?) WHERE id = ?').run(item.qty, item.line_item_id);
    }

    // Update status
    db.prepare("UPDATE dc_requests SET status = 'dispatched' WHERE id = ?").run(requestId);
    db.prepare("UPDATE purchase_orders SET status = 'dc_raised' WHERE id = ?").run(po.id);

    db.exec('COMMIT');
    auditLog(req.user.username, 'CREATE', 'DeliveryChallan', dcId, null, { dc_number, po_id: po.id });
    res.json({ success: true, dc_number, dc_id: dcId });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    console.error('ERROR RAISING DC:', err);
    res.status(500).json({ error: 'Server Error: ' + err.message });
  }
});

app.get('/api/next-dc-number/:customerId', authenticate, (req, res) => {
  try {
    const cust = db.prepare('SELECT cust_code FROM customers WHERE id = ?').get(req.params.customerId);
    if (!cust) return res.status(404).json({ error: 'Customer not found' });
    
    const code = cust.cust_code || 'CUST';
    const pattern = `DC/${code}/%`;
    const lastDC = db.prepare(`
      SELECT dc_number as num FROM delivery_challans 
      WHERE customer_id = ? AND dc_number LIKE ? 
      ORDER BY id DESC LIMIT 1
    `).get(req.params.customerId, pattern);

    const lastReq = db.prepare(`
      SELECT requested_dc_number as num FROM dc_requests dr
      JOIN purchase_orders p ON dr.po_id = p.id
      WHERE p.customer_id = ? AND requested_dc_number LIKE ? 
      ORDER BY dr.id DESC LIMIT 1
    `).get(req.params.customerId, pattern);

    let nextNum = 1;
    const processNum = (val) => {
      if (!val) return 0;
      const parts = val.split('/');
      const seq = parseInt(parts[parts.length - 1]);
      return isNaN(seq) ? 0 : seq;
    };

    const dcSeq = processNum(lastDC?.num);
    const reqSeq = processNum(lastReq?.num);
    nextNum = Math.max(dcSeq, reqSeq) + 1;

    const nextDC = `DC/${code}/${String(nextNum).padStart(3, '0')}`;
    res.json({ nextDC });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/po-flow', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        p.id, 
        p.po_number, 
        p.po_date,
        p.start_date,
        p.end_date,
        p.grand_total as po_value,
        c.name as customer_name,
        COALESCE((SELECT SUM(supply_qty + service_qty) FROM po_line_items WHERE po_id = p.id), 0) as po_qty,
        COALESCE((
          SELECT SUM(dli.quantity_dispatched * (
            CASE 
              WHEN pli.supply_qty > 0 THEN (pli.total_supply / pli.supply_qty)
              WHEN pli.service_qty > 0 THEN (pli.total_service / pli.service_qty)
              ELSE 0 
            END
          ))
          FROM dc_line_items dli
          JOIN delivery_challans dc ON dli.dc_id = dc.id
          JOIN po_line_items pli ON dli.po_line_item_id = pli.id
          WHERE dc.po_id = p.id AND dc.status != 'cancelled'
        ), 0) as supplied_value,
        COALESCE((
          SELECT SUM(dli.quantity_dispatched * (
            CASE 
              WHEN pli.supply_qty > 0 THEN (pli.total_supply / pli.supply_qty)
              WHEN pli.service_qty > 0 THEN (pli.total_service / pli.service_qty)
              ELSE 0 
            END
          ))
          FROM dc_line_items dli
          JOIN delivery_challans dc ON dli.dc_id = dc.id
          JOIN po_line_items pli ON dli.po_line_item_id = pli.id
          WHERE dc.po_id = p.id AND dc.status != 'cancelled'
        ), 0) - COALESCE((
          SELECT SUM(grand_total) 
          FROM invoices 
          WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
        ), 0) as to_be_invoiced_value,
        COALESCE((
          SELECT SUM(ii.quantity) 
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          WHERE i.po_id = p.id AND i.status NOT IN ('requested', 'cancelled')
        ), 0) as invoiced_qty,
        COALESCE((
          SELECT SUM(grand_total) 
          FROM invoices 
          WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
        ), 0) as invoice_amount,
        COALESCE((
          SELECT SUM(amount_received) 
          FROM ar_entries 
          WHERE po_id = p.id
        ), 0) as received_amount,
        (SELECT COUNT(*) FROM delivery_challans WHERE po_id = p.id AND status != 'cancelled') as dc_count,
        (SELECT COUNT(*) FROM invoices WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')) as invoice_count
      FROM purchase_orders p
      JOIN customers c ON p.customer_id = c.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(rows);
  } catch(err) {
    console.error('ERROR in /api/po-flow:', err);
    res.status(500).json({ error: err.message });
  }
});






const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`O2C Server V2 running on port ${PORT}`));
