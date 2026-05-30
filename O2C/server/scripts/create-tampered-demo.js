const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { PDFDocument } = require('pdf-lib');
const { generateInvoicePDFBuffer } = require('../services/pdfGenerator');
const { signInvoicePDF } = require('../services/pdfSigner');

async function generate() {
  const db = new Database(path.join(__dirname, '../database.sqlite'));
  const docUuid = 'demo-uuid-12345-67890';
  const testInvoiceId = 8888;

  // 1. Setup mock customer & invoice in database
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("INSERT OR IGNORE INTO customers (id, name, email, phone, gstin, address_line1) VALUES (888, 'Sejda Demo Corp', 'demo@sejda.com', '9999999999', '29DEMO1234A1Z5', 'Demo Street 100')");
  db.prepare("DELETE FROM invoices WHERE id = ?").run(testInvoiceId);
  db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(testInvoiceId);
  db.exec("PRAGMA foreign_keys = ON");

  // Insert original invoice with grand total 52,500.00
  db.prepare(`
    INSERT INTO invoices (
      id, customer_id, invoice_number, invoice_date, due_date,
      subtotal, gst_total, grand_total, status, internal_document_uuid
    ) VALUES (?, 888, 'INV/DEMO/8888', '2026-05-19', '2026-06-19', 50000.00, 2500.00, 52500.00, 'approved', ?)
  `).run(testInvoiceId, docUuid);

  db.prepare(`
    INSERT INTO invoice_items (invoice_id, item_name, quantity, rate, taxable_value, gst_percent, gst_amount, total_value)
    VALUES (?, 'Enterprise Cloud License', 10, 5000.00, 50000.00, 5, 2500.00, 52500.00)
  `).run(testInvoiceId);

  const invoice = db.prepare(`
    SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
           c.gstin as customer_gstin, c.address_line1 as customer_address
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.id = ?
  `).get(testInvoiceId);
  invoice.items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(testInvoiceId);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id);

  // 2. Generate and Sign Original PDF
  /* console.log('Generating original PDF...'); */
  const originalPdfDoc = await generateInvoicePDFBuffer(invoice, invoice.items, customer);
  const signResult = await signInvoicePDF(originalPdfDoc, invoice.id, invoice.invoice_number);
  const signedPdfBytes = fs.readFileSync(signResult.absolutePath);

  // Save signed PDF file hash in DB as per requirement
  const crypto = require('crypto');
  const signedHash = crypto.createHash('sha256').update(signedPdfBytes).digest('hex');
  db.prepare("UPDATE invoices SET pdf_file_hash = ?, signature_hash = ? WHERE id = ?")
    .run(signedHash, signedHash, testInvoiceId);

  // 3. Generate Tampered (Unsigned) PDF
  // We change the invoice object values to simulate visual editing (total changed to 12,500.00)
  /* console.log('Generating tampered (visual edit) PDF...'); */
  const tamperedInvoice = { ...invoice, grand_total: 12500.00, subtotal: 10000.00, gst_total: 2500.00 };
  const tamperedItems = [{ ...invoice.items[0], rate: 1000.00, taxable_value: 10000.00, total_value: 12500.00 }];
  
  const tamperedPdfDoc = await generateInvoicePDFBuffer(tamperedInvoice, tamperedItems, customer);
  
  // Set the Subject metadata to point to the original invoice UUID, matching the watermark check
  const watermarkPayload = {
    invoice_id: invoice.id,
    uuid: invoice.internal_document_uuid,
    timestamp: new Date().toISOString(),
    hash: ""
  };
  tamperedPdfDoc.setSubject(`O2C_METADATA:${JSON.stringify(watermarkPayload)}`);
  const tamperedPdfBytes = await tamperedPdfDoc.save();

  // Save files to workspace directory
  const outputDir = path.join(__dirname, '../../demo_files');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const originalPath = path.join(outputDir, 'invoice_original_demo.pdf');
  const tamperedPath = path.join(outputDir, 'invoice_tampered_demo.pdf');

  fs.writeFileSync(originalPath, signedPdfBytes);
  fs.writeFileSync(tamperedPath, tamperedPdfBytes);

  /* console.log(`Demo files generated successfully!`); */
  /* console.log(`Original: ${originalPath}`); */
  /* console.log(`Tampered: ${tamperedPath}`); */
  
  db.close();
}

generate().catch(console.error);
