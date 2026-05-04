# O2C (Order-to-Cash) Command Center — Database Design

## 1. Understanding Summary

- **What:** A relational database (SQLite) powering the O2C Command Center, covering the full lifecycle from customer onboarding to receipt collection.
- **Why:** To replace manual/spreadsheet-based tracking with a structured, auditable system that enforces a strict O2C workflow.
- **Who:** 8 user roles (Sales, Stores, Projects, Accounts, Admin, Management, Approver, Auditor). Users can hold multiple roles.
- **Workflow:** PO Entry (Sales) → PO Approval (Accounts) → DC Request (Stores) → DC Issuance (Accounts) → DC Status Update (Finance) → Customer DC Approval → Invoice Request (Sales against closed DCs) → Invoice Raised (Accounts) → Invoice Confirmation (Customer) → Receipt Logged (against confirmed invoice).
- **Constraints:** SQLite, local document storage (`/uploads`), financial values in paise (₹), ~50 users, ~5K POs per year.

## 2. Assumptions
1. Non-tendered / Temp POs reference the original PO and create a new OrderID series.
2. PO line items track supply and service portions separately (qty, rate, GST split).
3. GST details are stored at the line-item level.
4. Partial deliveries are tracked at the line-item level (ordered qty vs delivered qty).
5. AR receipts can be partial — multiple payments against one invoice.
6. The `Approver` role has read-only dashboard access; `Auditor` sees the global audit log.

## 3. Decision Log
1. **Database Strategy:** SQLite with local file storage (`/uploads`). Chosen for simplicity, easy backups, and alignment with enterprise standalone tools.
2. **PO Versioning:** Live PO record updated in-place (Option B), accompanied by a `po_version_history` table for full JSON snapshots to maintain a strict audit trail.
3. **Roles:** Merged 8 roles (Sales, Stores, Projects, Accounts, Admin, Management, Approver, Auditor) into a `roles` table, mapped to `users` via a many-to-many relationship (Option C).
4. **Customer Locations:** Separated into a `customer_locations` table (one-to-many) to handle discrete delivery sites, SPOCs, and location-specific GSTINs (Option A).
5. **Invoicing Strategy:** Flexible N:1 mapping via `invoice_request_dcs` junction table, allowing Sales to bundle multiple closed DCs into one invoice (Option C).
6. **DC Workflow Refinement:** Added an explicit two-step DC process (Stores Request → Accounts Issue) and granular customer acceptance tracking at the `dc_line_items` level to handle partial approvals accurately.

---

## 4. Schema Design

### Section 1: Master Tables

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `username` | TEXT UNIQUE | Login identifier |
| `password_hash` | TEXT | Bcrypt hashed |
| `full_name` | TEXT NOT NULL | Display name |
| `email` | TEXT UNIQUE | |
| `phone` | TEXT | |
| `is_active` | BOOLEAN | Default 1 |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

#### `roles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT UNIQUE | sales, stores, projects, accounts, admin, management, approver, auditor |

#### `user_roles`
| Column | Type | Notes |
|--------|------|-------|
| `user_id` | INTEGER FK | References `users` |
| `role_id` | INTEGER FK | References `roles` |
| PRIMARY KEY | (user_id, role_id) | |

#### `customers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `cust_code` | TEXT UNIQUE | System-gen: CUST-XXXXX |
| `name` | TEXT NOT NULL | |
| `gstin` | TEXT | Primary GSTIN |
| `email` | TEXT | |
| `phone` | TEXT | |
| `gst_status` | TEXT | verified / pending / rejected |
| `is_active` | BOOLEAN | |
| `created_by` | INTEGER FK | References `users` (Admin) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

#### `customer_locations`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `customer_id` | INTEGER FK | References `customers` |
| `label` | TEXT | e.g., "Central Warehouse" |
| `address_line1` | TEXT | |
| `address_line2` | TEXT | |
| `city` | TEXT | |
| `state` | TEXT | |
| `pincode` | TEXT | |
| `gstin` | TEXT | Location-specific GSTIN |
| `contact_name` | TEXT | SPOC name |
| `contact_email` | TEXT | |
| `contact_phone` | TEXT | |
| `is_primary` | BOOLEAN | |

