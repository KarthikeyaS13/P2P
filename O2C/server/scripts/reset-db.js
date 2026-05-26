const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('Opening database at:', dbPath);

const db = new Database(dbPath);

const tables = [
  'ar_entries',
  'ar_payments',
  'ar_receipts',
  'audit_log',
  'audit_logs',
  'customer_locations',
  'customers',
  'dc_line_items',
  'dc_request_items',
  'dc_requests',
  'delivery_challan_items',
  'delivery_challans',
  'enterprise_audit_trail',
  'global_settings',
  'invoice_items',
  'invoice_line_items',
  'invoice_request_dcs',
  'invoice_requests',
  'invoices',
  'master_addresses',
  'po_line_items',
  'po_version_history',
  'purchase_orders',
  'user_roles',
  'users',
  'roles'
];

try {
  console.log('Disabling foreign keys temporarily...');
  db.pragma('foreign_keys = OFF');

  db.transaction(() => {
    console.log('Clearing all database tables...');
    for (const table of tables) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
        console.log(`Cleared table: ${table}`);
      } catch (tableErr) {
        console.warn(`Could not clear table ${table}:`, tableErr.message);
      }
    }

    console.log('Resetting sequence counters...');
    db.prepare('DELETE FROM sqlite_sequence').run();

    console.log('Seeding default roles...');
    const roles = ['sales', 'stores', 'projects', 'accounts', 'admin', 'management', 'approver', 'auditor'];
    const insertRole = db.prepare('INSERT INTO roles (name) VALUES (?)');
    roles.forEach(role => insertRole.run(role));

    console.log('Seeding default users...');
    const insertUser = db.prepare('INSERT INTO users (username, full_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)');
    const assignRole = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
    const getRole = db.prepare('SELECT id FROM roles WHERE name = ?');

    const hash = bcrypt.hashSync('qwe123', 10);

    const usersData = [
      { username: 'admin', full_name: 'System Admin', email: 'admin@o2c.local', phone: null, role: 'admin' },
      { username: 'sales', full_name: 'John Sales', email: 'sales@o2c.local', phone: null, role: 'sales' },
      { username: 'accounts', full_name: 'Accounts Department', email: 'accounts@o2c.local', phone: null, role: 'accounts' },
      { username: 'stores', full_name: 'Stores Department', email: 'stores@o2c.local', phone: null, role: 'stores' },
      { username: 'projects', full_name: 'Projects Department', email: 'projects@o2c.local', phone: null, role: 'projects' },
      { username: 'mgmt1', full_name: 'Tom Management', email: 'tom@o2c.local', phone: null, role: 'management' },
      { username: 'audit1', full_name: 'Audit User', email: 'audit@o2c.local', phone: null, role: 'auditor' },
      { username: 'emailkarthikeya', full_name: 'Karthikeya S', email: 'karthikeya@o2c.local', phone: null, role: 'admin' }
    ];

    usersData.forEach(u => {
      const result = insertUser.run(u.username, u.full_name, u.email, u.phone, hash);
      const roleId = getRole.get(u.role).id;
      assignRole.run(result.lastInsertRowid, roleId);
    });
  })();

  console.log('Re-enabling foreign keys...');
  db.pragma('foreign_keys = ON');

  console.log('Running VACUUM...');
  db.prepare('VACUUM').run();

  console.log('Database cleared successfully');
  console.log('Default data seeded successfully');

} catch (err) {
  console.error('DATABASE RESET FAILED:', err);
} finally {
  db.close();
}

// 2. Clear Uploaded Files (Keeping directory structure)
const uploadsDir = path.join(__dirname, '..', 'uploads');
const signedPdfsDir = path.join(uploadsDir, 'signed-pdfs');

console.log('Clearing uploads directory...');

function clearDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      clearDirectoryContents(filePath);
    } else {
      fs.unlinkSync(filePath);
      console.log(`Deleted file: ${filePath}`);
    }
  }
}

try {
  if (fs.existsSync(uploadsDir)) {
    const items = fs.readdirSync(uploadsDir);
    for (const item of items) {
      if (item === 'signed-pdfs') continue;
      const itemPath = path.join(uploadsDir, item);
      const stat = fs.statSync(itemPath);
      if (!stat.isDirectory()) {
        fs.unlinkSync(itemPath);
        console.log(`Deleted upload file: ${itemPath}`);
      }
    }
  }
  clearDirectoryContents(signedPdfsDir);
  console.log('UPLOADS CLEANUP SUCCESSFUL!');
} catch (uploadErr) {
  console.error('UPLOADS CLEANUP FAILED:', uploadErr);
}
