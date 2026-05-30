const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const { PDFDocument } = require('pdf-lib');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(DB_PATH);

async function runTests() {
  /* console.log('=================================================='); */
  /* console.log('O2C PDF DIGITAL SIGNATURE TAMPER-DETECTION SUITE'); */
  /* console.log('==================================================\n'); */

  // 1. Create a dummy customer and invoice for the test
  /* console.log('[Setup] Inserting test invoice into SQLite DB...'); */
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("INSERT OR IGNORE INTO customers (id, name, email, phone, gstin, address_line1) VALUES (999, 'Test Corp', 'test@corp.com', '9999999999', '29TEST1234A1Z5', 'Test Street')");
  
  const docUuid = crypto.randomUUID();
  const testInvoiceId = 9999;
  
  db.prepare("DELETE FROM invoices WHERE id = ?").run(testInvoiceId);
  db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(testInvoiceId);
  db.exec("PRAGMA foreign_keys = ON");
  
  db.prepare(`
    INSERT INTO invoices (
      id, customer_id, invoice_number, invoice_date, due_date, 
      subtotal, gst_total, grand_total, status, internal_document_uuid
    ) VALUES (?, 999, 'INV/2026/9999', '2026-05-19', '2026-06-19', 1000, 180, 1180, 'raised', ?)
  `).run(testInvoiceId, docUuid);

  db.prepare(`
    INSERT INTO invoice_items (invoice_id, item_name, quantity, rate, taxable_value, gst_percent, gst_amount, total_value)
    VALUES (?, 'Secure Audit Module', 1, 1000, 1000, 18, 180, 1180)
  `).run(testInvoiceId);

  // 2. Generate and Sign PDF
  const { generateInvoicePDFBuffer } = require('../services/pdfGenerator');
  const { signInvoicePDF } = require('../services/pdfSigner');

  /* console.log('[Setup] Generating and signing original invoice PDF...'); */
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(testInvoiceId);
  invoice.items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(testInvoiceId);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id);

  const pdfDoc = await generateInvoicePDFBuffer(invoice, invoice.items, customer);
  const signedResult = await signInvoicePDF(pdfDoc, testInvoiceId, invoice.invoice_number);

  // Update DB with signed fields
  db.prepare(`
    UPDATE invoices SET 
      signed_pdf_path = ?, 
      pdf_file_hash = ?, 
      certificate_serial = ?, 
      signer_name = ? 
    WHERE id = ?
  `).run(signedResult.relativePath, signedResult.hash, signedResult.certificateSerial, signedResult.signerName, testInvoiceId);

  const signedPdfBuffer = fs.readFileSync(signedResult.absolutePath);
  /* console.log(`[Setup] Original PDF created: ${signedResult.filename} (Hash: ${signedResult.hash})\n`); */



  // Define helper to post to verify-pdf
  const verifyPdfFile = async (fileBuffer, filename) => {
    const form = new FormData();
    form.append('pdf', fileBuffer, { filename });
    try {
      const response = await axios.post('http://localhost:5000/api/public/verify-pdf', form, {
        headers: form.getHeaders()
      });
      return response.data;
    } catch (err) {
      return { error: err.response?.data || err.message };
    }
  };

  // ==========================================
  // CASE 1: Original Signed PDF
  // ==========================================
  /* console.log('--- TEST CASE 1: Original Signed PDF ---'); */
  const res1 = await verifyPdfFile(signedPdfBuffer, 'original.pdf');
  /* console.log('Result:', {
    valid: res1.valid,
    signaturePresent: res1.signaturePresent,
    hashMatched: res1.hashMatched,
    message: res1.message
  }); */
  if (res1.valid && res1.signaturePresent && res1.hashMatched) {
    /* console.log('=> CASE 1 PASSED ✓\n'); */
  } else {
    /* console.log('=> CASE 1 FAILED ✗\n'); */
  }

  // ==========================================
  // CASE 2: Signature Stripped (e.g. Sejda)
  // ==========================================
  /* console.log('--- TEST CASE 2: Signature Removed/Stripped ---'); */
  // Load using pdf-lib and re-save, which strips the signatures but keeps metadata
  const doc = await PDFDocument.load(signedPdfBuffer);

  const strippedDoc = await PDFDocument.create();
  const [copiedPage] = await strippedDoc.copyPages(doc, [0]);
  strippedDoc.addPage(copiedPage);
  const originalSubject = doc.getSubject();
  if (originalSubject) {
    strippedDoc.setSubject(originalSubject);
  }
  const strippedPdfBytes = await strippedDoc.save();
  const strippedBuffer = Buffer.from(strippedPdfBytes);


  const res2 = await verifyPdfFile(strippedBuffer, 'stripped.pdf');
  /* console.log('Result:', {
    valid: res2.valid,
    signaturePresent: res2.signaturePresent,
    hashMatched: res2.hashMatched,
    message: res2.message,
    invoiceId: res2.invoice?.id
  }); */
  if (!res2.valid && !res2.signaturePresent && res2.invoice) {
    /* console.log('=> CASE 2 PASSED ✓\n'); */
  } else {
    /* console.log('=> CASE 2 FAILED ✗\n'); */
  }

  // ==========================================
  // CASE 3: Tampered (Signature intact but altered content)
  // ==========================================
  /* console.log('--- TEST CASE 3: Tampered PDF With Signature Envelopes Intact ---'); */
  const tamperedBuffer = Buffer.from(signedPdfBuffer);
  // Modify a byte in the middle of the file to break hash integrity
  const targetOffset = Math.floor(tamperedBuffer.length / 2);
  tamperedBuffer[targetOffset] = tamperedBuffer[targetOffset] ^ 0xFF;
  /* console.log(`[Tamper] Injected single-byte alteration at offset ${targetOffset}.`); */

  const res3 = await verifyPdfFile(tamperedBuffer, 'tampered.pdf');
  /* console.log('Result:', {
    valid: res3.valid,
    signaturePresent: res3.signaturePresent,
    hashMatched: res3.hashMatched,
    message: res3.message
  }); */
  if (!res3.valid && res3.signaturePresent && !res3.hashMatched) {
    /* console.log('=> CASE 3 PASSED ✓\n'); */
  } else {
    /* console.log('=> CASE 3 FAILED ✗\n'); */
  }

  // ==========================================
  // CASE 4: Fake / Unsigned PDF
  // ==========================================
  /* console.log('--- TEST CASE 4: Fake / Unsigned PDF ---'); */
  const fakeDoc = await PDFDocument.create();
  fakeDoc.addPage([595.27, 841.89]);
  const fakePdfBytes = await fakeDoc.save();
  const fakeBuffer = Buffer.from(fakePdfBytes);

  const res4 = await verifyPdfFile(fakeBuffer, 'fake.pdf');
  /* console.log('Result:', {
    valid: res4.valid,
    signaturePresent: res4.signaturePresent,
    hashMatched: res4.hashMatched,
    message: res4.message
  }); */
  if (!res4.valid && !res4.signaturePresent && !res4.invoice) {
    /* console.log('=> CASE 4 PASSED ✓\n'); */
  } else {
    /* console.log('=> CASE 4 FAILED ✗\n'); */
  }

  // ==========================================
  // CASE 5: QR Code Verification
  // ==========================================
  /* console.log('--- TEST CASE 5: QR Code Verification Endpoint ---'); */
  try {
    const res5 = await axios.get(`http://localhost:5000/api/public/verify-qr?invoice_id=${testInvoiceId}&token=${docUuid}`);
    /* console.log('Result (Valid):', {
      valid: res5.data.valid,
      message: res5.data.message,
      invoiceNumber: res5.data.invoice?.invoice_number
    }); */

    let invalidFailed = false;
    try {
      await axios.get(`http://localhost:5000/api/public/verify-qr?invoice_id=${testInvoiceId}&token=invalid-uuid`);
    } catch (e) {
      /* console.log('Result (Invalid Token):', {
        status: e.response?.status,
        message: e.response?.data?.message
      }); */
      if (e.response?.status === 404) invalidFailed = true;
    }

    if (res5.data.valid && invalidFailed) {
      /* console.log('=> CASE 5 PASSED ✓\n'); */
    } else {
      /* console.log('=> CASE 5 FAILED ✗\n'); */
    }
  } catch (err) {
    /* console.log('Result (Error):', err.message); */
    /* console.log('=> CASE 5 FAILED ✗\n'); */
  }

  // 3. Clean up database
  /* console.log('[Cleanup] Removing test invoice and customer...'); */
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare("DELETE FROM invoices WHERE id = ?").run(testInvoiceId);
  db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(testInvoiceId);
  db.prepare("DELETE FROM customers WHERE id = 999").run();
  db.exec("PRAGMA foreign_keys = ON");
  
  /* console.log('=================================================='); */
  /* console.log('TEST SUITE EXECUTION COMPLETE'); */
  /* console.log('=================================================='); */
}

runTests().catch(console.error);