---

### Section 2: Purchase Order Tables

#### `purchase_orders`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `order_id` | TEXT UNIQUE | System-gen: PO-YYYY-XXXX |
| `customer_id` | INTEGER FK | References `customers` |
| `location_id` | INTEGER FK | References `customer_locations` |
| `po_number` | TEXT | Customer's original PO number |
| `po_date` | DATE | Date on customer's PO |
| `start_date` | DATE | Contract start |
| `completion_date` | DATE | Expected completion |
| `total_value` | INTEGER | In paise (₹) |
| `gst_total` | INTEGER | In paise |
| `grand_total` | INTEGER | total_value + gst_total |
| `status` | TEXT | draft / submitted / approved / rejected / active / completed / cancelled |
| `version` | INTEGER | Current version number, starts at 1 |
| `spoc_name` | TEXT | Sales point of contact |
| `spoc_email` | TEXT | |
| `spoc_phone` | TEXT | |
| `remarks` | TEXT | |
| `is_temp_po` | BOOLEAN | Non-tendered / Temp PO flag |
| `parent_po_id` | INTEGER FK | References `purchase_orders` (NULL for primary) |
| `uploaded_file_path` | TEXT | Path to original Excel in /uploads |
| `created_by` | INTEGER FK | References `users` (Sales) |
| `approved_by` | INTEGER FK | References `users` (Accounts) |
| `approved_at` | DATETIME | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

#### `po_line_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `po_id` | INTEGER FK | References `purchase_orders` |
| `line_number` | INTEGER | Display order |
| `reference_number` | TEXT | From spreadsheet |
| `package` | TEXT | |
| `heading` | TEXT | |
| `sub_heading` | TEXT | |
| `item_name` | TEXT NOT NULL | |
| `item_description` | TEXT | |
| `uom` | TEXT | Unit of measurement |
| `quantity` | REAL | |
| `rate_per_unit` | INTEGER | In paise |
| `value` | INTEGER | qty × rate, in paise |
| `gst_rate` | REAL | Percentage (e.g., 18.0) |
| `gst_amount` | INTEGER | In paise |
| `is_service` | BOOLEAN | TRUE = service portion |
| `qty_delivered` | REAL | Running total from closed DCs |
| `qty_invoiced` | REAL | Running total from invoices |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

#### `po_version_history`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `po_id` | INTEGER FK | References `purchase_orders` |
| `version` | INTEGER | Version number at time of change |
| `snapshot_json` | TEXT | Full JSON snapshot of PO + line items |
| `change_summary` | TEXT | What changed |
| `changed_by` | INTEGER FK | References `users` |
| `changed_at` | DATETIME | |

---

### Section 3: Delivery Challan Tables

#### `dc_requests`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `request_number` | TEXT UNIQUE | System-gen: DCR-YYYY-XXXX |
| `po_id` | INTEGER FK | References `purchase_orders` |
| `delivery_location_id` | INTEGER FK | References `customer_locations` |
| `requested_dispatch_date`| DATE | |
| `vehicle_transporter` | TEXT | |
| `special_instructions` | TEXT | |
| `status` | TEXT | pending / approved / rejected |
| `requested_by` | INTEGER FK | References `users` (Stores) |
| `reviewed_by` | INTEGER FK | References `users` (Accounts/Finance) |
| `reviewed_at` | DATETIME | |
| `created_at` | DATETIME | |

#### `dc_request_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `dc_request_id` | INTEGER FK | References `dc_requests` |
| `po_line_item_id` | INTEGER FK | References `po_line_items` |
| `requested_qty` | REAL | Qty Stores wants dispatched |

#### `delivery_challans`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `dc_number` | TEXT UNIQUE | System-gen: DC-YYYY-XXXX |
| `dc_request_id` | INTEGER FK | References `dc_requests` |
| `po_id` | INTEGER FK | References `purchase_orders` |
| `customer_id` | INTEGER FK | References `customers` |
| `location_id` | INTEGER FK | References `customer_locations` |
| `dispatch_date` | DATE | Actual dispatch |
| `delivery_date` | DATE | Actual delivery |
| `status` | TEXT | issued / dispatched / delivered / partially_approved / closed / rejected |
| `total_value` | INTEGER | In paise |
| `approved_doc_path` | TEXT | Uploaded signed DC from customer |
| `issued_by` | INTEGER FK | References `users` (Accounts) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

