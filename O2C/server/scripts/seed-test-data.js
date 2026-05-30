const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('Seeding test data in database at:', dbPath);

const db = new Database(dbPath);

try {
  db.pragma('foreign_keys = OFF');

  db.transaction(() => {
    // 1. Seed Customer
    const customerInsert = db.prepare(`
      INSERT OR IGNORE INTO customers (
        id, cust_code, name, gstin, email, phone, gst_status, is_active,
        address_line1, address_line2, pincode, contact_name, contact_email, contact_phone, city, state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    customerInsert.run(
      1, 'ACME001', 'Acme Corporation', '27AAACA0000A1Z5', 'acme@o2c.local', '9876543210', 'approved', 1,
      '123 Business Road', 'MIDC Area', '400001', 'John SPOC', 'projects@o2c.local', '9999988888', 'Mumbai', 'Maharashtra'
    );
    console.log('Seeded customer: Acme Corporation');

    // 2. Seed Customer Location
    const locationInsert = db.prepare(`
      INSERT OR IGNORE INTO customer_locations (
        id, customer_id, label, address_line1, address_line2, city, state, pincode, gstin,
        contact_name, contact_email, contact_phone, is_primary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    locationInsert.run(
      1, 1, 'Mumbai Warehouse', 'Plot 45, MIDC', 'Andheri East', 'Mumbai', 'Maharashtra', '400001', '27AAACA0000A1Z5',
      'John SPOC', 'projects@o2c.local', '9999988888', 1
    );
    console.log('Seeded customer location: Mumbai Warehouse');

    // 3. Seed Master Address
    const masterAddressInsert = db.prepare(`
      INSERT OR IGNORE INTO master_addresses (
        id, name, addr_line1, addr_line2, city, state, pincode, landmark, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    masterAddressInsert.run(
      1, 'Central Plant', 'Survey No 120, MIDC', 'Chakan', 'Pune', 'Maharashtra', '410501', 'Near Toll Plaza', 1
    );
    console.log('Seeded master address: Central Plant');

    // 4. Seed Authorized Signature
    const dummySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6DAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gYDCB0Zz84gNwAAADJJREFUaEPt0LEJADAwzEDz/9MupmD/QhDcA1tSUpKUlJSkJCUpSUlKUpKSlKSkJCUpSfnHA44AA3X4jQAAAAAASUVORK5CYII=';
    const signatureInsert = db.prepare(`
      INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)
    `);
    signatureInsert.run('authorized_signature', dummySignature);
    console.log('Seeded global setting: authorized_signature');
  })();

  db.pragma('foreign_keys = ON');
  console.log('Test data seeded successfully!');
} catch (err) {
  console.error('FAILED TO SEED TEST DATA:', err);
} finally {
  db.close();
}
