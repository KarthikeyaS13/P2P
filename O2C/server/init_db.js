const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'database.sqlite');

// Initialize database
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Read and execute schema
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

console.log('Applying schema...');
db.exec(schema);

// Seed basic data
console.log('Seeding data...');

// 1. Roles
const roles = ['sales', 'stores', 'projects', 'accounts', 'admin', 'management', 'approver', 'auditor'];
const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
const getRole = db.prepare('SELECT id FROM roles WHERE name = ?');
roles.forEach(role => insertRole.run(role));

// 2. Users
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, full_name, email, password_hash) VALUES (?, ?, ?, ?)');
const assignRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');

const usersData = [
  { user: 'admin', name: 'System Admin', email: 'admin@o2c.local', role: 'admin' },
  { user: 'sales', name: 'John Sales', email: 'sales@o2c.local', role: 'sales' },
  { user: 'accounts', name: 'Accounts Department', email: 'accounts@o2c.local', role: 'accounts' },
  { user: 'stores', name: 'Stores Department', email: 'stores@o2c.local', role: 'stores' },
  { user: 'projects', name: 'Projects Department', email: 'projects@o2c.local', role: 'projects' },
];

usersData.forEach(u => {
  const result = insertUser.run(u.user, u.name, u.email, 'qwe123');
  if (result.changes > 0) {
    const roleId = getRole.get(u.role).id;
    assignRole.run(result.lastInsertRowid, roleId);
  }
});

// 3. Customers
const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (cust_code, name, gstin, email, gst_status) VALUES (?, ?, ?, ?, ?)');
const insertLocation = db.prepare('INSERT OR IGNORE INTO customer_locations (customer_id, label, address_line1, city, state, is_primary) VALUES (?, ?, ?, ?, ?, ?)');

const custRes1 = insertCustomer.run('CUST-10001', 'Global Logistics Inc.', '27AADCB2230M1Z2', 'billing@globallogistics.com', 'verified');
if (custRes1.changes > 0) {
  insertLocation.run(custRes1.lastInsertRowid, 'HQ Mumbai', 'BKC Complex', 'Mumbai', 'Maharashtra', 1);
}

const custRes2 = insertCustomer.run('CUST-10002', 'TechSphere Solutions', '29BBBCB1120K1Z5', 'accounts@techsphere.com', 'verified');
if (custRes2.changes > 0) {
  insertLocation.run(custRes2.lastInsertRowid, 'Bangalore Office', 'Whitefield', 'Bangalore', 'Karnataka', 1);
}

console.log('Database initialized successfully.');
db.close();