#### `dc_line_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `dc_id` | INTEGER FK | References `delivery_challans` |
| `po_line_item_id` | INTEGER FK | References `po_line_items` |
| `dispatched_qty` | REAL | Qty actually dispatched |
| `accepted_qty` | REAL | Qty customer accepted |
| `rejected_qty` | REAL | Qty customer rejected |
| `acceptance_status` | TEXT | pending / accepted / partially_accepted / rejected |
| `rejection_reason` | TEXT | |
| `updated_at` | DATETIME | |

---

### Section 4: Invoice & AR Tables

#### `invoice_requests`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `request_number` | TEXT UNIQUE | System-gen: IR-YYYY-XXXX |
| `po_id` | INTEGER FK | References `purchase_orders` |
| `status` | TEXT | pending / approved / rejected |
| `requested_by` | INTEGER FK | References `users` (Sales) |
| `reviewed_by` | INTEGER FK | References `users` (Accounts) |
| `reviewed_at` | DATETIME | |
| `created_at` | DATETIME | |

#### `invoice_request_dcs` (Junction Table)
| Column | Type | Notes |
|--------|------|-------|
| `invoice_request_id` | INTEGER FK | References `invoice_requests` |
| `dc_id` | INTEGER FK | References `delivery_challans` (Must be 'closed') |
| PRIMARY KEY | (invoice_request_id, dc_id) | |

#### `invoices`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `invoice_number` | TEXT UNIQUE | System-gen: INV-YYYY-XXXX |
| `invoice_request_id` | INTEGER FK | References `invoice_requests` |
| `po_id` | INTEGER FK | References `purchase_orders` |
| `customer_id` | INTEGER FK | References `customers` |
| `invoice_date` | DATE | |
| `due_date` | DATE | |
| `status` | TEXT | draft / raised / customer_confirmed / paid_partial / paid_full / cancelled |
| `total_value` | INTEGER | In paise |
| `gst_total` | INTEGER | In paise |
| `grand_total` | INTEGER | In paise |
| `amount_paid` | INTEGER | Running total of receipts, in paise |
| `raised_by` | INTEGER FK | References `users` (Accounts) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

#### `invoice_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `invoice_id` | INTEGER FK | References `invoices` |
| `po_line_item_id` | INTEGER FK | References `po_line_items` |
| `dc_line_item_id` | INTEGER FK | References `dc_line_items` |
| `invoiced_qty` | REAL | Derived from accepted_qty in DCs |
| `rate_per_unit` | INTEGER | In paise |
| `value` | INTEGER | In paise |
| `gst_amount` | INTEGER | In paise |

#### `ar_receipts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `receipt_number` | TEXT UNIQUE | System-gen: REC-YYYY-XXXX |
| `invoice_id` | INTEGER FK | References `invoices` |
| `customer_id` | INTEGER FK | References `customers` |
| `amount` | INTEGER | In paise |
| `payment_date` | DATE | |
| `payment_mode` | TEXT | Bank Transfer / Cheque / Draft |
| `reference_number` | TEXT | UTR / Cheque Number |
| `remarks` | TEXT | |
| `logged_by` | INTEGER FK | References `users` (Accounts) |
| `created_at` | DATETIME | |

---

### Section 5: Global Audit Log

#### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `timestamp` | DATETIME | Exact time of action |
| `user_id` | INTEGER FK | References `users` |
| `role_id` | INTEGER FK | Context role (optional) |
| `entity_type` | TEXT | e.g., 'purchase_order', 'invoice' |
| `entity_id` | INTEGER | ID of the record changed |
| `action_type` | TEXT | create / update / delete / approve / reject / upload |
| `old_values` | TEXT | JSON dump of state before change |
| `new_values` | TEXT | JSON dump of state after change |
| `ip_address` | TEXT | |
| `user_agent` | TEXT | |
