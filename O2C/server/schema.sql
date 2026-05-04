-- Section 1: Master Tables
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER,
  role_id INTEGER,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS customers (
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
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS customer_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  label TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  gstin TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_primary BOOLEAN DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Section 2: Purchase Order Tables
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE,
  customer_id INTEGER,
  location_id INTEGER,
  po_number TEXT,
  po_date DATE,
  start_date DATE,
  completion_date DATE,
  total_value INTEGER,
  gst_total INTEGER,
  grand_total INTEGER,
  status TEXT DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  spoc_name TEXT,
  spoc_email TEXT,
  spoc_phone TEXT,
  remarks TEXT,
  is_temp_po BOOLEAN DEFAULT 0,
  parent_po_id INTEGER NULL,
  uploaded_file_path TEXT,
  created_by INTEGER,
  approved_by INTEGER,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (location_id) REFERENCES customer_locations(id),
  FOREIGN KEY (parent_po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS po_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER,
  line_number INTEGER,
  reference_number TEXT,
  package TEXT,
  heading TEXT,
  sub_heading TEXT,
  item_name TEXT NOT NULL,
  item_description TEXT,
  uom TEXT,
  quantity REAL,
  rate_per_unit INTEGER,
  value INTEGER,
  gst_rate REAL,
  gst_amount INTEGER,
  is_service BOOLEAN DEFAULT 0,
  qty_delivered REAL DEFAULT 0,
  qty_invoiced REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
);

CREATE TABLE IF NOT EXISTS po_version_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER,
  version INTEGER,
  snapshot_json TEXT,
  change_summary TEXT,
  changed_by INTEGER,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- Section 3: Delivery Challan Tables
CREATE TABLE IF NOT EXISTS dc_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE,
  po_id INTEGER,
  delivery_location_id INTEGER,
  requested_dispatch_date DATE,
  vehicle_transporter TEXT,
  special_instructions TEXT,
  status TEXT DEFAULT 'pending',
  requested_by INTEGER,
  reviewed_by INTEGER,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (delivery_location_id) REFERENCES customer_locations(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dc_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_request_id INTEGER,
  po_line_item_id INTEGER,
  requested_qty REAL,
  FOREIGN KEY (dc_request_id) REFERENCES dc_requests(id),
  FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id)
);

CREATE TABLE IF NOT EXISTS delivery_challans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_number TEXT UNIQUE,
  dc_request_id INTEGER,
  po_id INTEGER,
  customer_id INTEGER,
  location_id INTEGER,
  dispatch_date DATE,
  delivery_date DATE,
  status TEXT DEFAULT 'issued',
  total_value INTEGER,
  approved_doc_path TEXT,
  issued_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dc_request_id) REFERENCES dc_requests(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (location_id) REFERENCES customer_locations(id),
  FOREIGN KEY (issued_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dc_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_id INTEGER,
  po_line_item_id INTEGER,
  dispatched_qty REAL,
  accepted_qty REAL DEFAULT 0,
  rejected_qty REAL DEFAULT 0,
  acceptance_status TEXT DEFAULT 'pending',
  rejection_reason TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dc_id) REFERENCES delivery_challans(id),
  FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id)
);

-- Section 4: Invoice & AR Tables
CREATE TABLE IF NOT EXISTS invoice_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE,
  po_id INTEGER,
  status TEXT DEFAULT 'pending',
  requested_by INTEGER,
  reviewed_by INTEGER,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoice_request_dcs (
  invoice_request_id INTEGER,
  dc_id INTEGER,
  PRIMARY KEY (invoice_request_id, dc_id),
  FOREIGN KEY (invoice_request_id) REFERENCES invoice_requests(id),
  FOREIGN KEY (dc_id) REFERENCES delivery_challans(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE,
  invoice_request_id INTEGER,
  po_id INTEGER,
  customer_id INTEGER,
  invoice_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'draft',
  total_value INTEGER,
  gst_total INTEGER,
  grand_total INTEGER,
  amount_paid INTEGER DEFAULT 0,
  raised_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_request_id) REFERENCES invoice_requests(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (raised_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  po_line_item_id INTEGER,
  dc_line_item_id INTEGER NULL,
  invoiced_qty REAL,
  rate_per_unit INTEGER,
  value INTEGER,
  gst_amount INTEGER,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id),
  FOREIGN KEY (dc_line_item_id) REFERENCES dc_line_items(id)
);

CREATE TABLE IF NOT EXISTS ar_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT UNIQUE,
  invoice_id INTEGER,
  customer_id INTEGER,
  amount INTEGER,
  payment_date DATE,
  payment_mode TEXT,
  reference_number TEXT,
  remarks TEXT,
  logged_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (logged_by) REFERENCES users(id)
);

-- Section 5: Global Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  role_id INTEGER NULL,
  entity_type TEXT,
  entity_id INTEGER,
  action_type TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
