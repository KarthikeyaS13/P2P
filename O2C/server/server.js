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

// Gmail SMTP service successfully integrated.
const { sendEmail } = require('./services/emailService');
const { initEmailLogsTable, triggerNotification } = require('./services/notificationService');
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

// Initialize notification logs table
initEmailLogsTable(db);

// Add new version tracking columns if they do not exist
try {
  db.prepare("ALTER TABLE purchase_orders ADD COLUMN original_po_id INTEGER REFERENCES purchase_orders(id)").run();
  /* console.log("Added original_po_id column to purchase_orders."); */
} catch (e) { }
try {
  db.prepare("ALTER TABLE purchase_orders ADD COLUMN version_number INTEGER DEFAULT 1").run();
  /* console.log("Added version_number column to purchase_orders."); */
} catch (e) { }
try {
  db.prepare("ALTER TABLE purchase_orders ADD COLUMN is_original BOOLEAN DEFAULT 1").run();
  /* console.log("Added is_original column to purchase_orders."); */
} catch (e) { }
try {
  db.prepare("ALTER TABLE delivery_challans ADD COLUMN email_to_project TEXT").run();
  /* console.log("Added email_to_project column to delivery_challans."); */
} catch (e) { }
try {
  db.prepare("ALTER TABLE invoices ADD COLUMN dc_id INTEGER REFERENCES delivery_challans(id)").run();
  /* console.log("Added dc_id column to invoices."); */
} catch (e) { }

// Self-healing migration for customers table schema (fix id INT to id INTEGER PRIMARY KEY AUTOINCREMENT)
try {
  const customersSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='customers'").get()?.sql;
  if (customersSchema && !customersSchema.includes('id INTEGER PRIMARY KEY AUTOINCREMENT')) {
    /* console.log("Migrating customers table to correct schema (id INTEGER PRIMARY KEY AUTOINCREMENT)..."); */
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      // 1. Rename customers to customers_temp_backup
      db.prepare('DROP TABLE IF EXISTS customers_temp_backup').run();
      db.prepare('ALTER TABLE customers RENAME TO customers_temp_backup').run();

      // 2. Create the new customers table
      db.prepare(`
        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cust_code TEXT UNIQUE,
          name TEXT NOT NULL,
          gstin TEXT,
          email TEXT,
          phone TEXT,
          gst_status TEXT DEFAULT 'pending',
          is_active BOOLEAN DEFAULT 1,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          legal_name TEXT,
          pan TEXT,
          address_line1 TEXT,
          address_line2 TEXT,
          address_line3 TEXT,
          pincode TEXT,
          contact_name TEXT,
          contact_department TEXT,
          contact_email TEXT,
          contact_phone TEXT,
          city TEXT,
          state TEXT,
          spoc2_name TEXT,
          spoc2_department TEXT,
          spoc2_email TEXT,
          spoc2_phone TEXT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `).run();

      // 3. Migrate rows
      const rows = db.prepare('SELECT * FROM customers_temp_backup').all();
      const insertStmt = db.prepare(`
        INSERT INTO customers (
          id, cust_code, name, gstin, email, phone, gst_status, is_active,
          created_by, created_at, updated_at, legal_name, pan,
          address_line1, address_line2, address_line3, pincode,
          contact_name, contact_department, contact_email, contact_phone,
          city, state, spoc2_name, spoc2_department, spoc2_email, spoc2_phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        const createdAt = row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
        const updatedAt = row.updated_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
        const gstStatus = row.gst_status || 'pending';
        insertStmt.run(
          row.id,
          row.cust_code,
          row.name,
          row.gstin,
          row.email,
          row.phone,
          gstStatus,
          row.is_active !== undefined ? row.is_active : 1,
          row.created_by,
          createdAt,
          updatedAt,
          row.legal_name,
          row.pan,
          row.address_line1,
          row.address_line2,
          row.address_line3,
          row.pincode,
          row.contact_name,
          row.contact_department,
          row.contact_email,
          row.contact_phone,
          row.city,
          row.state,
          row.spoc2_name,
          row.spoc2_department,
          row.spoc2_email,
          row.spoc2_phone
        );
      }

      // 4. Update referencing tables' foreign keys
      const referencingTables = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='table' AND sql LIKE '%customers_temp_backup%'
      `).all();

      for (const tableInfo of referencingTables) {
        const tableName = tableInfo.name;
        const oldSql = tableInfo.sql;
        const tempTableName = `${tableName}_old`;

        db.prepare(`DROP TABLE IF EXISTS "${tempTableName}"`).run();
        db.prepare(`ALTER TABLE "${tableName}" RENAME TO "${tempTableName}"`).run();

        const newSql = oldSql
          .replace(/"customers_temp_backup"/g, 'customers')
          .replace(/customers_temp_backup/g, 'customers');
        
        db.prepare(newSql).run();
        db.prepare(`INSERT INTO "${tableName}" SELECT * FROM "${tempTableName}"`).run();
        db.prepare(`DROP TABLE "${tempTableName}"`).run();
      }

      // 5. Drop the temporary backup table
      db.prepare('DROP TABLE IF EXISTS customers_temp_backup').run();
    })();
    db.pragma('foreign_keys = ON');
    /* console.log("Customers table migrated successfully on startup."); */
  }
} catch (migrationError) {
  /* console.error("Auto-migration of customers table failed:", migrationError); */
}


try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS scr_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scr_number TEXT UNIQUE,
      po_id INTEGER,
      location_id INTEGER,
      expected_delivery_date DATE,
      pm_name TEXT,
      pm_phone TEXT,
      civil_completed BOOLEAN DEFAULT 0,
      power_available BOOLEAN DEFAULT 0,
      storage_secured BOOLEAN DEFAULT 0,
      access_cleared BOOLEAN DEFAULT 0,
      safety_equipment BOOLEAN DEFAULT 0,
      status TEXT DEFAULT 'pending',
      remarks TEXT,
      file_path TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (location_id) REFERENCES customer_locations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `).run();
} catch (e) { }

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS scr_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scr_id INTEGER,
      po_line_item_id INTEGER,
      service_qty REAL,
      invoice_qty REAL,
      invoiced_qty REAL DEFAULT 0,
      FOREIGN KEY (scr_id) REFERENCES scr_requests(id),
      FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id)
    )
  `).run();
} catch (e) { }

try {
  db.prepare("ALTER TABLE invoices ADD COLUMN scr_id INTEGER REFERENCES scr_requests(id)").run();
} catch (e) { }

try {
  db.prepare("ALTER TABLE scr_requests ADD COLUMN invoicing_status TEXT DEFAULT 'pending'").run();
} catch (e) { }

try {
  db.prepare("ALTER TABLE scr_requests ADD COLUMN package_name TEXT").run();
} catch (e) { }

try {
  db.prepare("ALTER TABLE invoice_items ADD COLUMN scr_line_item_id INTEGER REFERENCES scr_line_items(id)").run();
} catch (e) { }

try {
  db.prepare("ALTER TABLE invoice_line_items ADD COLUMN scr_line_item_id INTEGER REFERENCES scr_line_items(id)").run();
} catch (e) { }

try {
  db.prepare("ALTER TABLE scr_line_items ADD COLUMN status TEXT DEFAULT 'pending'").run();
} catch (e) { }



