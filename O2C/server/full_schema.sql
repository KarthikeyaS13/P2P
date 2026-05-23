CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, google_id TEXT, profile_picture TEXT, auth_provider TEXT);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);
CREATE TABLE user_roles (
  user_id INTEGER,
  role_id INTEGER,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, legal_name TEXT, pan TEXT, address_line1 TEXT, address_line2 TEXT, address_line3 TEXT, pincode TEXT, contact_name TEXT, contact_department TEXT, contact_email TEXT, contact_phone TEXT, city TEXT, state TEXT, spoc2_name TEXT, spoc2_department TEXT, spoc2_email TEXT, spoc2_phone TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE customer_locations (
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
  is_primary BOOLEAN DEFAULT 0, address_line3 TEXT, gst_is_different BOOLEAN DEFAULT 0, spoc2_name TEXT, spoc2_department TEXT, spoc2_email TEXT, spoc2_phone TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE purchase_orders (
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_temporary BOOLEAN DEFAULT 0, linked_po_id INTEGER REFERENCES purchase_orders(id), is_nt_po BOOLEAN DEFAULT 0, subtotal REAL, end_date DATE, po_copy_path TEXT, po_annex_path TEXT, other_attachment_path TEXT, dispatch_status TEXT DEFAULT 'pending', nt_count INTEGER DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (location_id) REFERENCES customer_locations(id),
  FOREIGN KEY (parent_po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);
CREATE TABLE po_line_items (
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, gst_percent REAL DEFAULT 0, taxable_value REAL DEFAULT 0, total_value REAL DEFAULT 0, description TEXT, package_name TEXT, supply_qty REAL, supply_rate REAL, supply_gst_rate REAL, service_qty REAL, service_rate REAL, service_gst_rate REAL, taxable_supply REAL, gst_supply REAL, total_supply REAL, taxable_service REAL, gst_service REAL, total_service REAL, total_taxable REAL, total_gst REAL, total_invoice REAL, edit_supply_qty REAL, edit_supply_rate REAL, edit_supply_gst_rate REAL, edit_service_qty REAL, edit_service_rate REAL, edit_service_gst_rate REAL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
);
CREATE TABLE po_version_history (
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
CREATE TABLE invoice_requests (
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
CREATE TABLE invoice_request_dcs (
  invoice_request_id INTEGER,
  dc_id INTEGER,
  PRIMARY KEY (invoice_request_id, dc_id),
  FOREIGN KEY (invoice_request_id) REFERENCES invoice_requests(id),
  FOREIGN KEY (dc_id) REFERENCES delivery_challans(id)
);
CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  po_line_item_id INTEGER,
  dc_line_item_id INTEGER NULL,
  invoiced_qty REAL,
  rate_per_unit INTEGER,
  value INTEGER,
  gst_amount INTEGER, item_name TEXT, quantity REAL, rate REAL, gst_percent REAL, taxable_value REAL, total_value REAL, package_name TEXT, description TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id),
  FOREIGN KEY (dc_line_item_id) REFERENCES dc_line_items(id)
);
CREATE TABLE ar_receipts (
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
CREATE TABLE audit_logs (
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
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  module     TEXT NOT NULL,
  record_id  INTEGER,
  details    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE dc_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_id INTEGER REFERENCES delivery_challans(id),
  po_line_item_id INTEGER REFERENCES po_line_items(id),
  item_name TEXT,
  description TEXT,
  quantity_dispatched REAL DEFAULT 0,
  uom TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, hsn TEXT, received_qty REAL, item_condition TEXT DEFAULT 'OK', short_qty REAL DEFAULT 0, damaged_qty REAL DEFAULT 0, invoiced_qty REAL DEFAULT 0);
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  dc_id INTEGER REFERENCES delivery_challans(id),
  customer_id INTEGER REFERENCES customers(id),
  status TEXT DEFAULT 'draft',
  invoice_date DATE,
  subtotal REAL DEFAULT 0,
  gst_total REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  due_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, place_of_supply TEXT, payment_terms TEXT, billing_address TEXT, shipping_address TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, signature_data TEXT, verification_state TEXT, signature_hash TEXT, signed_at DATETIME, signed_by TEXT, integrity_status TEXT DEFAULT 'verified', pki_signature TEXT, digital_signature TEXT, public_verification_id TEXT, verification_status TEXT, co_signed_at DATETIME, co_signed_by TEXT, co_signed_designation TEXT, co_signature_data TEXT, co_signature_hash TEXT, public_key TEXT, signed_pdf_path TEXT, pdf_file_hash TEXT, internal_document_uuid TEXT, certificate_serial TEXT, signer_name TEXT);
CREATE TABLE ar_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  customer_id INTEGER REFERENCES customers(id),
  amount_due REAL DEFAULT 0,
  amount_received REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  payment_date DATE,
  payment_reference TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE dc_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        po_id INTEGER, 
        location_id INTEGER,
        dc_request_no TEXT, 
        dispatch_date TEXT, 
        status TEXT DEFAULT 'pending', 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        transporter TEXT, 
        special_instructions TEXT
      , vehicle_no TEXT, driver_name TEXT, driver_phone TEXT, lr_no TEXT, eway_bill_no TEXT, dispatch_proof_path TEXT, logistics_remarks TEXT, dispatched_at DATETIME, auto_dc_number TEXT, manual_dc_number TEXT, final_dc_number TEXT, dispatch_override_enabled BOOLEAN DEFAULT 0, dispatch_address_line1 TEXT, dispatch_address_line2 TEXT, dispatch_landmark TEXT, dispatch_city TEXT, dispatch_state TEXT, dispatch_pincode TEXT, verification_remarks TEXT, dispatch_from_address1 TEXT, dispatch_from_address2 TEXT, dispatch_from_pincode TEXT, dispatch_from_landmark TEXT, requested_dc_number TEXT, is_manual_dc BOOLEAN DEFAULT 0, proof_path TEXT);
CREATE TABLE dc_request_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        dc_request_id INTEGER, 
        line_item_id INTEGER, 
        qty REAL
      );
CREATE TABLE delivery_challans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dc_number TEXT UNIQUE,
          po_id INTEGER,
          customer_id INTEGER,
          customer_location_id INTEGER,
          dispatch_date TEXT,
          dispatch_from_address1 TEXT,
          dispatch_from_address2 TEXT,
          dispatch_from_pincode TEXT,
          vehicle_number TEXT,
          transporter_name TEXT,
          remarks TEXT,
          status TEXT DEFAULT 'raised',
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        , manual_dc_number TEXT, dc_request_id INTEGER, signature_data TEXT, delivery_status TEXT DEFAULT 'awaiting_confirmation', received_by TEXT, receiver_phone TEXT, receiver_designation TEXT, site_remarks TEXT, damage_remarks TEXT, shortage_remarks TEXT, pod_path TEXT, signed_dc_path TEXT, grn_path TEXT, site_photos_path TEXT, delivery_confirmed_at DATETIME, driver_phone TEXT, lr_no TEXT, eway_bill_no TEXT, dispatch_proof_path TEXT, logistics_remarks TEXT, dispatched_at DATETIME, vehicle_no TEXT, driver_name TEXT, transporter TEXT, acknowledgment_proof_path TEXT, invoicing_status TEXT DEFAULT 'pending');
CREATE TABLE delivery_challan_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dc_id INTEGER,
          po_item_id INTEGER,
          reference_no TEXT,
          package_name TEXT,
          description TEXT,
          hsn TEXT,
          uom TEXT,
          dispatch_qty REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(dc_id) REFERENCES delivery_challans(id)
        );
CREATE TABLE ar_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, amount REAL, payment_date TEXT, payment_mode TEXT, transaction_ref TEXT, recorded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE master_addresses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, addr_line1 TEXT, addr_line2 TEXT, city TEXT, state TEXT, pincode TEXT, landmark TEXT, is_default BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE enterprise_audit_trail (id INTEGER PRIMARY KEY AUTOINCREMENT, module_name TEXT, action_type TEXT, performed_by TEXT, reference_id TEXT, old_value TEXT, new_value TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE global_settings (key TEXT PRIMARY KEY, value TEXT);
CREATE UNIQUE INDEX idx_customers_cust_code ON customers(cust_code);
CREATE UNIQUE INDEX idx_customers_gstin ON customers(gstin);