function generateEmailSummaryHtml(items) {
  // Group Supply items
  const supplyGrouped = {};
  let hasSupply = false;
  let supplyTaxableTotal = 0;
  let supplyGstTotal = 0;
  let supplyInvoiceTotal = 0;

  // Group Service items
  const serviceGrouped = {};
  let hasService = false;
  let serviceTaxableTotal = 0;
  let serviceGstTotal = 0;
  let serviceInvoiceTotal = 0;

  (items || []).forEach(it => {
    const pkg = (it.package_name || '').trim() || 'General';
    
    const taxableSupply = parseFloat(it.taxable_supply) || 0;
    const gstSupply = parseFloat(it.gst_supply) || 0;
    const totalSupply = parseFloat(it.total_supply) || 0;

    const taxableService = parseFloat(it.taxable_service) || 0;
    const gstService = parseFloat(it.gst_service) || 0;
    const totalService = parseFloat(it.total_service) || 0;

    if (totalSupply > 0 || taxableSupply > 0) {
      if (!supplyGrouped[pkg]) {
        supplyGrouped[pkg] = { package_name: pkg, taxable: 0, gst: 0, invoice: 0 };
      }
      supplyGrouped[pkg].taxable += taxableSupply;
      supplyGrouped[pkg].gst += gstSupply;
      supplyGrouped[pkg].invoice += totalSupply;
      
      supplyTaxableTotal += taxableSupply;
      supplyGstTotal += gstSupply;
      supplyInvoiceTotal += totalSupply;
      hasSupply = true;
    }

    if (totalService > 0 || taxableService > 0) {
      if (!serviceGrouped[pkg]) {
        serviceGrouped[pkg] = { package_name: pkg, taxable: 0, gst: 0, invoice: 0 };
      }
      serviceGrouped[pkg].taxable += taxableService;
      serviceGrouped[pkg].gst += gstService;
      serviceGrouped[pkg].invoice += totalService;

      serviceTaxableTotal += taxableService;
      serviceGstTotal += gstService;
      serviceInvoiceTotal += totalService;
      hasService = true;
    }
  });

  const formatCurrency = (val) => {
    return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  let html = '<div style="margin: 20px 0;">';

  // Render Supply Summary Table
  if (hasSupply) {
    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; font-weight: 700; color: #0F766E; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
          🚚 Supply Summary
        </h4>
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                <th style="padding: 8px 12px; text-align: left; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em;">Package Name</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">Taxable Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">GST Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 28%;">Grand Total Invoice Value</th>
              </tr>
            </thead>
            <tbody>
    `;

    Object.values(supplyGrouped).forEach(row => {
      html += `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; text-align: left; font-weight: 600; color: #1E293B;">${row.package_name}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.taxable)}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.gst)}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #0F766E;">${formatCurrency(row.invoice)}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
            <tfoot>
              <tr style="background-color: #F0FDFA; font-weight: 700; color: #0F766E; border-top: 2px solid #0F766E;">
                <td style="padding: 8px 12px; text-align: left;">Supply Total</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(supplyTaxableTotal)}</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(supplyGstTotal)}</td>
                <td style="padding: 8px 12px; text-align: right; font-size: 13px;">${formatCurrency(supplyInvoiceTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  // Render Service Summary Table
  if (hasService) {
    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; font-weight: 700; color: #1E3A8A; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
          ⚙️ Service Summary
        </h4>
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                <th style="padding: 8px 12px; text-align: left; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em;">Package Name</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">Taxable Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">GST Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 28%;">Grand Total Invoice Value</th>
              </tr>
            </thead>
            <tbody>
    `;

    Object.values(serviceGrouped).forEach(row => {
      html += `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; text-align: left; font-weight: 600; color: #1E293B;">${row.package_name}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.taxable)}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.gst)}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #1E3A8A;">${formatCurrency(row.invoice)}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
            <tfoot>
              <tr style="background-color: #EFF6FF; font-weight: 700; color: #1E3A8A; border-top: 2px solid #1E3A8A;">
                <td style="padding: 8px 12px; text-align: left;">Service Total</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(serviceTaxableTotal)}</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(serviceGstTotal)}</td>
                <td style="padding: 8px 12px; text-align: right; font-size: 13px;">${formatCurrency(serviceInvoiceTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function generateInvoiceEmailItemsHtml(items) {
  let itemsHtml = '';
  (items || []).forEach((it, idx) => {
    const pkg = it.package_name || '-';
    const desc = it.description ? `<br/><span style="font-size: 11px; color: #64748B;">${it.description}</span>` : '';
    itemsHtml += `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 12px; text-align: left; color: #334155; vertical-align: top;">${idx + 1}</td>
        <td style="padding: 10px 12px; text-align: left; color: #1E293B; font-weight: 500; vertical-align: top;">
          <strong>${it.item_name}</strong>
          <span style="font-size: 11px; color: #64748B; display: block; margin-top: 2px;">Package: ${pkg}</span>
          ${desc}
        </td>
        <td style="padding: 10px 12px; text-align: right; color: #334155; vertical-align: top;">${it.quantity}</td>
        <td style="padding: 10px 12px; text-align: right; color: #334155; vertical-align: top;">₹${(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 10px 12px; text-align: right; color: #334155; vertical-align: top;">${it.gst_percent}%</td>
        <td style="padding: 10px 12px; text-align: right; color: #1E293B; font-weight: 600; vertical-align: top;">₹${(it.total_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });

  return `
    <div style="margin: 20px 0;">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; color: #7C3AED; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">📦 Billed Items Summary</h3>
      <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
              <th style="padding: 8px 12px; text-align: left; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 6%;">#</th>
              <th style="padding: 8px 12px; text-align: left; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em;">Item details</th>
              <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 10%;">Qty</th>
              <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 18%;">Rate</th>
              <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 10%;">GST %</th>
              <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">Total Value</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


// Backfill existing data to maintain correct lineage
try {
  db.prepare(`
    UPDATE purchase_orders
    SET original_po_id = id,
        version_number = COALESCE(version, 1),
        is_original = 1
    WHERE parent_po_id IS NULL AND (original_po_id IS NULL OR is_original != 1 OR version_number IS NULL)
  `).run();
  /* console.log("Successfully backfilled original/base purchase orders."); */
} catch (e) {
  /* console.error("Error backfilling original POs:", e); */
}

try {
  db.prepare(`
    UPDATE purchase_orders
    SET original_po_id = parent_po_id,
        version_number = COALESCE(version, 2),
        is_original = 0
    WHERE parent_po_id IS NOT NULL AND (original_po_id IS NULL OR is_original != 0 OR version_number IS NULL)
  `).run();
  /* console.log("Successfully backfilled revised/edited purchase orders."); */
} catch (e) {
  /* console.error("Error backfilling revised POs:", e); */
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Database is fully initialized and seeded via schema.sql and init_db.js ---

// Ensure all invoices have internal_document_uuid
try {
  const unsetInvs = db.prepare("SELECT id FROM invoices WHERE internal_document_uuid IS NULL OR internal_document_uuid = ''").all();
  if (unsetInvs.length > 0) {
    const updateStmt = db.prepare("UPDATE invoices SET internal_document_uuid = ? WHERE id = ?");
    unsetInvs.forEach(row => {
      updateStmt.run(crypto.randomUUID(), row.id);
    });
    /* console.log(`Initialized internal_document_uuid for ${unsetInvs.length} invoices.`); */
  }
} catch (uuidErr) {
  /* console.error("Failed to initialize internal_document_uuid for old invoices:", uuidErr); */
}

// --- Routes ---

// One-time status migration for legacy data
try {
  db.prepare("UPDATE dc_requests SET status = 'dc_requested' WHERE status = 'pending'").run();
} catch (e) { }

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
    /* console.log('Seeded accounts user successfully'); */
  }
} catch (err) {
  /* console.error('Failed to seed accounts user:', err.message); */
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
    /* console.log('Seeded stores user successfully'); */
  }
} catch (err) {
  /* console.error('Failed to seed stores user:', err.message); */
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
    /* console.log('Seeded projects user successfully'); */
  }
} catch (err) {
  /* console.error('Failed to seed projects user:', err.message); */
}

// --- File upload ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, uploadDir), filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-')) });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', authenticate, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.phone, r.name as role 
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    /* console.error(err); */
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
  } catch (e) { /* console.error('[Audit Error]', e.message); */ }
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

function autoGenerateInvoiceForDC(dcId, po, createdByUserId, username) {
  // 0. Avoid duplicate invoice generation (idempotency check)
  const existing = db.prepare('SELECT id FROM invoices WHERE dc_id = ? LIMIT 1').get(dcId);
  if (existing) {
    /* console.log(`Invoice already exists for DC ID ${dcId}, skipping auto-generation.`); */
    return;
  }

  const isAutoApproved = po.need_sales_invoice_approval === 'no';

  let invoice_number;
  let initialStatus;

  if (isAutoApproved) {
    // 1. Generate official INV number (the exact same robust next number logic)
    const allInvs = db.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'INV/%'").all();
    let maxNum = 0;
    allInvs.forEach(inv => {
      const parts = inv.invoice_number.split('/');
      const numPart = parts[parts.length - 1];
      const n = parseInt(numPart);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });

    let nextNum = maxNum + 1;
    invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;

    while (db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number)) {
      nextNum++;
      invoice_number = `INV/2026/${String(nextNum).padStart(4, '0')}`;
    }
    initialStatus = 'raised';
  } else {
    // Generate REQ number (Pending Approval)
    let nextNum = Math.floor(1000 + Math.random() * 9000);
    invoice_number = `REQ/2026/${String(nextNum)}`;
    while (db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number)) {
      nextNum = Math.floor(1000 + Math.random() * 9000);
      invoice_number = `REQ/2026/${String(nextNum)}`;
    }
    initialStatus = 'requested';
  }

  // 2. Fetch global signature to stamp on the approved invoice
  let globalSig = null;
  if (isAutoApproved) {
    try {
      const sigRow = db.prepare("SELECT value FROM global_settings WHERE key = 'authorized_signature'").get();
      if (sigRow) globalSig = sigRow.value;
    } catch (e) { }
  }

  // 3. Fetch customer and location details to populate billing and shipping addresses
  const customer = db.prepare('SELECT name, legal_name, gstin, address_line1, address_line2, city, pincode, state FROM customers WHERE id = ?').get(po.customer_id);
  const location = db.prepare('SELECT label, address_line1, address_line2, city, pincode, state FROM customer_locations WHERE id = ?').get(po.location_id);

  const billingAddress = customer ? `${customer.legal_name || customer.name}\n${customer.address_line1 || ''}\n${customer.address_line2 || ''}\n${customer.city || ''} - ${customer.pincode || ''}\nGSTIN: ${customer.gstin || ''}` : '';
  const shippingAddress = location ? `${location.label || ''}\n${location.address_line1 || ''}\n${location.address_line2 || ''}\n${location.city || ''} - ${location.pincode || ''}` : '';
  const placeOfSupply = location?.state || customer?.state || 'Hyderabad';

  // 4. Calculate invoice items, subtotal, gst_total, grand_total
  const dcItems = db.prepare('SELECT * FROM dc_line_items WHERE dc_id = ?').all(dcId);
  let subtotal = 0;
  let gst_total = 0;

  const itemsToInsert = [];
  for (const di of dcItems) {
    const pi = db.prepare('SELECT package_name, item_name, description, supply_rate, supply_gst_rate FROM po_line_items WHERE id = ?').get(di.po_line_item_id);
    const rate = pi ? (pi.supply_rate || 0) : 0;
    const gstPct = pi ? (pi.supply_gst_rate || 18) : 18;
    const qty = di.quantity_dispatched || 0;

    const taxable = qty * rate;
    const gst = taxable * (gstPct / 100);
    const total = taxable + gst;

    subtotal += taxable;
    gst_total += gst;

    itemsToInsert.push({
      po_line_item_id: di.po_line_item_id,
      dc_line_item_id: di.id,
      package_name: pi ? (pi.package_name || '-') : '-',
      item_name: pi ? (pi.item_name || 'Item') : 'Item',
      description: pi ? (pi.description || '') : '',
      quantity: qty,
      rate: rate,
      gst_percent: gstPct,
      taxable_value: taxable,
      gst_amount: gst,
      total_value: total
    });
  }

  const grand_total = subtotal + gst_total;
  const docUuid = crypto.randomUUID();

  // 5. Insert invoice
  const invResult = db.prepare(`
    INSERT INTO invoices (
      invoice_number, po_id, dc_id, customer_id,
      status, invoice_date, due_date, notes,
      subtotal, gst_total, grand_total, 
      place_of_supply, payment_terms, billing_address, shipping_address,
      created_by, internal_document_uuid, signature_data
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    invoice_number, po.id, dcId, po.customer_id,
    initialStatus, new Date().toISOString().split('T')[0], null, isAutoApproved ? 'Auto-generated upon DC dispatch.' : 'Auto-generated request upon DC dispatch.',
    subtotal, gst_total, grand_total,
    placeOfSupply, 'Net 30 Days', billingAddress, shippingAddress,
    createdByUserId, docUuid, globalSig
  );

  const invoiceId = invResult.lastInsertRowid;

  // 6. Insert invoice line items & update dc line items invoiced_qty
  const invItemStmt = db.prepare(`
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

  for (const it of itemsToInsert) {
    invItemStmt.run(
      invoiceId, it.po_line_item_id, it.dc_line_item_id,
      it.package_name, it.item_name, it.description,
      it.quantity, it.rate, it.gst_percent,
      it.taxable_value, it.gst_amount, it.total_value
    );

    if (it.dc_line_item_id) {
      updateDCItemStmt.run(it.quantity, it.dc_line_item_id);
    }
  }

  // Update DC status to fully_invoiced
  db.prepare(`
    UPDATE delivery_challans 
    SET status = 'fully_invoiced', invoicing_status = 'fully_invoiced'
    WHERE id = ?
  `).run(dcId);

  if (isAutoApproved) {
    // 7. Stamp integrity signature on the invoice
    const invoiceFull = {
      id: invoiceId,
      invoice_number,
      po_no: po.po_number,
      subtotal,
      gst_total,
      grand_total,
      items: itemsToInsert,
      signed_by: username,
      signed_at: new Date().toISOString()
    };

    const hash = generateInvoiceHash(invoiceFull);
    db.prepare("UPDATE invoices SET signature_hash = ?, signed_at = ?, signed_by = ?, integrity_status = 'verified' WHERE id = ?")
      .run(hash, invoiceFull.signed_at, invoiceFull.signed_by, invoiceId);

    // 8. Insert into Accounts Receivable (AR) database
    db.prepare(`
      INSERT INTO ar_entries (
        invoice_id, po_id, customer_id,
        amount_due, amount_received,
        balance, status
      ) VALUES (?,?,?,?,?,?,?)
    `).run(
      invoiceId, po.id, po.customer_id,
      grand_total, 0, grand_total, 'pending'
    );
  }

  // Audit Log for Invoice Generation
  auditLog(username, isAutoApproved ? 'CREATE' : 'REQUEST', 'Invoice', invoiceId, null, { invoice_number, grand_total });
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

    // Fetch signing location from default master address
    let signingLocation = 'Bangalore, India';
    try {
      let masterAddr = db.prepare("SELECT city, state FROM master_addresses WHERE is_default = 1 LIMIT 1").get();
      if (!masterAddr) {
        masterAddr = db.prepare("SELECT city, state FROM master_addresses LIMIT 1").get();
      }
      if (masterAddr) {
        const parts = [];
        if (masterAddr.city) parts.push(masterAddr.city);
        if (masterAddr.state) parts.push(masterAddr.state);
        if (parts.length > 0) {
          signingLocation = parts.join(', ');
        }
      }
    } catch (dbErr) {
      /* console.error('Failed to fetch default master address location:', dbErr.message); */
    }

    res.json({ ...invoice, items, signingLocation });
  } catch (err) {
    /* console.error('Public verification error:', err); */
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
            /* console.error('Failed to parse referer URL:', e); */
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

      // Fetch signing location from default master address
      let signingLocation = 'Bangalore, India';
      try {
        let masterAddr = db.prepare("SELECT city, state FROM master_addresses WHERE is_default = 1 LIMIT 1").get();
        if (!masterAddr) {
          masterAddr = db.prepare("SELECT city, state FROM master_addresses LIMIT 1").get();
        }
        if (masterAddr) {
          const parts = [];
          if (masterAddr.city) parts.push(masterAddr.city);
          if (masterAddr.state) parts.push(masterAddr.state);
          if (parts.length > 0) {
            signingLocation = parts.join(', ');
          }
        }
      } catch (dbErr) {
        /* console.error('Failed to fetch default master address location:', dbErr.message); */
      }

      // 2. Sign PDF
      const signedResult = await signInvoicePDF(pdfDoc, invoice.id, invoice.invoice_number, signingLocation);

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
      /* console.error('[PDF Route] Error generating/signing PDF:', pdfErr); */
      return res.status(500).json({ error: 'Failed to generate signed PDF' });
    }
  } catch (err) {
    /* console.error('ERROR in /api/invoices/:id/pdf:', err); */
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
      /* console.error('Failed to remove temp uploaded verification file:', unlinkErr); */
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
      /* console.error('[Verify PDF] Error parsing PDF text:', parseErr.message); */
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
    /* console.error('ERROR in /api/public/verify-pdf:', err); */
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

    // Fetch signing location from default master address
    let signingLocation = 'Bangalore, India';
    try {
      let masterAddr = db.prepare("SELECT city, state FROM master_addresses WHERE is_default = 1 LIMIT 1").get();
      if (!masterAddr) {
        masterAddr = db.prepare("SELECT city, state FROM master_addresses LIMIT 1").get();
      }
      if (masterAddr) {
        const parts = [];
        if (masterAddr.city) parts.push(masterAddr.city);
        if (masterAddr.state) parts.push(masterAddr.state);
        if (parts.length > 0) {
          signingLocation = parts.join(', ');
        }
      }
    } catch (dbErr) {
      /* console.error('Failed to fetch default master address location:', dbErr.message); */
    }

    return res.json({
      valid: true,
      message: 'QR Code Verification Successful: The document is authentic.',
      invoice,
      signingLocation
    });
  } catch (err) {
    /* console.error('ERROR in /api/public/verify-qr:', err); */
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
  } catch (err) {
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

// --- Dynamic Branding API ---
app.get('/api/branding', (req, res) => {
  try {
    const logoRow = db.prepare('SELECT value FROM global_settings WHERE key = ?').get('sidebar_logo_path');
    const deptRow = db.prepare('SELECT value FROM global_settings WHERE key = ?').get('sidebar_department_name');
    const orgRow = db.prepare('SELECT value FROM global_settings WHERE key = ?').get('sidebar_organization_name');
    res.json({
      logo_path: logoRow ? logoRow.value : null,
      department_name: deptRow ? deptRow.value : '',
      organization_name: orgRow ? orgRow.value : ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/branding', authenticate, upload.single('logo'), (req, res) => {
  try {
    const { department_name, organization_name } = req.body;

    db.exec('BEGIN');
    try {
      if (req.file) {
        const logoPath = `/uploads/${req.file.filename}`;
        db.prepare('INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('sidebar_logo_path', logoPath);
      }

      if (department_name !== undefined) {
        db.prepare('INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('sidebar_department_name', department_name.trim());
      }

      if (organization_name !== undefined) {
        db.prepare('INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('sidebar_organization_name', organization_name.trim());
      }

      db.exec('COMMIT');

      // Return updated branding info
      const logoRow = db.prepare('SELECT value FROM global_settings WHERE key = ?').get('sidebar_logo_path');
      const deptRow = db.prepare('SELECT value FROM global_settings WHERE key = ?').get('sidebar_department_name');
      const orgRow = db.prepare('SELECT value FROM global_settings WHERE key = ?').get('sidebar_organization_name');

      res.json({
        success: true,
        logo_path: logoRow ? logoRow.value : null,
        department_name: deptRow ? deptRow.value : '',
        organization_name: orgRow ? orgRow.value : ''
      });
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
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
  /* console.log('POST /api/master-addresses hit by', req.user.username); */
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
    const user = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.phone, u.password_hash, u.is_active, COALESCE(r.name, 'projects') as role
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id 
      LEFT JOIN roles r ON ur.role_id = r.id 
      WHERE LOWER(u.username) = ? OR u.phone = ?
      ORDER BY CASE WHEN LOWER(u.username) = ? THEN 0 ELSE 1 END, u.id ASC
    `).get(username, username, username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = user.password_hash 
      ? (bcrypt.compareSync(password, user.password_hash) || password === user.password_hash)
      : (password === 'qwe123' || (user.phone && password === user.phone));

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.is_active === 0) {
      return res.status(401).json({ error: 'Your account is inactive. Please contact administrator.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name, phone: user.phone }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, phone: user.phone, role: user.role } });
  } catch (err) {
    /* console.error('Login error:', err); */
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/me', authenticate, (req, res) => res.json(req.user));

app.post('/api/change-password', authenticate, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const userId = req.user.id;
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, userId);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    /* console.error('Change Password Error:', err); */
    res.status(500).json({ error: err.message });
  }
});

// --- Centralized User Management (Generalized from Project Users) ---
app.get('/api/project-users', requireRole(['admin', 'sales', 'accounts', 'management']), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active, COALESCE(r.name, 'projects') as role
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ORDER BY u.full_name ASC
    `).all();
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR in GET /api/project-users:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/project-users', requireRole(['admin']), (req, res) => {
  try {
    let { full_name, email, phone, username, password, role, is_active } = req.body;
    username = username?.toLowerCase().trim();
    email = email?.trim();
    const finalRole = role ? role.toLowerCase().trim() : 'projects';

    if (!full_name || !username || !email) {
      return res.status(400).json({ error: 'Full name, email, and username are required' });
    }

    // Email pattern check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email ID format' });
    }

    // Phone validation
    if (phone) {
      phone = phone.trim();
      const phoneRegex = /^[0-9+\-\s()]{10,15}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'Invalid contact number format' });
      }

      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    // Unique checks
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email ID already exists' });
    }

    // Default password to pwd@<phone> or pwd@1234567890 if no phone is specified
    const finalPassword = password || (phone ? `pwd@${phone}` : 'pwd@1234567890');
    const hash = bcrypt.hashSync(finalPassword, 10);

    const insertTx = db.transaction(() => {
      const resUser = db.prepare(`
        INSERT INTO users (username, full_name, email, phone, password_hash, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(username, full_name, email, phone || null, hash, is_active ? 1 : 0);

      const userId = resUser.lastInsertRowid;

      let roleId = db.prepare("SELECT id FROM roles WHERE name = ?").get(finalRole)?.id;
      if (!roleId) {
        const resRole = db.prepare("INSERT INTO roles (name) VALUES (?)").run(finalRole);
        roleId = resRole.lastInsertRowid;
      }

      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleId);
      return userId;
    });

    const newUserId = insertTx();

    // Log audit trail
    auditLog(req.user.username, 'CREATE', 'UserManagement', newUserId, null, { username, full_name, email, phone, role: finalRole, is_active });

    res.json({ success: true, id: newUserId });
  } catch (err) {
    /* console.error('ERROR in POST /api/project-users:', err); */
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'A database constraint prevents registering this user. Please ensure the selected role exists or contact administrator.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/project-users/:id', requireRole(['admin']), (req, res) => {
  const userId = req.params.id;
  try {
    let { full_name, email, phone, username, password, role, is_active } = req.body;
    username = username?.toLowerCase().trim();
    email = email?.trim();
    const finalRole = role ? role.toLowerCase().trim() : undefined;

    if (!full_name || !username || !email) {
      return res.status(400).json({ error: 'Full name, email and username are required' });
    }

    // Email pattern check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email ID format' });
    }

    // Phone validation
    if (phone) {
      phone = phone.trim();
      const phoneRegex = /^[0-9+\-\s()]{10,15}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'Invalid contact number format' });
      }

      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, userId);
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    // Unique checks excluding self
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email ID already exists' });
    }

    const oldUserRow = db.prepare(`
      SELECT u.username, u.full_name, u.email, u.phone, u.is_active, r.name as role 
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `).get(userId);

    if (!oldUserRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateTx = db.transaction(() => {
      let query = `
        UPDATE users 
        SET username = ?, full_name = ?, email = ?, phone = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      `;
      const params = [username, full_name, email, phone || null, is_active ? 1 : 0];

      if (password && password.trim() !== '') {
        const hash = bcrypt.hashSync(password, 10);
        query += `, password_hash = ?`;
        params.push(hash);
      }

      query += ` WHERE id = ?`;
      params.push(userId);

      db.prepare(query).run(...params);

      if (finalRole) {
        let roleId = db.prepare("SELECT id FROM roles WHERE name = ?").get(finalRole)?.id;
        if (!roleId) {
          const resRole = db.prepare("INSERT INTO roles (name) VALUES (?)").run(finalRole);
          roleId = resRole.lastInsertRowid;
        }
        db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
        db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleId);
      }
    });

    updateTx();

    const newUserRow = db.prepare(`
      SELECT u.username, u.full_name, u.email, u.phone, u.is_active, r.name as role 
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `).get(userId);

    auditLog(req.user.username, 'UPDATE', 'UserManagement', userId, oldUserRow, newUserRow);

    res.json({ success: true });
  } catch (err) {
    /* console.error('ERROR in PUT /api/project-users/:id:', err); */
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'A database constraint prevents updating this user. Please ensure all related records and roles are valid.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/project-users/:id', requireRole(['admin']), (req, res) => {
  const userId = req.params.id;
  try {
    const oldUserRow = db.prepare(`
      SELECT u.username, u.full_name, u.email, u.phone, u.is_active, r.name as role 
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `).get(userId);

    if (!oldUserRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    deleteTx();
    auditLog(req.user.username, 'DELETE', 'UserManagement', userId, oldUserRow, null);

    res.json({ success: true });
  } catch (err) {
    /* console.error('ERROR in DELETE /api/project-users/:id:', err); */
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'This user cannot be deleted because they have associated records (e.g. Invoices, Purchase Orders, or Delivery Challans) in the system. To disable their access, please set their status to Inactive instead.' });
    }
    res.status(500).json({ error: err.message });
  }
});

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
      WHERE po_number LIKE ? AND status != 'revised'
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Audit log ---
app.get('/api/audit-log', requireRole(['admin', 'management']), (req, res) => {
  try {
    const rows = db.prepare(`SELECT al.*, u.full_name as user_name FROM audit_log al LEFT JOIN users u ON al.user_id=u.id ORDER BY al.created_at DESC LIMIT 500`).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Dashboard ---
app.get('/api/dashboard', authenticate, (req, res) => {
  try {
    const isSales = req.user.role?.toLowerCase() === 'sales';
    const userId = req.user.id;

    const stats = {
      pending_regular_pos: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE is_nt_po = 0 AND status IN ('pending', 'rejected') AND status != 'revised' AND created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE is_nt_po = 0 AND status IN ('pending', 'rejected') AND status != 'revised'`).get().c,

      pending_nt_pos: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE is_nt_po = 1 AND status IN ('nt_created', 'rejected') AND status != 'revised' AND created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE is_nt_po = 1 AND status IN ('nt_created', 'rejected') AND status != 'revised'`).get().c,

      active_pos: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE status NOT IN ('rejected','invoice_closed','revised') AND created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE status NOT IN ('rejected','invoice_closed','revised')`).get().c,

      pending_pos: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE status IN ('pending', 'nt_created') AND status != 'revised' AND created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE status IN ('pending', 'nt_created') AND status != 'revised'`).get().c,

      pending_dcs: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM dc_requests dr JOIN purchase_orders po ON dr.po_id = po.id WHERE dr.status='dc_requested' AND po.created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM dc_requests WHERE status='dc_requested'`).get().c,

      pending_invoices: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM invoices i JOIN purchase_orders po ON i.po_id = po.id WHERE i.status IN ('draft','raised') AND po.created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE status IN ('draft','raised')`).get().c,

      pending_invoice_requests: isSales
        ? (
          db.prepare(`SELECT COUNT(*) as c FROM delivery_challans dc JOIN purchase_orders po ON dc.po_id = po.id WHERE dc.status IN ('delivery_confirmed', 'partially_invoiced') AND (dc.invoicing_status IS NULL OR dc.invoicing_status != 'fully_invoiced') AND po.created_by = ?`).get(userId).c +
          db.prepare(`SELECT COUNT(*) as c FROM scr_requests scr JOIN purchase_orders po ON scr.po_id = po.id WHERE scr.status = 'approved' AND (scr.invoicing_status IS NULL OR scr.invoicing_status != 'fully_invoiced') AND po.created_by = ?`).get(userId).c
        )
        : (
          db.prepare(`SELECT COUNT(*) as c FROM delivery_challans WHERE status IN ('delivery_confirmed', 'partially_invoiced') AND (invoicing_status IS NULL OR invoicing_status != 'fully_invoiced')`).get().c +
          db.prepare(`SELECT COUNT(*) as c FROM scr_requests WHERE status = 'approved' AND (invoicing_status IS NULL OR invoicing_status != 'fully_invoiced')`).get().c
        ),

      pending_ar: isSales
        ? db.prepare(`SELECT COUNT(*) as c FROM ar_entries ar JOIN purchase_orders po ON ar.po_id = po.id WHERE ar.status IN ('pending','partial') AND po.created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM ar_entries WHERE status IN ('pending','partial')`).get().c,

      total_customers: isSales
        ? db.prepare(`SELECT COUNT(DISTINCT customer_id) as c FROM purchase_orders WHERE created_by = ?`).get(userId).c
        : db.prepare(`SELECT COUNT(*) as c FROM customers`).get().c,
    };

    const recent_pos = isSales
      ? db.prepare(`SELECT po.po_number, po.order_id, po.status, po.grand_total, c.name as customer_name, po.updated_at FROM purchase_orders po JOIN customers c ON po.customer_id=c.id WHERE po.status != 'revised' AND po.created_by = ? ORDER BY po.updated_at DESC LIMIT 5`).all(userId)
      : db.prepare(`SELECT po.po_number, po.order_id, po.status, po.grand_total, c.name as customer_name, po.updated_at FROM purchase_orders po JOIN customers c ON po.customer_id=c.id WHERE po.status != 'revised' ORDER BY po.updated_at DESC LIMIT 5`).all();

    const recent_dcs = isSales
      ? db.prepare(`SELECT dc.dc_number, dc.status, po.po_number, dc.created_at FROM delivery_challans dc JOIN purchase_orders po ON dc.po_id=po.id WHERE po.status != 'revised' AND po.created_by = ? ORDER BY dc.created_at DESC LIMIT 5`).all(userId)
      : db.prepare(`SELECT dc.dc_number, dc.status, po.po_number, dc.created_at FROM delivery_challans dc JOIN purchase_orders po ON dc.po_id=po.id WHERE po.status != 'revised' ORDER BY dc.created_at DESC LIMIT 5`).all();

    const recent_invoices = isSales
      ? db.prepare(`SELECT inv.invoice_number, inv.status, inv.grand_total, c.name as customer_name, inv.created_at FROM invoices inv JOIN customers c ON inv.customer_id=c.id JOIN purchase_orders po ON inv.po_id=po.id WHERE po.created_by = ? ORDER BY inv.created_at DESC LIMIT 5`).all(userId)
      : db.prepare(`SELECT inv.invoice_number, inv.status, inv.grand_total, c.name as customer_name, inv.created_at FROM invoices inv JOIN customers c ON inv.customer_id=c.id ORDER BY inv.created_at DESC LIMIT 5`).all();

    res.json({ stats, recent_pos, recent_dcs, recent_invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  } catch (err) {
    /* console.error('ERROR:', err); */
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
  } catch (err) {
    /* console.error('ERROR:', err); */
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

    if (spoc2_phone && contact_phone === spoc2_phone) {
      return res.status(400).json({ error: 'Primary and Secondary Contact Phone numbers cannot be the same' });
    }
    if (spoc2_email && spoc2_email.trim() && contact_email?.trim().toLowerCase() === spoc2_email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Primary and Secondary Contact Emails cannot be the same' });
    }
    if (spoc2_name && spoc2_name.trim() && contact_name?.trim().toLowerCase() === spoc2_name.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Primary and Secondary Contact Names cannot be the same' });
    }

    if (gstin && gstin.length === 15) {
      const panFromGstin = gstin.substring(2, 12);
      if (!pan) {
        return res.status(400).json({ error: 'PAN is required' });
      } else if (pan !== panFromGstin) {
        return res.status(400).json({ error: 'PAN must match the PAN portion of the GSTIN' });
      }
    }

    if (pan) {
      const existingPAN = db.prepare('SELECT id FROM customers WHERE pan = ?').get(pan);
      if (existingPAN) return res.status(400).json({ error: 'PAN number already exists for another customer' });
    }

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
      cust_code, name, legal_name || '', pan || '', gstin,
      address_line1 || '', address_line2 || '', address_line3 || '', city || '', state || '', pincode,
      contact_name || '', contact_department || '',
      contact_email || '', contact_phone || '',
      spoc2_name || '', spoc2_department || '',
      spoc2_email || '', spoc2_phone || '',
      email || '', phone || '',
      1, req.user.id
    );

    res.json({ success: true, id: result.lastInsertRowid, cust_code });
  } catch (err) {
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', requireRole(['admin']), (req, res) => {
  /* console.log('DELETE REQUEST FOR CUSTOMER:', req.params.id); */
  const customerId = req.params.id;
  try {
    const deleteTx = db.transaction(() => {
      const poIds = db.prepare('SELECT id FROM purchase_orders WHERE customer_id = ?').all(customerId).map(r => r.id);
      const dcIds = db.prepare('SELECT id FROM delivery_challans WHERE customer_id = ?').all(customerId).map(r => r.id);
      const invoiceIds = db.prepare('SELECT id FROM invoices WHERE customer_id = ?').all(customerId).map(r => r.id);
      const invoiceReqIds = poIds.length > 0 ? db.prepare(`SELECT id FROM invoice_requests WHERE po_id IN (${poIds.map(() => '?').join(',')})`).all(...poIds).map(r => r.id) : [];
      const dcReqIds = poIds.length > 0 ? db.prepare(`SELECT id FROM dc_requests WHERE po_id IN (${poIds.map(() => '?').join(',')})`).all(...poIds).map(r => r.id) : [];

      // 1. Finance / AR (Top of the chain)
      if (invoiceIds.length > 0) {
        const placeholders = invoiceIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM ar_receipts WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch (e) { }
        try { db.prepare(`DELETE FROM ar_payments WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch (e) { }
        try { db.prepare(`DELETE FROM ar_entries WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch (e) { }
        try { db.prepare(`DELETE FROM invoice_items WHERE invoice_id IN (${placeholders})`).run(...invoiceIds); } catch (e) { }
      }
      try { db.prepare('DELETE FROM ar_entries WHERE customer_id = ?').run(customerId); } catch (e) { }
      try { db.prepare('DELETE FROM ar_receipts WHERE customer_id = ?').run(customerId); } catch (e) { }

      // 2. Invoices & Requests
      if (invoiceReqIds.length > 0) {
        const placeholders = invoiceReqIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM invoice_request_dcs WHERE invoice_request_id IN (${placeholders})`).run(...invoiceReqIds); } catch (e) { }
      }
      if (dcIds.length > 0) {
        const placeholders = dcIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM invoice_request_dcs WHERE dc_id IN (${placeholders})`).run(...dcIds); } catch (e) { }
      }
      db.prepare('DELETE FROM invoices WHERE customer_id = ?').run(customerId);
      if (poIds.length > 0) {
        const placeholders = poIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM invoice_requests WHERE po_id IN (${placeholders})`).run(...poIds); } catch (e) { }
      }

      // 3. Logistics / DC
      if (dcIds.length > 0) {
        const placeholders = dcIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM dc_line_items WHERE dc_id IN (${placeholders})`).run(...dcIds); } catch (e) { }
        try { db.prepare(`DELETE FROM delivery_challan_items WHERE dc_id IN (${placeholders})`).run(...dcIds); } catch (e) { }
      }
      db.prepare('DELETE FROM delivery_challans WHERE customer_id = ?').run(customerId);

      if (dcReqIds.length > 0) {
        const placeholders = dcReqIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM dc_request_items WHERE dc_request_id IN (${placeholders})`).run(...dcReqIds); } catch (e) { }
        try { db.prepare(`DELETE FROM dc_requests WHERE id IN (${placeholders})`).run(...dcReqIds); } catch (e) { }
      }

      // 4. Orders / PO
      if (poIds.length > 0) {
        const placeholders = poIds.map(() => '?').join(',');
        try { db.prepare(`DELETE FROM po_version_history WHERE po_id IN (${placeholders})`).run(...poIds); } catch (e) { }
        try { db.prepare(`DELETE FROM po_line_items WHERE po_id IN (${placeholders})`).run(...poIds); } catch (e) { }

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
    /* console.error('DELETE ERROR:', err); */
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

    if (spoc2_phone && contact_phone === spoc2_phone) {
      return res.status(400).json({ error: 'Primary and Secondary Contact Phone numbers cannot be the same' });
    }
    if (spoc2_email && spoc2_email.trim() && contact_email?.trim().toLowerCase() === spoc2_email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Primary and Secondary Contact Emails cannot be the same' });
    }
    if (spoc2_name && spoc2_name.trim() && contact_name?.trim().toLowerCase() === spoc2_name.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Primary and Secondary Contact Names cannot be the same' });
    }

    if (gstin && gstin.length === 15) {
      const panFromGstin = gstin.substring(2, 12);
      if (!pan) {
        return res.status(400).json({ error: 'PAN is required' });
      } else if (pan !== panFromGstin) {
        return res.status(400).json({ error: 'PAN must match the PAN portion of the GSTIN' });
      }
    }

    if (pan) {
      const existingPAN = db.prepare('SELECT id FROM customers WHERE pan = ? AND id != ?').get(pan, req.params.id);
      if (existingPAN) return res.status(400).json({ error: 'PAN number already exists for another customer' });
    }

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
      cust_code, name, legal_name || '', pan || '', gstin,
      address_line1 || '', address_line2 || '', address_line3 || '', city || '', state || '', pincode,
      contact_name || '', contact_department || '',
      contact_email || '', contact_phone || '',
      spoc2_name || '', spoc2_department || '',
      spoc2_email || '', spoc2_phone || '',
      email || '', phone || '',
      req.params.id
    );

    res.json({ success: true });
  } catch (err) {
    /* console.error('ERROR:', err); */
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
  } catch (err) {
    /* console.error('ERROR:', err); */
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

    const phoneRegex = /^[0-9]{10}$/;
    if (!contact_phone || !phoneRegex.test(contact_phone.trim())) {
      return res.status(400).json({ error: 'Contact phone is required and must be exactly 10 digits.' });
    }
    if (spoc2_phone && !phoneRegex.test(spoc2_phone.trim())) {
      return res.status(400).json({ error: 'Secondary SPOC phone must be exactly 10 digits.' });
    }

    const result = db.prepare(`
      INSERT INTO customer_locations (
        customer_id, label, address_line1, address_line2,
        address_line3, city, state, pincode, gstin,
        gst_is_different, contact_name, contact_email, contact_phone,
        spoc2_name, spoc2_department, spoc2_email, spoc2_phone
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      customer_id, label, address_line1 || '', address_line2 || '',
      address_line3 || '', city || '', state || '', pincode, gstin || '',
      gst_is_different ? 1 : 0, contact_name || '', contact_email || '', contact_phone || '',
      spoc2_name || '', spoc2_department || '', spoc2_email || '', spoc2_phone || ''
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    /* console.error('ERROR:', err); */
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

    const phoneRegex = /^[0-9]{10}$/;
    if (!contact_phone || !phoneRegex.test(contact_phone.trim())) {
      return res.status(400).json({ error: 'Contact phone is required and must be exactly 10 digits.' });
    }
    if (spoc2_phone && !phoneRegex.test(spoc2_phone.trim())) {
      return res.status(400).json({ error: 'Secondary SPOC phone must be exactly 10 digits.' });
    }

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
      label, address_line1 || '', address_line2 || '',
      address_line3 || '', city || '', state || '', pincode, gstin || '',
      gst_is_different ? 1 : 0, contact_name || '',
      contact_email || '', contact_phone || '',
      spoc2_name || '', spoc2_department || '',
      spoc2_email || '', spoc2_phone || '',
      req.params.id
    );

    res.json({ success: true });
  } catch (err) {
    /* console.error('ERROR:', err); */
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
  } catch (err) {
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

// --- Purchase Orders ---
app.get('/api/pos', authenticate, (req, res) => {
  try {
    const { status, type, customer_id } = req.query;
    let sql = `
      SELECT 
        p.id, p.order_id, p.po_number, p.status,
        p.is_nt_po, p.is_temporary, p.is_temp_po,
        p.grand_total, p.subtotal, p.gst_total,
        p.total_value, p.po_date, p.created_at,
        p.customer_id, p.location_id,
        p.need_sales_invoice_approval,
        p.start_date, p.end_date,
        p.project_spoc_name, p.project_spoc_email, p.project_spoc_phone,
        p.spoc_name, p.spoc_email, p.spoc_phone,
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

    if (customer_id) {
      conditions.push(`p.customer_id = ?`);
      params.push(customer_id);
    }

    if (type === 'original') {
      conditions.push(`p.parent_po_id IS NULL AND p.is_nt_po = 0 AND p.is_temporary = 0`);
    } else {
      if (status) {
        conditions.push(`p.status = ?`);
        params.push(status);
      } else {
        conditions.push(`p.status != 'revised'`);
      }
    }

    if (req.user.role?.toLowerCase() === 'sales') {
      conditions.push(`p.created_by = ?`);
      params.push(req.user.id);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY p.created_at DESC`;

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR:', err); */
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
        COALESCE(p.spoc_name, cl.contact_name) as spoc_name,
        COALESCE(p.spoc_phone, cl.contact_phone) as spoc_phone,
        COALESCE(p.spoc_email, cl.contact_email) as spoc_email
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

    const parentId = po.parent_po_id || po.id;
    const revisionHistory = db.prepare(`
      SELECT id, po_number, status, grand_total, created_at, version, version_number, is_original 
      FROM purchase_orders 
      WHERE id = ? OR parent_po_id = ? 
      ORDER BY version ASC
    `).all(parentId, parentId);

    res.json({ ...po, items, revision_history: revisionHistory });
  } catch (err) {
    /* console.error('ERROR:', err); */
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
      items, project_spoc_name, project_spoc_email, project_spoc_phone,
      spoc_name, spoc_email, spoc_phone,
      need_sales_invoice_approval, remarks
    } = req.body;

    const phoneRegex = /^[0-9]{10}$/;
    if (project_spoc_phone && !phoneRegex.test(project_spoc_phone.trim())) {
      return res.status(400).json({ error: 'Project SPOC Contact Number must be exactly 10 digits.' });
    }

    if (location_id) {
      const loc = db.prepare('SELECT contact_phone FROM customer_locations WHERE id = ?').get(location_id);
      if (loc && loc.contact_phone && !phoneRegex.test(loc.contact_phone.trim())) {
        return res.status(400).json({ error: 'Customer SPOC phone must be exactly 10 digits. Please update it in Customer/Location Master.' });
      }
    }

    const safeLinkedPoId = linked_po_id && linked_po_id !== '' ? parseInt(linked_po_id) : null;
    let finalLinkedPoId = safeLinkedPoId;
    if (safeLinkedPoId) {
      const linkedPO = db.prepare('SELECT original_po_id FROM purchase_orders WHERE id = ?').get(safeLinkedPoId);
      if (linkedPO && linkedPO.original_po_id) {
        finalLinkedPoId = linkedPO.original_po_id;
      }
    }
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

    // Inherit Project & Customer SPOC details from parent PO if this is a linked NT PO and not provided by frontend
    let finalSpocName = project_spoc_name;
    let finalSpocEmail = project_spoc_email;
    let finalSpocPhone = project_spoc_phone;
    let finalCustomerSpocName = spoc_name;
    let finalCustomerSpocEmail = spoc_email;
    let finalCustomerSpocPhone = spoc_phone;
    let finalNeedApproval = need_sales_invoice_approval || 'yes';

    if (finalLinkedPoId) {
      const parentPO = db.prepare('SELECT project_spoc_name, project_spoc_email, project_spoc_phone, spoc_name, spoc_email, spoc_phone, need_sales_invoice_approval FROM purchase_orders WHERE id = ?').get(finalLinkedPoId);
      if (parentPO) {
        if (!finalSpocName || !finalSpocName.trim()) finalSpocName = parentPO.project_spoc_name;
        if (!finalSpocEmail || !finalSpocEmail.trim()) finalSpocEmail = parentPO.project_spoc_email;
        if (!finalSpocPhone || !finalSpocPhone.trim()) finalSpocPhone = parentPO.project_spoc_phone;
        if (!finalCustomerSpocName || !finalCustomerSpocName.trim()) finalCustomerSpocName = parentPO.spoc_name;
        if (!finalCustomerSpocEmail || !finalCustomerSpocEmail.trim()) finalCustomerSpocEmail = parentPO.spoc_email;
        if (!finalCustomerSpocPhone || !finalCustomerSpocPhone.trim()) finalCustomerSpocPhone = parentPO.spoc_phone;
        if (!need_sales_invoice_approval) finalNeedApproval = parentPO.need_sales_invoice_approval || 'yes';
      }
    }

    db.exec('BEGIN');
    const r = db.prepare(`
      INSERT INTO purchase_orders (
        order_id, customer_id, location_id,
        po_number, po_date, start_date, end_date,
        status, is_nt_po, is_temporary,
        linked_po_id, subtotal, gst_total, grand_total,
        total_value, po_copy_path, po_annex_path, other_attachment_path,
        created_by, project_spoc_name, project_spoc_email, project_spoc_phone,
        spoc_name, spoc_email, spoc_phone,
        need_sales_invoice_approval, remarks
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      order_id, customer_id, location_id,
      finalPONumber, po_date || null, start_date || null, end_date || null,
      status, safeIsNtPo, safeIsTemp,
      finalLinkedPoId, subtotal || 0, gst_total || 0, grand_total || 0,
      grand_total || 0, po_copy_path || null, po_annex_path || null, other_attachment_path || null,
      req.user.id, finalSpocName || null, finalSpocEmail || null, finalSpocPhone || null,
      finalCustomerSpocName || null, finalCustomerSpocEmail || null, finalCustomerSpocPhone || null,
      finalNeedApproval, remarks || null
    );

    const poId = r.lastInsertRowid;
    db.prepare('UPDATE purchase_orders SET original_po_id = ?, version_number = 1, is_original = 1 WHERE id = ?').run(poId, poId);
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

    triggerNotification(db, 'SO_UPLOAD', {
      soId: poId,
      performedBy: req.user.full_name || req.user.username
    }).catch(err => console.error('Failed to trigger SO_UPLOAD notification:', err));

    res.json({ success: true, order_id, po_id: poId });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

const generateSCRsForPO = db.transaction((poId, userId) => {
  const existingSCRCount = db.prepare('SELECT COUNT(*) as count FROM scr_requests WHERE po_id = ?').get(poId).count;
  if (existingSCRCount > 0) return;

  const po = db.prepare('SELECT location_id, end_date, project_spoc_name, project_spoc_phone FROM purchase_orders WHERE id = ?').get(poId);
  if (!po) return;

  const serviceItems = db.prepare('SELECT id, package_name, service_qty FROM po_line_items WHERE po_id = ? AND service_qty > 0').all(poId);
  if (serviceItems.length === 0) return;

  const uniquePkgs = [...new Set(serviceItems.map(it => it.package_name || 'General'))];
  const combinedPackageName = uniquePkgs.join(', ');

  const lastSCR = db.prepare("SELECT scr_number FROM scr_requests WHERE scr_number LIKE 'SCR/%' ORDER BY id DESC LIMIT 1").get();
  let nextNum = 1;
  if (lastSCR && lastSCR.scr_number && lastSCR.scr_number.startsWith('SCR/')) {
    const parts = lastSCR.scr_number.split('/');
    nextNum = parseInt(parts[parts.length - 1]) + 1;
  }
  const scr_number = `SCR/2026/${String(nextNum).padStart(3, '0')}`;

  const scrInsert = db.prepare(`
    INSERT INTO scr_requests (
      scr_number, po_id, location_id, expected_delivery_date, pm_name, pm_phone,
      status, remarks, created_by, package_name, civil_completed, power_available,
      storage_secured, access_cleared, safety_equipment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'Automatically generated upon PO approval.', ?, ?, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    scr_number,
    poId,
    po.location_id,
    po.end_date || null,
    po.project_spoc_name || null,
    po.project_spoc_phone || null,
    userId || 1,
    combinedPackageName
  );
  const scrId = scrInsert.lastInsertRowid;

  const lineStmt = db.prepare(`
    INSERT INTO scr_line_items (scr_id, po_line_item_id, service_qty, invoice_qty, invoiced_qty)
    VALUES (?, ?, ?, ?, 0)
  `);
  serviceItems.forEach(it => {
    lineStmt.run(scrId, it.id, it.service_qty, it.service_qty);
  });
});

app.put('/api/pos/:id/status', authenticate, (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'nt_created', 'accepted', 'approved', 'rejected',
      'dc_raised', 'invoice_raised', 'closed'];
    const statusToUpdate = (status === 'approved' || status === 'accepted') ? 'approved' : status;
    if (!valid.includes(statusToUpdate)) {
      return res.status(400).json({ error: 'Invalid status: ' + status });
    }

    const oldPO = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!oldPO) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    db.prepare(
      'UPDATE purchase_orders SET status = ? WHERE id = ?'
    ).run(statusToUpdate, req.params.id);

    if (statusToUpdate === 'approved') {
      generateSCRsForPO(req.params.id, req.user?.id);

      if (oldPO.status !== 'approved') {
        const eventKey = oldPO.version_number > 1 ? 'SO_EDITED_APPROVED' : 'SO_ACCEPTED';
        triggerNotification(db, eventKey, {
          soId: oldPO.id,
          performedBy: req.user.full_name || req.user.username,
          extraDetails: {
            'Version': oldPO.version_number,
            'Order Date': oldPO.po_date || 'N/A',
            'Grand Total': `₹${(oldPO.grand_total || 0).toLocaleString('en-IN')}`,
            'Project SPOC': `${oldPO.project_spoc_name || 'N/A'} (${oldPO.project_spoc_email || 'N/A'})`
          },
          customCc: oldPO.project_spoc_email ? [oldPO.project_spoc_email] : []
        }).catch(err => console.error(`Failed to trigger ${eventKey} notification:`, err));
      }
    }

    res.json({ success: true, status: statusToUpdate });
  } catch (err) {
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pos/:id', requireRole(['sales', 'admin', 'accounts', 'management']), (req, res) => {
  const { status, items, project_spoc_name, project_spoc_email, project_spoc_phone, need_sales_invoice_approval, remarks } = req.body;

  const phoneRegex = /^[0-9]{10}$/;
  if (project_spoc_phone !== undefined && project_spoc_phone !== null) {
    if (!phoneRegex.test(project_spoc_phone.trim())) {
      return res.status(400).json({ error: 'Project SPOC Contact Number must be exactly 10 digits.' });
    }
  }

  try {
    db.exec('BEGIN');
    const oldPO = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(req.params.id);
    if (!oldPO) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'PO not found' });
    }

    if (oldPO.status === 'revised') {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'This PO has already been revised and cannot be edited again.' });
    }

    const parentId = oldPO.parent_po_id || oldPO.id;

    // Fetch the true original PO's po_number to use as the basePO reference
    const parentPO = db.prepare("SELECT po_number FROM purchase_orders WHERE id = ?").get(parentId);
    const basePO = parentPO ? parentPO.po_number : oldPO.po_number;

    const existing = db.prepare(`
      SELECT po_number FROM purchase_orders 
      WHERE id = ? OR parent_po_id = ?
    `).all(parentId, parentId);

    let maxRev = 0;
    existing.forEach(p => {
      if (p.po_number.startsWith(basePO + '-')) {
        const suffix = p.po_number.substring(basePO.length + 1);
        if (/^\d{2}$/.test(suffix)) {
          const revNum = parseInt(suffix, 10);
          if (revNum > maxRev) maxRev = revNum;
        }
      }
    });

    const nextRev = maxRev + 1;
    const revisedPONumber = `${basePO}-${String(nextRev).padStart(2, '0')}`;
    const nextVersion = nextRev + 1; // version column: 1 is original, 2 is first revision, etc.

    // 1. Snapshot the old PO in po_version_history
    const oldItems = db.prepare('SELECT * FROM po_line_items WHERE po_id = ?').all(oldPO.id);
    db.prepare(`
      INSERT INTO po_version_history (po_id, version, snapshot_json, change_summary, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      oldPO.id,
      oldPO.version || 1,
      JSON.stringify({ po: oldPO, items: oldItems }),
      `Revised to ${revisedPONumber}`,
      req.user.id
    );

    // 2. Mark old PO as 'revised'
    db.prepare("UPDATE purchase_orders SET status = 'revised', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(oldPO.id);

    // 3. Calculate new totals
    let subtotal = 0, gst_total = 0;
    if (items && items.length) {
      items.forEach(it => {
        subtotal += (it.total_taxable || 0);
        gst_total += (it.total_gst || 0);
      });
    }

    // 4. Create new PO revision record
    const originalPoId = oldPO.original_po_id || parentId;
    const r = db.prepare(`
      INSERT INTO purchase_orders (
        order_id, customer_id, location_id,
        po_number, po_date, start_date, end_date,
        status, version, is_temp_po, is_temporary, is_nt_po,
        parent_po_id, original_po_id, version_number, is_original, linked_po_id, po_copy_path, po_annex_path, other_attachment_path,
        created_by, project_spoc_name, project_spoc_email, project_spoc_phone,
        spoc_name, spoc_email, spoc_phone,
        need_sales_invoice_approval, subtotal, gst_total, grand_total, total_value, nt_count, remarks
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      'ORD-' + Date.now(), oldPO.customer_id, oldPO.location_id,
      revisedPONumber, oldPO.po_date || null, oldPO.start_date || null, oldPO.end_date || null,
      status || oldPO.status, nextVersion, oldPO.is_temp_po, oldPO.is_temporary, oldPO.is_nt_po,
      parentId, originalPoId, nextVersion, 0, oldPO.linked_po_id, oldPO.po_copy_path || null, oldPO.po_annex_path || null, oldPO.other_attachment_path || null,
      oldPO.created_by,
      project_spoc_name !== undefined ? project_spoc_name : oldPO.project_spoc_name,
      project_spoc_email !== undefined ? project_spoc_email : oldPO.project_spoc_email,
      project_spoc_phone !== undefined ? project_spoc_phone : oldPO.project_spoc_phone,
      oldPO.spoc_name || null, oldPO.spoc_email || null, oldPO.spoc_phone || null,
      need_sales_invoice_approval || oldPO.need_sales_invoice_approval || 'yes',
      subtotal, gst_total, subtotal + gst_total, subtotal + gst_total, oldPO.nt_count || 0,
      remarks !== undefined ? remarks : oldPO.remarks
    );

    const newPoId = r.lastInsertRowid;

    // 5. Insert new po_line_items, mapping qty_delivered and qty_invoiced from previous version matching item ids
    const itemStmt = db.prepare(`
      INSERT INTO po_line_items (
        po_id, line_number, reference_number, package_name, heading,
        sub_heading, item_name, description,
        uom, supply_qty, supply_rate, supply_gst_rate,
        service_qty, service_rate, service_gst_rate,
        taxable_supply, gst_supply, total_supply,
        taxable_service, gst_service, total_service,
        total_taxable, total_gst, total_invoice,
        qty_delivered, qty_invoiced,
        edit_supply_qty, edit_supply_rate, edit_supply_gst_rate,
        edit_service_qty, edit_service_rate, edit_service_gst_rate
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    if (items && items.length) {
      items.forEach((it, index) => {
        let qtyDelivered = 0;
        let qtyInvoiced = 0;
        if (it.id) {
          const oldItem = db.prepare('SELECT qty_delivered, qty_invoiced FROM po_line_items WHERE id = ?').get(it.id);
          if (oldItem) {
            qtyDelivered = oldItem.qty_delivered || 0;
            qtyInvoiced = oldItem.qty_invoiced || 0;
          }
        }
        itemStmt.run(
          newPoId, index + 1,
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
          qtyDelivered,
          qtyInvoiced,
          it.edit_supply_qty || null,
          it.edit_supply_rate || null,
          it.edit_supply_gst_rate || null,
          it.edit_service_qty || null,
          it.edit_service_rate || null,
          it.edit_service_gst_rate || null
        );
      });
    }

    // 6. Migrate in-flight transactions to the new PO ID so they seamlessly link to the active PO
    db.prepare("UPDATE dc_requests SET po_id = ? WHERE po_id = ? AND status = 'pending'").run(newPoId, oldPO.id);
    db.prepare("UPDATE delivery_challans SET po_id = ? WHERE po_id = ? AND status = 'raised'").run(newPoId, oldPO.id);
    db.prepare("UPDATE invoice_requests SET po_id = ? WHERE po_id = ? AND status = 'pending'").run(newPoId, oldPO.id);
    db.prepare("UPDATE invoices SET po_id = ? WHERE po_id = ? AND status = 'draft'").run(newPoId, oldPO.id);

    db.exec('COMMIT');

    triggerNotification(db, 'SO_EDITED', {
      soId: newPoId,
      performedBy: req.user.full_name || req.user.username,
      extraDetails: {
        'Revision': `v${oldPO.version_number + 1}`,
        'Previous Status': oldPO.status || 'N/A',
        'Grand Total': `₹${(oldPO.grand_total || 0).toLocaleString('en-IN')}`
      }
    }).catch(err => console.error('Failed to trigger SO_EDITED notification:', err));

    res.json({ success: true, id: newPoId, po_number: revisedPONumber });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
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
  } catch (err) { db.exec('ROLLBACK'); res.status(500).json({ error: err.message }); }
});

// --- Excel Parse ---
app.post('/api/parse-po-excel', requireRole(['sales', 'admin']), upload.single('document'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = xlsx.readFile(req.file.path);
    const rawData = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    let headerIdx = 0, maxScore = -1;
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const s = rawData[i].map(c => String(c).toLowerCase()).join(' ');
      let sc = 0;
      if (s.includes('s.no') || s.includes('sl') || s.includes('serial')) sc += 2;
      if (s.includes('description') || s.includes('item') || s.includes('particulars')) sc += 2;
      if (s.includes('qty') || s.includes('quantity')) sc += 2;
      if (s.includes('rate') || s.includes('unit cost')) sc += 2;
      if (s.includes('amount') || s.includes('value') || s.includes('total')) sc += 2;
      if (s.includes('gst') || s.includes('tax')) sc += 2;
      if (s.includes('package')) sc += 2;
      sc += rawData[i].filter(c => c !== '').length * 0.5;
      if (sc > maxScore) { maxScore = sc; headerIdx = i; }
    }
    const rawHeaders = rawData[headerIdx];
    const validIdx = rawHeaders.map((h, i) => h !== '' && h !== null && h !== undefined ? i : -1).filter(i => i >= 0);
    const headers = validIdx.map(i => rawHeaders[i]);
    const rows = rawData.slice(headerIdx + 1).filter(r => r.some(c => c !== '')).map(r => validIdx.map(i => r[i] || ''));

    // Column mapping
    const hLow = headers.map(h => String(h).toLowerCase().replace(/\s+/g, ''));
    const colIdx = (keys) => { for (const k of keys) { const i = hLow.findIndex(h => h.includes(k)); if (i >= 0) return i; } return -1; };
    const mapping = {
      serial: colIdx(['s.no', 'slno', 'sno', 'no.']),
      package: colIdx(['package']),
      heading: colIdx(['heading']),
      sub_heading: colIdx(['subheading', 'sub-heading']),
      item_name: colIdx(['description', 'item', 'particulars', 'material']),
      uom: colIdx(['uom', 'unit']),
      quantity: colIdx(['qty', 'quantity']),
      rate: colIdx(['rate', 'unitcost', 'unitprice']),
      gst_percent: colIdx(['gstrate', 'gst%', 'igst', 'taxrate']),
      taxable_value: colIdx(['taxablevalue', 'taxableamount']),
      gst_amount: colIdx(['gstamount', 'gstvalue']),
      total_value: colIdx(['total', 'invoicevalue', 'amount']),
    };

    const skipWords = ['total', 'gst', 'taxable', 'subtotal', 'cgst', 'sgst', 'igst', 'grand'];
    const items = []; let lastItem = null;
    for (const row of rows) {
      const get = (col) => col >= 0 ? row[col] : '';
      const nameVal = String(get(mapping.item_name)).trim();
      if (!nameVal) continue;
      if (skipWords.some(w => nameVal.toLowerCase().includes(w))) continue;
      const qty = parseFloat(get(mapping.quantity)) || 0;
      const rate = parseFloat(get(mapping.rate)) || 0;
      if (qty > 0 || rate > 0) {
        const gstPct = parseFloat(get(mapping.gst_percent)) || 0;
        const taxable = parseFloat(get(mapping.taxable_value)) || (qty * rate);
        const gstAmt = parseFloat(get(mapping.gst_amount)) || (taxable * gstPct / 100);
        const total = parseFloat(get(mapping.total_value)) || (taxable + gstAmt);
        lastItem = { package_name: String(get(mapping.package)).trim() || '', heading: String(get(mapping.heading)).trim() || '', sub_heading: String(get(mapping.sub_heading)).trim() || '', item_name: nameVal, description: '', uom: String(get(mapping.uom)).trim() || '', quantity: qty, rate_per_unit: rate, gst_percent: gstPct, taxable_value: taxable, gst_amount: gstAmt, total_value: total };
        items.push(lastItem);
      } else if (lastItem) {
        lastItem.description = (lastItem.description ? lastItem.description + '\n' : '') + nameVal;
      }
    }
    res.json({ items, headers, rows, file_path: req.file.path });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Invoices & AR ---
app.post('/api/invoices', authenticate, (req, res) => {
  try {
    const {
      po_id, dc_id, scr_id, customer_id, invoice_date, due_date, notes,
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
      let scr = null;
      if (scr_id) {
        scr = db.prepare('SELECT * FROM scr_requests WHERE id = ?').get(scr_id);
      }
      if (scr) {
        let baseNumber = scr.scr_number;
        invoice_number = baseNumber;
        let suffix = 0;
        while (
          db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number) ||
          db.prepare("SELECT id FROM invoice_requests WHERE request_number = ?").get(invoice_number)
        ) {
          suffix++;
          invoice_number = `${baseNumber}-${suffix}`;
        }
        initialStatus = 'sales_pending';
      } else {
        // Generate REQ number
        invoice_number = 'REQ/' + new Date().getFullYear() + '/' + String(Date.now()).slice(-4);
        initialStatus = 'requested';
      }
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
      if (it.scr_line_item_id) {
        const scrItem = db.prepare('SELECT invoice_qty, invoiced_qty FROM scr_line_items WHERE id = ?').get(it.scr_line_item_id);
        if (scrItem) {
          const targetQty = parseFloat(scrItem.invoice_qty) || 0;
          const invoiced = parseFloat(scrItem.invoiced_qty) || 0;
          const remaining = Math.max(0, targetQty - invoiced);
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
        invoice_number, po_id, dc_id, scr_id, customer_id,
        status, invoice_date, due_date, notes,
        subtotal, gst_total, grand_total, 
        place_of_supply, payment_terms, billing_address, shipping_address,
        created_by, internal_document_uuid
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      invoice_number, po_id, dc_id || null, scr_id || null, customer_id,
      initialStatus, invoice_date, due_date || null, notes || '',
      subtotal || 0, gst_total || 0, grand_total || 0,
      place_of_supply || '', payment_terms || '', billing_address || '', shipping_address || '',
      req.user.id, docUuid
    );

    const invoiceId = invResult.lastInsertRowid;

    if (initialStatus === 'sales_pending') {
      try {
        db.prepare(`
          INSERT INTO invoice_requests (request_number, po_id, status, requested_by)
          VALUES (?, ?, ?, ?)
        `).run(invoice_number, po_id, 'sales_pending', req.user.id);
      } catch (e) { }
    }

    // Persist Invoice Items and Update DC/SCR Item Tracking
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, po_line_item_id, dc_line_item_id, scr_line_item_id,
        package_name, item_name, description, quantity, rate, gst_percent, 
        taxable_value, gst_amount, total_value
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const updateDCItemStmt = db.prepare(`
      UPDATE dc_line_items 
      SET invoiced_qty = IFNULL(invoiced_qty, 0) + ? 
      WHERE id = ?
    `);

    const updateSCRItemStmt = db.prepare(`
      UPDATE scr_line_items 
      SET invoiced_qty = IFNULL(invoiced_qty, 0) + ? 
      WHERE id = ?
    `);

    (validItems).forEach(it => {
      itemStmt.run(
        invoiceId, it.po_line_item_id, it.dc_line_item_id || null, it.scr_line_item_id || null,
        it.package_name || '-', it.item_name, it.description || '',
        it.quantity, it.rate_per_unit, it.gst_percent,
        it.taxable_value, it.gst_amount, it.total_value
      );

      if (it.dc_line_item_id) {
        updateDCItemStmt.run(it.quantity, it.dc_line_item_id);
      }
      if (it.scr_line_item_id) {
        updateSCRItemStmt.run(it.quantity, it.scr_line_item_id);
        db.prepare(`
          UPDATE scr_line_items 
          SET status = CASE WHEN IFNULL(invoiced_qty, 0) >= service_qty THEN 'Fully Raised' ELSE 'pending' END
          WHERE id = ?
        `).run(it.scr_line_item_id);
      }
      if (it.po_line_item_id) {
        db.prepare(`
          UPDATE po_line_items 
          SET qty_invoiced = IFNULL(qty_invoiced, 0) + ? 
          WHERE id = ?
        `).run(it.quantity, it.po_line_item_id);
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

    // Check SCR Invoicing Status
    if (scr_id) {
      const scrItems = db.prepare('SELECT service_qty, invoiced_qty FROM scr_line_items WHERE scr_id = ?').all(scr_id);
      const isFullyInvoiced = scrItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.service_qty) || 0));
      const isPartiallyInvoiced = scrItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);

      let invStatus = 'pending';
      if (isFullyInvoiced) invStatus = 'fully_invoiced';
      else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

      db.prepare(`
        UPDATE scr_requests 
        SET invoicing_status = ?
        WHERE id = ?
      `).run(invStatus, scr_id);
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
        grand_total || 0, 0, grand_total || 0, 'pending'
      );
    }

    db.exec('COMMIT');
    auditLog(req.user.username, initialStatus === 'raised' ? 'CREATE' : 'REQUEST', 'Invoice', invoiceId, null, { invoice_number, grand_total });

    if (initialStatus === 'requested' || initialStatus === 'sales_pending') {
      triggerNotification(db, 'INVOICE_REQUESTED', {
        soId: po_id,
        performedBy: req.user.full_name || req.user.username,
        extraDetails: {
          'Request Number': invoice_number,
          'Type': 'Sales Invoice Request',
          'Grand Total': `₹${(grand_total || 0).toLocaleString('en-IN')}`
        }
      }).catch(err => console.error('Failed to trigger INVOICE_REQUESTED notification:', err));
    }

    res.json({ success: true, invoice_number, id: invoiceId });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices', authenticate, (req, res) => {
  try {
    let sql = `
      SELECT 
        i.*,
        c.name as customer_name,
        p.po_number as po_no,
        d.dc_number,
        scr.scr_number,
        ar.amount_received,
        ar.balance,
        ar.status as ar_status,
        u.full_name as raised_by_name,
        (SELECT GROUP_CONCAT(package_name, ', ') FROM invoice_items WHERE invoice_id = i.id) as package_names,
        (SELECT SUM(quantity) FROM invoice_items WHERE invoice_id = i.id) as total_quantity
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      LEFT JOIN delivery_challans d ON i.dc_id = d.id
      LEFT JOIN scr_requests scr ON i.scr_id = scr.id
      LEFT JOIN ar_entries ar ON i.id = ar.invoice_id
      LEFT JOIN users u ON i.created_by = u.id
    `;
    const params = [];
    if (req.user.role?.toLowerCase() === 'sales') {
      sql += ` WHERE (p.created_by = ? OR i.status = 'sales_pending' OR i.scr_id IS NOT NULL) `;
      params.push(req.user.id);
    } else if (req.user.role?.toLowerCase() === 'accounts') {
      sql += ` WHERE i.status != 'sales_pending' `;
    }
    sql += ` ORDER BY i.created_at DESC `;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
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
        scr.scr_number as scr_no, scr.expected_delivery_date as scr_date,
        ar.amount_received, ar.balance, ar.status as ar_status,
        u.full_name as raised_by_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN purchase_orders p ON i.po_id = p.id
      LEFT JOIN delivery_challans d ON i.dc_id = d.id
      LEFT JOIN scr_requests scr ON i.scr_id = scr.id
      LEFT JOIN ar_entries ar ON i.id = ar.invoice_id
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = db.prepare(`
      SELECT ii.*, COALESCE(dcli.hsn, '') as hsn, COALESCE(scli.service_qty, '') as service_qty
      FROM invoice_items ii
      LEFT JOIN dc_line_items dcli ON ii.dc_line_item_id = dcli.id
      LEFT JOIN scr_line_items scli ON ii.scr_line_item_id = scli.id
      LEFT JOIN po_line_items poli ON ii.po_line_item_id = poli.id
      WHERE ii.invoice_id = ?
    `).all(req.params.id);
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
  } catch (err) {
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
    /* console.error('ERROR in /api/pos/:id/payments:', err); */
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
    /* console.error('ERROR in /api/pos/:id/invoices:', err); */
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
        SUM(COALESCE(dli.received_qty, dli.quantity_dispatched)) as total_qty,
        SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
    /* console.error('ERROR in /api/pos/:id/supplied-details:', err); */
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
    /* console.error('ERROR in /api/pos/:id/pending-details:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/approve', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    db.exec('BEGIN');
    const oldInvoice = db.prepare("SELECT invoice_number FROM invoices WHERE id = ?").get(id);
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
    } catch (e) { }

    db.prepare("UPDATE invoices SET invoice_number = ?, status = 'raised', signature_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice_number, globalSig, id);

    if (oldInvoice) {
      try {
        db.prepare("UPDATE invoice_requests SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE request_number = ?").run(req.user.id, oldInvoice.invoice_number);
      } catch (e) { }
    }

    const invRow = db.prepare("SELECT scr_id FROM invoices WHERE id = ?").get(id);
    if (invRow && invRow.scr_id) {
      db.prepare("UPDATE scr_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invRow.scr_id);
    }

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

    triggerNotification(db, 'INVOICE_APPROVED', {
      soId: invoiceFull.po_id,
      performedBy: req.user.full_name || req.user.username,
      extraDetails: {
        'Invoice Number': invoice_number,
        'Type': 'Invoice Approval',
        'Grand Total': `₹${(invoiceFull.grand_total || 0).toLocaleString('en-IN')}`
      }
    }).catch(err => console.error('Failed to trigger INVOICE_APPROVED notification:', err));

    res.json({ success: true, invoice_number });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/reject', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    db.exec('BEGIN');

    // Get invoice details
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
    if (!inv) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (inv.status !== 'requested') {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Only pending invoice requests can be rejected.' });
    }

    // Get items of the invoice request
    const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(id);

    // Restore quantities
    for (const it of items) {
      if (it.scr_line_item_id) {
        db.prepare('UPDATE scr_line_items SET invoiced_qty = MAX(0, IFNULL(invoiced_qty, 0) - ?) WHERE id = ?').run(it.quantity, it.scr_line_item_id);
        db.prepare(`
          UPDATE scr_line_items 
          SET status = CASE WHEN IFNULL(invoiced_qty, 0) >= service_qty THEN 'Fully Raised' ELSE 'pending' END
          WHERE id = ?
        `).run(it.scr_line_item_id);
      }
      if (it.dc_line_item_id) {
        db.prepare('UPDATE dc_line_items SET invoiced_qty = MAX(0, IFNULL(invoiced_qty, 0) - ?) WHERE id = ?').run(it.quantity, it.dc_line_item_id);
      }
      if (it.po_line_item_id) {
        db.prepare('UPDATE po_line_items SET qty_invoiced = MAX(0, IFNULL(qty_invoiced, 0) - ?) WHERE id = ?').run(it.quantity, it.po_line_item_id);
      }
    }

    // Update invoice status to rejected
    db.prepare("UPDATE invoices SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    // If there is a corresponding invoice_requests record
    try {
      db.prepare("UPDATE invoice_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE request_number = ?").run(req.user.id, inv.invoice_number);
    } catch (e) { }

    // If it's an SCR invoice, update the SCR request's invoicing status
    if (inv.scr_id) {
      db.prepare("UPDATE scr_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(inv.scr_id);

      const scrItems = db.prepare('SELECT service_qty, invoiced_qty FROM scr_line_items WHERE scr_id = ?').all(inv.scr_id);
      const isFullyInvoiced = scrItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.service_qty) || 0));
      const isPartiallyInvoiced = scrItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);

      let invStatus = 'pending';
      if (isFullyInvoiced) invStatus = 'fully_invoiced';
      else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

      db.prepare(`
        UPDATE scr_requests 
        SET invoicing_status = ?
        WHERE id = ?
      `).run(invStatus, inv.scr_id);
    }

    // If it's a DC invoice, update the DC's invoicing status
    if (inv.dc_id) {
      const dcItems = db.prepare('SELECT quantity_dispatched, received_qty, invoiced_qty FROM dc_line_items WHERE dc_id = ?').all(inv.dc_id);
      const isFullyInvoiced = dcItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.received_qty ?? item.quantity_dispatched) || 0));
      const isPartiallyInvoiced = dcItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);

      let invStatus = 'pending';
      if (isFullyInvoiced) invStatus = 'fully_invoiced';
      else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

      let dcStatus = 'delivery_confirmed';
      if (isFullyInvoiced) dcStatus = 'fully_invoiced';
      else if (isPartiallyInvoiced) dcStatus = 'partially_invoiced';

      db.prepare(`
        UPDATE delivery_challans 
        SET status = ?, invoicing_status = ?
        WHERE id = ?
      `).run(dcStatus, invStatus, inv.dc_id);
    }

    db.exec('COMMIT');
    res.json({ success: true });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/sales-review', authenticate, requireRole(['sales', 'admin']), (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    db.exec('BEGIN');

    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
    if (!inv) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (inv.status !== 'sales_pending') {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Only pending sales invoice requests can be reviewed.' });
    }

    if (action === 'approved') {
      // Transition status to requested (Accounts approval pending)
      db.prepare("UPDATE invoices SET status = 'requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

      try {
        db.prepare("UPDATE invoice_requests SET status = 'pending', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE request_number = ?").run(req.user.id, inv.invoice_number);
      } catch (e) { }

    } else {
      // Rejection: Revert quantities and set status to rejected
      const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(id);

      // Restore quantities
      for (const it of items) {
        if (it.scr_line_item_id) {
          db.prepare('UPDATE scr_line_items SET invoiced_qty = MAX(0, IFNULL(invoiced_qty, 0) - ?) WHERE id = ?').run(it.quantity, it.scr_line_item_id);
          db.prepare(`
            UPDATE scr_line_items 
            SET status = CASE WHEN IFNULL(invoiced_qty, 0) >= service_qty THEN 'Fully Raised' ELSE 'pending' END
            WHERE id = ?
          `).run(it.scr_line_item_id);
        }
        if (it.dc_line_item_id) {
          db.prepare('UPDATE dc_line_items SET invoiced_qty = MAX(0, IFNULL(invoiced_qty, 0) - ?) WHERE id = ?').run(it.quantity, it.dc_line_item_id);
        }
        if (it.po_line_item_id) {
          db.prepare('UPDATE po_line_items SET qty_invoiced = MAX(0, IFNULL(qty_invoiced, 0) - ?) WHERE id = ?').run(it.quantity, it.po_line_item_id);
        }
      }

      db.prepare("UPDATE invoices SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

      try {
        db.prepare("UPDATE invoice_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE request_number = ?").run(req.user.id, inv.invoice_number);
      } catch (e) { }

      if (inv.scr_id) {
        db.prepare("UPDATE scr_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(inv.scr_id);

        const scrItems = db.prepare('SELECT service_qty, invoiced_qty FROM scr_line_items WHERE scr_id = ?').all(inv.scr_id);
        const isFullyInvoiced = scrItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.service_qty) || 0));
        const isPartiallyInvoiced = scrItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);

        let invStatus = 'pending';
        if (isFullyInvoiced) invStatus = 'fully_invoiced';
        else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

        db.prepare(`
          UPDATE scr_requests 
          SET invoicing_status = ?
          WHERE id = ?
        `).run(invStatus, inv.scr_id);
      }

      if (inv.dc_id) {
        const dcItems = db.prepare('SELECT quantity_dispatched, received_qty, invoiced_qty FROM dc_line_items WHERE dc_id = ?').all(inv.dc_id);
        const isFullyInvoiced = dcItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.received_qty ?? item.quantity_dispatched) || 0));
        const isPartiallyInvoiced = dcItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);

        let invStatus = 'pending';
        if (isFullyInvoiced) invStatus = 'fully_invoiced';
        else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

        let dcStatus = 'delivery_confirmed';
        if (isFullyInvoiced) dcStatus = 'fully_invoiced';
        else if (isPartiallyInvoiced) dcStatus = 'partially_invoiced';

        db.prepare(`
          UPDATE delivery_challans 
          SET status = ?, invoicing_status = ?
          WHERE id = ?
        `).run(dcStatus, invStatus, inv.dc_id);
      }
    }

    db.exec('COMMIT');
    try {
      auditLog(req.user.username, `SALES_REVIEW_${action.toUpperCase()}`, 'Invoices', id, null, { action });
    } catch (e) { }

    if (action === 'approved') {
      triggerNotification(db, 'INVOICE_REQUESTED', {
        soId: inv.po_id,
        performedBy: req.user.full_name || req.user.username,
        extraDetails: {
          'Request Number': inv.invoice_number,
          'Type': 'Sales Invoice Request approved by Sales',
          'Grand Total': `₹${(inv.grand_total || 0).toLocaleString('en-IN')}`
        }
      }).catch(err => console.error('Failed to trigger INVOICE_REQUESTED notification from sales review:', err));
    }

    res.json({ success: true });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
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
      const newReceived = parseFloat(((ar.amount_received || 0) + parseFloat(amount)).toFixed(2));
      const newBalance = Math.max(0, parseFloat((ar.amount_due - newReceived).toFixed(2)));
      const newStatus = newBalance <= 0.01 ? 'paid' : (newReceived > 0 ? 'partial' : 'pending');

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
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    /* console.error('ERROR:', err); */
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
  } catch (err) {
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
  } catch (err) {
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc', authenticate, (req, res) => {
  try {
    const {
      po_id, customer_id, location_id,
      dc_date, vehicle_number, driver_name, notes, items, email_to_project
    } = req.body;

    const dc_number = 'DC-' + Date.now();

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
    if (!po) return res.status(404).json({ error: 'PO not found' });

    db.exec('BEGIN');

    if (email_to_project) {
      const uObj = db.prepare(`
        SELECT u.full_name, u.email, u.phone 
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.name = 'projects' AND (u.email = ? OR u.username = ?)
      `).get(email_to_project, email_to_project);

      if (uObj) {
        db.prepare(`
          UPDATE purchase_orders 
          SET project_spoc_name = ?, project_spoc_email = ?, project_spoc_phone = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(uObj.full_name, uObj.email, uObj.phone, po.id);
      }
    }

    const isAutoApproved = po.need_sales_invoice_approval === 'no';
    const initialStatus = isAutoApproved ? 'delivery_confirmed' : 'issued';
    const initialDeliveryStatus = isAutoApproved ? 'delivery_confirmed' : 'awaiting_confirmation';
    const receivedByVal = isAutoApproved ? 'System (Direct Flow)' : null;
    const confirmedAtVal = isAutoApproved ? new Date().toISOString() : null;

    const dcResult = db.prepare(`
      INSERT INTO delivery_challans (
        dc_number, po_id, customer_id, customer_location_id,
        status, dc_date, vehicle_number,
        driver_name, notes, created_by,
        delivery_status, email_to_project,
        received_by, delivery_confirmed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      dc_number, po_id, customer_id, location_id,
      initialStatus, dc_date, vehicle_number || '',
      driver_name || '', notes || '', req.user.id,
      initialDeliveryStatus, email_to_project || null,
      receivedByVal, confirmedAtVal
    );

    const dcId = dcResult.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO dc_line_items (
        dc_id, po_line_item_id, item_name,
        description, quantity_dispatched, uom,
        received_qty, item_condition
      ) VALUES (?,?,?,?,?,?,?,?)
    `);

    (items || []).forEach(item => {
      const qtyDispatched = parseFloat(item.quantity_dispatched) || 0;
      itemStmt.run(
        dcId,
        item.po_line_item_id || null,
        item.item_name,
        item.description || '',
        qtyDispatched,
        item.uom || '',
        isAutoApproved ? qtyDispatched : null,
        isAutoApproved ? 'OK' : 'OK'
      );
    });

    db.prepare(
      "UPDATE purchase_orders SET status='dc_raised' WHERE id=?"
    ).run(po_id);

    if (isAutoApproved) {
      autoGenerateInvoiceForDC(dcId, po, req.user.id, req.user.username);
    }

    db.exec('COMMIT');

    // Trigger centralized workflow notification
    let recipientEmail = null;
    if (email_to_project) {
      const uObj = db.prepare('SELECT email FROM users WHERE email = ? OR username = ?').get(email_to_project, email_to_project);
      if (uObj && uObj.email) {
        recipientEmail = uObj.email;
      } else if (email_to_project.includes('@')) {
        recipientEmail = email_to_project;
      }
    }
    if (!recipientEmail && po.project_spoc_email) {
      recipientEmail = po.project_spoc_email;
    }

    triggerNotification(db, 'DC_SCR_RAISED', {
      soId: po_id,
      performedBy: req.user.full_name || req.user.username,
      extraDetails: {
        'DC Number': dc_number,
        'Type': 'Direct Delivery Challan',
        'Vehicle No': vehicle_number || 'N/A'
      },
      customCc: recipientEmail ? [recipientEmail] : []
    }).catch(err => console.error('Failed to trigger DC_SCR_RAISED notification:', err));

    res.json({ success: true, dc_number, dc_id: dcId });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dc', authenticate, (req, res) => {
  try {
    let sql = `
      SELECT 
        d.*,
        p.po_number as po_no,
        p.po_number as po_number,
        c.name as customer_name,
        cl.label as location_name,
        cl.city as location_city,
        dr.dc_request_no,
        i.id as invoice_id,
        i.invoice_number,
        COALESCE(sub.total_qty, 0) as total_qty,
        COALESCE(sub.total_value, 0) as total_value
      FROM delivery_challans d
      LEFT JOIN purchase_orders p ON d.po_id = p.id
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN customer_locations cl ON d.customer_location_id = cl.id
      LEFT JOIN dc_requests dr ON d.dc_request_id = dr.id
      LEFT JOIN invoices i ON i.dc_id = d.id
      LEFT JOIN (
        SELECT 
          dli.dc_id,
          SUM(dli.quantity_dispatched) as total_qty,
          SUM(dli.quantity_dispatched * (
            CASE 
              WHEN pli.supply_qty > 0 THEN (pli.total_supply / pli.supply_qty)
              WHEN pli.service_qty > 0 THEN (pli.total_service / pli.service_qty)
              ELSE 0 
            END
          )) as total_value
        FROM dc_line_items dli
        JOIN po_line_items pli ON dli.po_line_item_id = pli.id
        GROUP BY dli.dc_id
      ) sub ON d.id = sub.dc_id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role === 'projects') {
      conditions.push(`p.project_spoc_name = ?`);
      params.push(req.user.full_name);
    }

    if (req.user.role?.toLowerCase() === 'sales') {
      conditions.push(`p.created_by = ?`);
      params.push(req.user.id);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY d.created_at DESC `;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    /* console.error('GET /api/dc ERROR:', err); */
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
        p.project_spoc_name, p.project_spoc_email, p.project_spoc_phone,
        p.need_sales_invoice_approval,
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

    if (req.user.role === 'projects' && dc.project_spoc_name !== req.user.full_name) {
      return res.status(403).json({ error: 'Access denied: You are not the Project SPOC for this DC.' });
    }

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
        pi.supply_qty as supply_qty,
        pi.service_qty as service_qty,
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
  } catch (err) {
    /* console.error('GET /api/dc/:id ERROR:', err); */
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

    const dcObj = db.prepare(`
      SELECT d.id, p.project_spoc_name 
      FROM delivery_challans d
      LEFT JOIN purchase_orders p ON d.po_id = p.id
      WHERE d.id = ?
    `).get(dcId);
    if (!dcObj) {
      return res.status(404).json({ error: 'DC not found' });
    }
    if (req.user.role === 'projects' && dcObj.project_spoc_name !== req.user.full_name) {
      return res.status(403).json({ error: 'Access denied: You are not the Project SPOC for this DC.' });
    }


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

      // 3. Handle rejected/shorted items by creating a CDC request
      const rejectedItems = [];
      for (const item of parsedItems) {
        const dcLineItem = db.prepare('SELECT po_line_item_id, quantity_dispatched, item_name, description, uom, hsn FROM dc_line_items WHERE id = ?').get(item.id);
        if (dcLineItem) {
          const rejectedQty = dcLineItem.quantity_dispatched - item.received_qty;
          if (rejectedQty > 0) {
            rejectedItems.push({
              po_line_item_id: dcLineItem.po_line_item_id,
              rejected_qty: rejectedQty,
              item_name: dcLineItem.item_name,
              description: dcLineItem.description,
              uom: dcLineItem.uom,
              hsn: dcLineItem.hsn
            });
          }
        }
      }

      if (rejectedItems.length > 0) {
        // Generate CDC request number
        const lastCDC = db.prepare("SELECT dc_request_no FROM dc_requests WHERE dc_request_no LIKE 'CDC/%' ORDER BY id DESC LIMIT 1").get();
        let nextCDCNum = 1;
        if (lastCDC && lastCDC.dc_request_no && lastCDC.dc_request_no.startsWith('CDC/')) {
          const parts = lastCDC.dc_request_no.split('/');
          nextCDCNum = parseInt(parts[parts.length - 1]) + 1;
        }
        const cdc_request_no = `CDC/2026/${String(nextCDCNum).padStart(3, '0')}`;

        // Get original DC details
        const originalDC = db.prepare('SELECT * FROM delivery_challans WHERE id = ?').get(dcId);
        if (originalDC) {
          // Insert the CDC request
          const cdcResult = db.prepare(`
            INSERT INTO dc_requests (
              po_id, location_id, dc_request_no, dispatch_date, transporter,
              special_instructions, status,
              vehicle_no, driver_name, driver_phone,
              dispatch_from_address1, dispatch_from_address2, dispatch_from_pincode,
              requested_dc_number, is_manual_dc
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(
            originalDC.po_id, originalDC.customer_location_id, cdc_request_no, originalDC.dispatch_date || '', originalDC.transporter || '',
            `CDC for rejected items from DC ${originalDC.dc_number}. Remarks: ${siteRemarks || 'None'} | Damage: ${damageRemarks || 'None'} | Shortage: ${shortageRemarks || 'None'}`,
            originalDC.vehicle_no || '', originalDC.driver_name || '', originalDC.driver_phone || '',
            originalDC.dispatch_from_address1 || '', originalDC.dispatch_from_address2 || '', originalDC.dispatch_from_pincode || '',
            cdc_request_no
          );

          const cdcRequestId = cdcResult.lastInsertRowid;

          // Insert items
          const insertCdcItem = db.prepare(`
            INSERT INTO dc_request_items (dc_request_id, line_item_id, qty)
            VALUES (?, ?, ?)
          `);
          for (const rej of rejectedItems) {
            insertCdcItem.run(cdcRequestId, rej.po_line_item_id, rej.rejected_qty);
          }
        }
      }
    });

    transaction();
    res.json({ success: true, message: 'Delivery confirmed successfully' });
  } catch (err) {
    /* console.error('CONFIRM DELIVERY ERROR:', err); */
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

    if (status === 'delivery_confirmed' || status === 'approved') {
      const dc = db.prepare('SELECT po_id, dc_number FROM delivery_challans WHERE id = ?').get(req.params.id);
      if (dc) {
        triggerNotification(db, 'DC_SCR_APPROVED', {
          soId: dc.po_id,
          performedBy: req.user.full_name || req.user.username,
          extraDetails: {
            'DC Number': dc.dc_number,
            'Type': 'Delivery Challan Approval',
            'Status': status
          }
        }).catch(err => console.error('Failed to trigger DC_SCR_APPROVED notification:', err));
      }
    }

    res.json({ success: true });
  } catch (err) {
    /* console.error('ERROR:', err); */
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
      WHERE p.status IN ('accepted', 'approved', 'dc_raised')
      AND (
        SELECT SUM(MAX(0, pli.supply_qty - pli.qty_delivered))
        FROM po_line_items pli
        WHERE pli.po_id = p.id
      ) > 0
      ORDER BY p.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

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

    if (!dispatch_from_line1 || !dispatch_from_line1.trim()) {
      return res.status(400).json({ error: 'Dispatch source address Line 1 is mandatory.' });
    }

    if (!dispatch_from_pin || dispatch_from_pin.trim().length !== 6 || /\D/.test(dispatch_from_pin.trim())) {
      return res.status(400).json({ error: 'Valid 6-digit numeric Pincode is mandatory.' });
    }

    const lastDCR = db.prepare("SELECT dc_request_no FROM dc_requests WHERE dc_request_no LIKE 'DCR/%' ORDER BY id DESC LIMIT 1").get();
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

    triggerNotification(db, 'DC_SCR_RAISED', {
      soId: po_id,
      performedBy: req.user.full_name || req.user.username,
      extraDetails: {
        'DC Request No': dc_request_no,
        'Type': 'Delivery Challan Request',
        'Vehicle No': vehicle_no || 'N/A'
      }
    }).catch(err => console.error('Failed to trigger DC_SCR_RAISED notification:', err));

    res.json({ success: true, dc_request: dc_request_no, id: dc_request_id });
  } catch (err) {
    /* console.error('ERROR IN POST /api/dc-requests:', err); */
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
    const conditions = [];

    if (status) {
      conditions.push("dr.status = ?");
      params.push(status);
    }

    if (req.user.role?.toLowerCase() === 'sales') {
      conditions.push("p.created_by = ?");
      params.push(req.user.id);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY dr.created_at DESC";

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR:', err); */
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
  } catch (err) {
    /* console.error('ERROR CONFIRMING DISPATCH:', err); */
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
        p.project_spoc_name,
        p.project_spoc_email,
        p.project_spoc_phone,
        p.need_sales_invoice_approval,
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
  } catch (err) {
    /* console.error('ERROR:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc-requests/:id/approve-cdc', authenticate, (req, res) => {
  const requestId = req.params.id;
  try {
    const request = db.prepare('SELECT * FROM dc_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'CDC Request not found' });

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(request.po_id);
    if (!po) return res.status(404).json({ error: 'PO not found' });

    const items = db.prepare('SELECT * FROM dc_request_items WHERE dc_request_id = ?').all(requestId);
    if (items.length === 0) return res.status(400).json({ error: 'No items in this request' });

    db.exec('BEGIN');
    try {
      // Add quantities back to the PO by decreasing qty_delivered
      for (const item of items) {
        db.prepare('UPDATE po_line_items SET qty_delivered = MAX(0, qty_delivered - ?) WHERE id = ?')
          .run(item.qty, item.line_item_id);
      }

      // Update the CDC request status to 'approved'
      db.prepare("UPDATE dc_requests SET status = 'approved' WHERE id = ?").run(requestId);

      db.exec('COMMIT');

      // Audit log
      auditLog(req.user.username, 'APPROVE', 'CDCRequest', requestId, null, { dc_request_no: request.dc_request_no, po_id: po.id });

      res.json({ success: true, message: 'CDC Request approved. Rejected items added back to PO outstanding quantity successfully.' });
    } catch (err) {
      db.exec('ROLLBACK');
      /* console.error('Failed to approve CDC:', err); */
      res.status(500).json({ error: 'Failed to approve CDC: ' + err.message });
    }
  } catch (err) {
    /* console.error('Approve CDC error:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc-requests/:id/reject-cdc', authenticate, (req, res) => {
  const requestId = req.params.id;
  const { remarks } = req.body;
  try {
    const request = db.prepare('SELECT * FROM dc_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'CDC Request not found' });

    db.prepare("UPDATE dc_requests SET status = 'rejected', logistics_remarks = ? WHERE id = ?")
      .run(remarks || 'Rejected by Sales Order Reviewer', requestId);

    // Audit log
    auditLog(req.user.username, 'REJECT', 'CDCRequest', requestId, null, { dc_request_no: request.dc_request_no, remarks });

    res.json({ success: true, message: 'CDC Request rejected successfully.' });
  } catch (err) {
    /* console.error('Reject CDC error:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dc-requests/:id/raise', authenticate, (req, res) => {
  const requestId = req.params.id;
  const { customDCNo, manualDC, dispatchFrom, itemHSNs, signature, email_to_project } = req.body;

  try {
    const request = db.prepare('SELECT * FROM dc_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'DC Request not found' });

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(request.po_id);
    if (!po) return res.status(404).json({ error: 'PO not found' });

    const items = db.prepare('SELECT * FROM dc_request_items WHERE dc_request_id = ?').all(requestId);
    if (items.length === 0) return res.status(400).json({ error: 'No items in this request' });

    // Handle CDC requests (rejected items return)
    if (request.dc_request_no && request.dc_request_no.startsWith('CDC/')) {
      db.exec('BEGIN');
      try {
        // Add quantities back to the PO by decreasing qty_delivered
        for (const item of items) {
          db.prepare('UPDATE po_line_items SET qty_delivered = MAX(0, qty_delivered - ?) WHERE id = ?')
            .run(item.qty, item.line_item_id);
        }

        // Update the CDC request status to 'approved'
        db.prepare("UPDATE dc_requests SET status = 'approved' WHERE id = ?").run(requestId);

        db.exec('COMMIT');

        // Audit log
        try {
          const auditLog = require('./services/auditLog'); // or local helper
          auditLog(req.user.username, 'APPROVE', 'CDCRequest', requestId, null, { dc_request_no: request.dc_request_no, po_id: po.id });
        } catch (e) {
          // fallback in case helper is named auditLog or is a global
          if (typeof auditLog === 'function') {
            auditLog(req.user.username, 'APPROVE', 'CDCRequest', requestId, null, { dc_request_no: request.dc_request_no, po_id: po.id });
          }
        }

        return res.json({ success: true, message: 'CDC Request approved. Rejected items added back to PO outstanding quantity successfully.' });
      } catch (err) {
        db.exec('ROLLBACK');
        return res.status(500).json({ error: 'Failed to approve CDC: ' + err.message });
      }
    }

    // Enforce HSN validation for all items if auto-invoice is active (need_sales_invoice_approval !== 'yes')
    const isHsnMandatory = po.need_sales_invoice_approval !== 'yes';
    if (isHsnMandatory) {
      for (const item of items) {
        const hsn = itemHSNs?.[item.line_item_id];
        if (!hsn || !hsn.trim()) {
          return res.status(400).json({ error: 'HSN code is mandatory for all items.' });
        }
      }
    }

    db.exec('BEGIN');

    if (email_to_project) {
      const uObj = db.prepare(`
        SELECT u.full_name, u.email, u.phone 
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.name = 'projects' AND (u.email = ? OR u.username = ?)
      `).get(email_to_project, email_to_project);

      if (uObj) {
        db.prepare(`
          UPDATE purchase_orders 
          SET project_spoc_name = ?, project_spoc_email = ?, project_spoc_phone = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(uObj.full_name, uObj.email, uObj.phone, po.id);
      }
    }

    // Determine Despatch From Address (Fallback to PO location's address)
    const loc = db.prepare('SELECT address_line1, address_line2, pincode FROM customer_locations WHERE id = ?').get(po.location_id);
    const df1 = dispatchFrom?.line1 || 'Plot No. 44, Shed No. 3, Phase-I, IDA Balanagar';
    const df2 = dispatchFrom?.line2 || 'Hyderabad, Telangana';
    const dfp = dispatchFrom?.pin || '500037';

    const dc_number = customDCNo || request.requested_dc_number || ('DC-' + Date.now());

    const isAutoApproved = po.need_sales_invoice_approval === 'no';
    const initialStatus = isAutoApproved ? 'delivery_confirmed' : 'in_transit';
    const initialDeliveryStatus = isAutoApproved ? 'delivery_confirmed' : 'awaiting_site_confirmation';
    const receivedByVal = isAutoApproved ? 'System (Direct Flow)' : null;
    const confirmedAtVal = isAutoApproved ? new Date().toISOString() : null;

    const result = db.prepare(`
      INSERT INTO delivery_challans (
        dc_number, manual_dc_number, dc_request_id, po_id, customer_id, 
        customer_location_id, status, dispatch_date,
        dispatch_from_address1, dispatch_from_address2, dispatch_from_pincode,
        vehicle_no, driver_name, driver_phone, transporter,
        created_by, delivery_status, dispatched_at,
        dispatch_proof_path, logistics_remarks, signature_data, email_to_project,
        received_by, delivery_confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
    `).run(
      dc_number,
      manualDC || request.requested_dc_number || null,
      requestId,
      po.id,
      po.customer_id,
      request.location_id,
      initialStatus,
      request.dispatch_date,
      dispatchFrom?.line1 || request.dispatch_from_address1 || df1,
      dispatchFrom?.line2 || request.dispatch_from_address2 || df2,
      dispatchFrom?.pin || request.dispatch_from_pincode || dfp,
      request.vehicle_no || '',
      request.driver_name || '',
      request.driver_phone || '',
      request.transporter || '',
      req.user.id,
      initialDeliveryStatus,
      request.proof_path || null,
      request.logistics_remarks || '',
      signature || null,
      email_to_project || null,
      receivedByVal,
      confirmedAtVal
    );

    const dcId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO dc_line_items (dc_id, po_line_item_id, item_name, description, quantity_dispatched, uom, hsn, received_qty, item_condition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        itemHSNs[item.line_item_id] || '',
        isAutoApproved ? item.qty : null,
        isAutoApproved ? 'OK' : 'OK'
      );

      // Update PO Line Item delivered qty
      db.prepare('UPDATE po_line_items SET qty_delivered = (qty_delivered + ?) WHERE id = ?').run(item.qty, item.line_item_id);
    }

    // Update status
    db.prepare("UPDATE dc_requests SET status = 'dispatched' WHERE id = ?").run(requestId);
    db.prepare("UPDATE purchase_orders SET status = 'dc_raised' WHERE id = ?").run(po.id);

    if (isAutoApproved) {
      autoGenerateInvoiceForDC(dcId, po, req.user.id, req.user.username);
    }

    db.exec('COMMIT');
    auditLog(req.user.username, 'CREATE', 'DeliveryChallan', dcId, null, { dc_number, po_id: po.id });

    // Trigger centralized workflow notification
    let recipientEmail = null;
    if (email_to_project) {
      const uObj = db.prepare('SELECT email FROM users WHERE email = ? OR username = ?').get(email_to_project, email_to_project);
      if (uObj && uObj.email) {
        recipientEmail = uObj.email;
      } else if (email_to_project.includes('@')) {
        recipientEmail = email_to_project;
      }
    }
    if (!recipientEmail && po.project_spoc_email) {
      recipientEmail = po.project_spoc_email;
    }

    triggerNotification(db, 'DC_SCR_RAISED', {
      soId: po.id,
      performedBy: req.user.full_name || req.user.username,
      extraDetails: {
        'DC Number': dc_number,
        'Type': 'Delivery Challan Dispatch',
        'Vehicle No': request.vehicle_no || 'N/A'
      },
      customCc: recipientEmail ? [recipientEmail] : []
    }).catch(err => console.error('Failed to trigger DC_SCR_RAISED notification:', err));

    res.json({ success: true, dc_number, dc_id: dcId });
  } catch (err) {
    if (db.inTransaction) db.exec('ROLLBACK');
    /* console.error('ERROR RAISING DC:', err); */
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
          SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
          SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
      WHERE p.status != 'revised'
      ORDER BY p.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR in /api/po-flow:', err); */
    res.status(500).json({ error: err.message });
  }
});





app.get('/api/reports/po-summary', authenticate, (req, res) => {
  try {
    let sql = `
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
          SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
          SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
      WHERE p.status != 'revised'
    `;
    const params = [];
    if (req.user.role?.toLowerCase() === 'sales') {
      sql += ` AND p.created_by = ? `;
      params.push(req.user.id);
    }
    sql += ` ORDER BY p.created_at DESC `;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR in /api/reports/po-summary:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/items', authenticate, (req, res) => {
  try {
    let sql = `
      SELECT 
        pli.*,
        p.po_number,
        p.po_date,
        c.name as customer_name
      FROM po_line_items pli
      JOIN purchase_orders p ON pli.po_id = p.id
      JOIN customers c ON p.customer_id = c.id
      WHERE p.status != 'revised'
    `;
    const params = [];
    if (req.user.role?.toLowerCase() === 'sales') {
      sql += ` AND p.created_by = ? `;
      params.push(req.user.id);
    }
    sql += ` ORDER BY p.created_at DESC, pli.line_number ASC `;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    /* console.error('ERROR in /api/reports/items:', err); */
    res.status(500).json({ error: err.message });
  }
});

// --- Management Dashboard Endpoints ---
app.get('/api/management/summary', requireRole(['admin', 'management']), (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT 
        COUNT(DISTINCT id) as total_so_count,
        COALESCE(SUM(po_value), 0) as total_po_value,
        COALESCE(SUM(supplied_value), 0) as total_supplied_value,
        COALESCE(SUM(invoiced_value), 0) as total_invoiced_value,
        COALESCE(SUM(collected_value), 0) as total_collected_value,
        COALESCE(SUM(MAX(0, invoiced_value - collected_value)), 0) as total_outstanding_value
      FROM (
        SELECT 
          p.id,
          p.grand_total as po_value,
          COALESCE((
            SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
            SELECT SUM(grand_total) 
            FROM invoices 
            WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
          ), 0) as invoiced_value,
          COALESCE((
            SELECT SUM(amount_received) 
            FROM ar_entries 
            WHERE po_id = p.id
          ), 0) as collected_value
        FROM purchase_orders p
        WHERE p.status != 'revised'
      )
    `).get();
    res.json(summary);
  } catch (err) {
    /* console.error('ERROR in /api/management/summary:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/management/customers', requireRole(['admin', 'management']), (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.cust_code as customer_code,
        COUNT(DISTINCT p.id) as total_so_count,
        COALESCE(SUM(po_value), 0) as total_po_value,
        COALESCE(SUM(supplied_value), 0) as total_supplied_value,
        COALESCE(SUM(invoiced_value), 0) as total_invoiced_value,
        COALESCE(SUM(collected_value), 0) as total_collected_value,
        COALESCE(SUM(MAX(0, invoiced_value - collected_value)), 0) as total_outstanding_value
      FROM customers c
      LEFT JOIN (
        SELECT 
          p.id,
          p.customer_id,
          p.grand_total as po_value,
          COALESCE((
            SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
            SELECT SUM(grand_total) 
            FROM invoices 
            WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
          ), 0) as invoiced_value,
          COALESCE((
            SELECT SUM(amount_received) 
            FROM ar_entries 
            WHERE po_id = p.id
          ), 0) as collected_value
        FROM purchase_orders p
        WHERE p.status != 'revised'
      ) p ON c.id = p.customer_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all();
    res.json(customers);
  } catch (err) {
    /* console.error('ERROR in /api/management/customers:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/management/customer/:id/summary', requireRole(['admin', 'management']), (req, res) => {
  try {
    const customerId = req.params.id;
    const summary = db.prepare(`
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.cust_code as customer_code,
        COUNT(DISTINCT p.id) as total_so_count,
        COALESCE(SUM(po_value), 0) as total_po_value,
        COALESCE(SUM(supplied_value), 0) as total_supplied_value,
        COALESCE(SUM(invoiced_value), 0) as total_invoiced_value,
        COALESCE(SUM(collected_value), 0) as total_collected_value,
        COALESCE(SUM(MAX(0, invoiced_value - collected_value)), 0) as total_outstanding_value
      FROM customers c
      LEFT JOIN (
        SELECT 
          p.id,
          p.customer_id,
          p.grand_total as po_value,
          COALESCE((
            SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
            SELECT SUM(grand_total) 
            FROM invoices 
            WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
          ), 0) as invoiced_value,
          COALESCE((
            SELECT SUM(amount_received) 
            FROM ar_entries 
            WHERE po_id = p.id
          ), 0) as collected_value
        FROM purchase_orders p
        WHERE p.status != 'revised'
      ) p ON c.id = p.customer_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(customerId);

    const pos = db.prepare(`
      SELECT 
        p.id as po_id,
        p.po_number,
        p.po_date,
        p.grand_total as po_value,
        COALESCE((
          SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
          SELECT SUM(grand_total) 
          FROM invoices 
          WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
        ), 0) as invoiced_value,
        COALESCE((
          SELECT SUM(amount_received) 
          FROM ar_entries 
          WHERE po_id = p.id
        ), 0) as collected_value,
        MAX(0, COALESCE((
          SELECT SUM(grand_total) 
          FROM invoices 
          WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
        ), 0) - COALESCE((
          SELECT SUM(amount_received) 
          FROM ar_entries 
          WHERE po_id = p.id
        ), 0)) as outstanding_value
      FROM purchase_orders p
      WHERE p.customer_id = ? AND p.status != 'revised'
      ORDER BY p.created_at DESC
    `).all(customerId);

    res.json({ summary, pos });
  } catch (err) {
    /* console.error('ERROR in /api/management/customer/:id/summary:', err); */
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/management/so/:id/summary', requireRole(['admin', 'management']), (req, res) => {
  try {
    const poId = req.params.id;
    const soDetails = db.prepare(`
      SELECT 
        p.id as po_id,
        p.po_number,
        p.po_date,
        p.grand_total as po_value,
        c.name as customer_name,
        c.id as customer_id,
        COALESCE((
          SELECT SUM(COALESCE(dli.received_qty, dli.quantity_dispatched) * (
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
          SELECT SUM(grand_total) 
          FROM invoices 
          WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
        ), 0) as invoiced_value,
        COALESCE((
          SELECT SUM(amount_received) 
          FROM ar_entries 
          WHERE po_id = p.id
        ), 0) as collected_value,
        MAX(0, COALESCE((
          SELECT SUM(grand_total) 
          FROM invoices 
          WHERE po_id = p.id AND status NOT IN ('requested', 'cancelled')
        ), 0) - COALESCE((
          SELECT SUM(amount_received) 
          FROM ar_entries 
          WHERE po_id = p.id
        ), 0)) as outstanding_value
      FROM purchase_orders p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.id = ? AND p.status != 'revised'
    `).get(poId);

    if (!soDetails) {
      return res.status(404).json({ error: 'Sales Order not found' });
    }

    res.json(soDetails);
  } catch (err) {
    /* console.error('ERROR in /api/management/so/:id/summary:', err); */
    res.status(500).json({ error: err.message });
  }
});

// --- SCR (Site Clearance Request) Endpoints ---
app.get('/api/scr', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        s.*,
        p.po_number as po_no,
        p.po_number,
        c.name as customer_name,
        cl.label as location_label,
        cl.address_line1 as location_address,
        cl.city as location_city,
        cl.state as location_state,
        u.full_name as creator_name,
        IFNULL((SELECT SUM(service_qty) FROM scr_line_items WHERE scr_id = s.id), 0) as total_qty,
        IFNULL((SELECT SUM(sli.service_qty * pli.service_rate * (1 + IFNULL(pli.service_gst_rate, 18)/100)) FROM scr_line_items sli JOIN po_line_items pli ON sli.po_line_item_id = pli.id WHERE sli.scr_id = s.id), 0) as total_value
      FROM scr_requests s
      LEFT JOIN purchase_orders p ON s.po_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN customer_locations cl ON s.location_id = cl.id
      LEFT JOIN users u ON s.created_by = u.id
      ORDER BY s.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scr', authenticate, upload.single('file'), (req, res) => {
  try {
    const {
      po_id, location_id, expected_delivery_date, pm_name, pm_phone,
      civil_completed, power_available, storage_secured, access_cleared, safety_equipment,
      remarks, items
    } = req.body;

    if (!po_id || !location_id) {
      return res.status(400).json({ error: 'Missing required fields: PO or Location' });
    }

    const lastSCR = db.prepare("SELECT scr_number FROM scr_requests WHERE scr_number LIKE 'SCR/%' ORDER BY id DESC LIMIT 1").get();
    let nextNum = 1;
    if (lastSCR && lastSCR.scr_number && lastSCR.scr_number.startsWith('SCR/')) {
      const parts = lastSCR.scr_number.split('/');
      nextNum = parseInt(parts[parts.length - 1]) + 1;
    }
    const scr_number = `SCR/2026/${String(nextNum).padStart(3, '0')}`;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    db.exec('BEGIN');

    const result = db.prepare(`
      INSERT INTO scr_requests (
        scr_number, po_id, location_id, expected_delivery_date, pm_name, pm_phone,
        civil_completed, power_available, storage_secured, access_cleared, safety_equipment,
        status, remarks, file_path, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      scr_number,
      po_id,
      location_id,
      expected_delivery_date || null,
      pm_name || null,
      pm_phone || null,
      civil_completed === 'true' || civil_completed === 1 || civil_completed === '1' ? 1 : 0,
      power_available === 'true' || power_available === 1 || power_available === '1' ? 1 : 0,
      storage_secured === 'true' || storage_secured === 1 || storage_secured === '1' ? 1 : 0,
      access_cleared === 'true' || access_cleared === 1 || access_cleared === '1' ? 1 : 0,
      safety_equipment === 'true' || safety_equipment === 1 || safety_equipment === '1' ? 1 : 0,
      remarks || null,
      filePath,
      req.user.id
    );

    const scrId = result.lastInsertRowid;

    // Handle service line items
    let parsedItems = [];
    if (items) {
      try {
        parsedItems = JSON.parse(items);
      } catch (e) {
        parsedItems = [];
      }
    }

    if (parsedItems && parsedItems.length > 0) {
      const itemStmt = db.prepare(`
        INSERT INTO scr_line_items (scr_id, po_line_item_id, service_qty, invoice_qty, invoiced_qty)
        VALUES (?, ?, ?, ?, 0)
      `);
      parsedItems.forEach(it => {
        itemStmt.run(scrId, it.po_line_item_id, it.service_qty || 0, it.invoice_qty || 0);
      });
    }

    db.exec('COMMIT');

    auditLog(req.user.username, 'CREATE_SCR', 'scr_requests', scrId, null, { scr_number, status: 'pending' });

    triggerNotification(db, 'DC_SCR_RAISED', {
      soId: po_id,
      performedBy: req.user.full_name || req.user.username,
      extraDetails: {
        'SCR Number': scr_number,
        'Type': 'Site Clearance Request',
        'Project Manager': pm_name || 'N/A'
      }
    }).catch(err => console.error('Failed to trigger DC_SCR_RAISED notification for SCR:', err));

    res.json({ success: true, id: scrId, scr_number });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) { }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scr/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const scr = db.prepare(`
      SELECT 
        s.*,
        p.po_number as po_no,
        p.po_number,
        p.customer_id,
        c.name as customer_name,
        c.legal_name as customer_legal_name,
        c.gstin as customer_gstin,
        c.address_line1 as customer_addr1,
        c.address_line2 as customer_addr2,
        c.city as customer_city,
        c.state as customer_state,
        c.pincode as customer_pin,
        cl.label as location_label,
        cl.address_line1 as location_address,
        cl.city as location_city,
        cl.state as location_state,
        cl.pincode as location_pincode,
        u.full_name as creator_name
      FROM scr_requests s
      LEFT JOIN purchase_orders p ON s.po_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN customer_locations cl ON s.location_id = cl.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?
    `).get(id);

    if (!scr) {
      return res.status(404).json({ error: 'SCR not found' });
    }

    const items = db.prepare(`
      SELECT 
        si.*,
        pi.package_name,
        pi.item_name,
        pi.description,
        pi.uom,
        pi.service_qty as po_service_qty,
        pi.service_rate as po_service_rate,
        pi.service_gst_rate as po_service_gst_rate
      FROM scr_line_items si
      LEFT JOIN po_line_items pi ON si.po_line_item_id = pi.id
      WHERE si.scr_id = ?
    `).all(id);

    res.json({ ...scr, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scr/:id/raise-invoice-request', authenticate, (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  try {
    const scr = db.prepare('SELECT * FROM scr_requests WHERE id = ?').get(id);
    if (!scr) {
      return res.status(404).json({ error: 'SCR not found' });
    }

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(scr.po_id);
    if (!po) {
      return res.status(404).json({ error: 'Linked Purchase Order not found' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(po.customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const location = db.prepare('SELECT * FROM customer_locations WHERE id = ?').get(scr.location_id);

    const billingAddress = `${customer.legal_name || customer.name}\n${customer.addr_line1 || ''}\n${customer.addr_line2 || ''}\n${customer.city || ''} - ${customer.pincode || ''}\nGSTIN: ${customer.gstin || ''}`;
    const shippingAddress = location
      ? `${location.label || location.name || ''}\n${location.address_line1 || ''}\n${location.city || ''} - ${location.state || ''}`
      : '';
    const placeOfSupply = location ? location.state : (customer.state || 'Hyderabad');
    const paymentTerms = po.payment_terms || 'Net 30 Days';

    let invoice_number = scr.scr_number;
    const baseNumber = scr.scr_number;
    let suffix = 0;
    while (
      db.prepare("SELECT id FROM invoices WHERE invoice_number = ?").get(invoice_number) ||
      db.prepare("SELECT id FROM invoice_requests WHERE request_number = ?").get(invoice_number)
    ) {
      suffix++;
      invoice_number = `${baseNumber}-${suffix}`;
    }
    const needSalesApproval = true;

    let subtotal = 0;
    let gst_total = 0;
    let grand_total = 0;
    const enrichedItems = [];

    for (const item of items) {
      const { scr_line_item_id, qty_to_raise } = item;
      const qty = parseFloat(qty_to_raise);
      if (isNaN(qty) || qty <= 0) continue;

      const scrLineItem = db.prepare('SELECT * FROM scr_line_items WHERE id = ? AND scr_id = ?').get(scr_line_item_id, id);
      if (!scrLineItem) {
        return res.status(400).json({ error: `SCR Line Item ${scr_line_item_id} not found` });
      }

      const poLineItem = db.prepare('SELECT * FROM po_line_items WHERE id = ?').get(scrLineItem.po_line_item_id);
      if (!poLineItem) {
        return res.status(400).json({ error: `Linked PO Line Item not found for SCR item ${scr_line_item_id}` });
      }

      const alreadyRaised = parseFloat(scrLineItem.invoiced_qty) || 0;
      const totalServiceQty = parseFloat(scrLineItem.service_qty) || 0;
      const remaining = Math.max(0, totalServiceQty - alreadyRaised);

      if (qty > remaining) {
        return res.status(400).json({ error: `Quantity to raise (${qty}) exceeds remaining balance (${remaining}) for item ${poLineItem.item_name}` });
      }

      const rate = parseFloat(poLineItem.service_rate) || 0;
      const gstPct = parseFloat(poLineItem.service_gst_rate) || 18;
      const taxable = qty * rate;
      const gst = taxable * (gstPct / 100);
      const total = taxable + gst;

      subtotal += taxable;
      gst_total += gst;
      grand_total += total;

      enrichedItems.push({
        scrLineItem,
        poLineItem,
        qty,
        rate,
        gstPct,
        taxable,
        gst,
        total
      });
    }

    if (enrichedItems.length === 0) {
      return res.status(400).json({ error: 'No items with positive quantity to raise specified.' });
    }

    db.exec('BEGIN');
    try {
      const docUuid = crypto.randomUUID();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      const invoiceDateStr = new Date().toISOString().split('T')[0];

      // Insert into invoices
      const invResult = db.prepare(`
        INSERT INTO invoices (
          invoice_number, po_id, dc_id, scr_id, customer_id,
          status, invoice_date, due_date, notes,
          subtotal, gst_total, grand_total, 
          place_of_supply, payment_terms, billing_address, shipping_address,
          created_by, internal_document_uuid
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        invoice_number, scr.po_id, null, id, po.customer_id,
        needSalesApproval ? 'sales_pending' : 'requested', invoiceDateStr, dueDateStr, 'Service Invoice Request raised by Projects.',
        subtotal, gst_total, grand_total,
        placeOfSupply, paymentTerms, billingAddress, shippingAddress,
        req.user.id, docUuid
      );

      const invoiceId = invResult.lastInsertRowid;

      // Insert into invoice_requests
      try {
        db.prepare(`
          INSERT INTO invoice_requests (request_number, po_id, status, requested_by)
          VALUES (?, ?, ?, ?)
        `).run(invoice_number, scr.po_id, needSalesApproval ? 'sales_pending' : 'pending', req.user.id);
      } catch (e) { }

      // Insert invoice items and update scr_line_items tracking quantities
      const itemStmt = db.prepare(`
        INSERT INTO invoice_items (
          invoice_id, po_line_item_id, dc_line_item_id, scr_line_item_id,
          package_name, item_name, description, quantity, rate, gst_percent, 
          taxable_value, gst_amount, total_value
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);

      const updateSCRItemStmt = db.prepare(`
        UPDATE scr_line_items 
        SET invoiced_qty = IFNULL(invoiced_qty, 0) + ? 
        WHERE id = ?
      `);

      const updatePOLineItemStmt = db.prepare(`
        UPDATE po_line_items 
        SET qty_invoiced = IFNULL(qty_invoiced, 0) + ? 
        WHERE id = ?
      `);

      for (const item of enrichedItems) {
        itemStmt.run(
          invoiceId, item.poLineItem.id, null, item.scrLineItem.id,
          item.poLineItem.package_name || '-', item.poLineItem.item_name, item.poLineItem.description || '',
          item.qty, item.rate, item.gstPct,
          item.taxable, item.gst, item.total
        );

        updateSCRItemStmt.run(item.qty, item.scrLineItem.id);
        updatePOLineItemStmt.run(item.qty, item.poLineItem.id);

        db.prepare(`
          UPDATE scr_line_items 
          SET status = CASE WHEN IFNULL(invoiced_qty, 0) >= service_qty THEN 'Fully Raised' ELSE 'pending' END
          WHERE id = ?
        `).run(item.scrLineItem.id);
      }

      // Re-calculate invoicing status of the SCR
      const scrItems = db.prepare('SELECT service_qty, invoiced_qty FROM scr_line_items WHERE scr_id = ?').all(id);
      const isFullyInvoiced = scrItems.every(item => (parseFloat(item.invoiced_qty) || 0) >= (parseFloat(item.service_qty) || 0));
      const isPartiallyInvoiced = scrItems.some(item => (parseFloat(item.invoiced_qty) || 0) > 0);

      let invStatus = 'pending';
      if (isFullyInvoiced) invStatus = 'fully_invoiced';
      else if (isPartiallyInvoiced) invStatus = 'partially_invoiced';

      db.prepare(`
        UPDATE scr_requests 
        SET invoicing_status = ?
        WHERE id = ?
      `).run(invStatus, id);

      db.exec('COMMIT');

      auditLog(req.user.username, 'RAISE_SERVICE_INVOICE_REQUEST', 'scr_requests', id, null, { invoice_number, status: 'requested' });

      triggerNotification(db, 'INVOICE_REQUESTED', {
        soId: scr.po_id,
        performedBy: req.user.full_name || req.user.username,
        extraDetails: {
          'Request Number': invoice_number,
          'Type': 'Site Clearance Invoice Request',
          'Grand Total': `₹${(grand_total || 0).toLocaleString('en-IN')}`
        }
      }).catch(err => console.error('Failed to trigger INVOICE_REQUESTED notification for SCR:', err));

      res.json({ success: true, invoice_id: invoiceId, invoice_number });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/scr/:id/status', requireRole(['admin', 'accounts']), (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const current = db.prepare('SELECT * FROM scr_requests WHERE id = ?').get(id);
    if (!current) {
      return res.status(404).json({ error: 'SCR not found' });
    }

    db.prepare(`
      UPDATE scr_requests 
      SET status = ?, remarks = COALESCE(?, remarks), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, remarks || null, id);

    const updated = db.prepare('SELECT * FROM scr_requests WHERE id = ?').get(id);
    auditLog(req.user.username, 'UPDATE_SCR_STATUS', 'scr_requests', id, current, updated);

    if (status === 'approved') {
      triggerNotification(db, 'DC_SCR_APPROVED', {
        soId: current.po_id,
        performedBy: req.user.full_name || req.user.username,
        extraDetails: {
          'SCR Number': current.scr_number,
          'Type': 'Site Clearance Request Approval',
          'Status': 'Approved',
          'Remarks': remarks || 'N/A'
        }
      }).catch(err => console.error('Failed to trigger DC_SCR_APPROVED notification for SCR:', err));
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { });
