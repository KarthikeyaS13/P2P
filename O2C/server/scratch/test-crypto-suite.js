const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load signature verification service directly to inspect results
const { verifyInvoicePDF } = require('../services/pdfVerifier');

const API_BASE = 'http://localhost:5000/api';

async function runTest() {
  console.log('--- STARTING CRYPTOGRAPHIC DIGITAL SIGNATURE INTEGRITY TEST SUITE ---');

  try {
    // 1. Authenticate with seeded user credentials
    console.log('\n[1/6] Authenticating as Accounts Department...');
    const loginRes = await axios.post(`${API_BASE}/login`, {
      username: 'accounts',
      password: 'qwe123'
    });
    
    const token = loginRes.data.token;
    console.log('✓ Authentication successful. JWT token received.');

    // Configure client headers
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Find a requested invoice to approve
    console.log('\n[2/6] Querying pending (requested) invoices...');
    const listRes = await axios.get(`${API_BASE}/invoices`, { headers: authHeaders });
    const pendingInvoice = listRes.data.find(inv => inv.status === 'requested');

    if (!pendingInvoice) {
      throw new Error('No pending invoices found with status "requested" in the database.');
    }
    console.log(`✓ Found pending invoice: ID ${pendingInvoice.id}, Invoice Ref: ${pendingInvoice.invoice_number}`);

    // 3. Approve the invoice (which triggers server-side PDF generation & cryptographic PKCS#7 signing)
    console.log(`\n[3/6] Submitting approval & signing payload for invoice ID ${pendingInvoice.id}...`);
    const approveRes = await axios.post(`${API_BASE}/invoices/${pendingInvoice.id}/approve`, {
      signatureName: 'O2C Invoice Signer',
      signatureReason: 'Official tax invoice cryptographic approval seal.',
      signatureLocation: 'Bangalore, India',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // 1x1 white pixel as hand-drawn mock
    }, { headers: authHeaders });

    console.log('✓ Invoice approval transaction completed successfully.');
    console.log(`✓ Generated Invoice No: ${approveRes.data.invoice_number}`);
    console.log(`✓ Saved Signature Hash: ${approveRes.data.signature_hash}`);

    // 4. Download the signed PDF document from the server
    console.log('\n[4/6] Downloading the cryptographically signed PDF document...');
    const pdfRes = await axios.get(`${API_BASE}/invoices/${pendingInvoice.id}/pdf`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });

    const pdfBuffer = Buffer.from(pdfRes.data);
    console.log(`✓ PDF downloaded successfully. Size: ${pdfBuffer.length} bytes.`);

    // Save the PDF locally for manual verification if needed
    const signedPath = path.join(__dirname, 'test_invoice_signed.pdf');
    fs.writeFileSync(signedPath, pdfBuffer);
    console.log(`✓ Signed PDF saved to scratch path: ${signedPath}`);

    // 5. Verify the cryptographic signature on the intact PDF
    console.log('\n[5/6] Performing PKCS#7 digital signature verification on the intact PDF...');
    const verifyResult = verifyInvoicePDF(pdfBuffer);
    console.log('Verification Output:', JSON.stringify(verifyResult, null, 2));

    if (verifyResult.valid && verifyResult.details.integrity) {
      console.log('✓ INTACT PDF VERIFICATION PASSED!');
      console.log(`  - Signer: ${verifyResult.details.signerName}`);
      console.log(`  - Issuer: ${verifyResult.details.issuer}`);
      console.log(`  - Integrity: ${verifyResult.details.integrity ? 'Intact (Not Modified)' : 'TAMPERED!'}`);
    } else {
      throw new Error('Verification failed on the intact signed PDF!');
    }

    // 6. Test Tamper Detection
    console.log('\n[6/6] Injecting artificial tamper modification (modifying 1 byte in the PDF body)...');
    
    // We will find a non-critical metadata string or random byte in the middle of the PDF and corrupt it
    const tamperedBuffer = Buffer.from(pdfBuffer);
    
    // Let's modify a single byte in the header or catalog without destroying the structure
    // Let's change a byte inside the PDF document trailer or metadata (e.g. index 500)
    for (let i = 1000; i < tamperedBuffer.length - 1000; i++) {
      // Find a character to swap that won't make the PDF engine fail parsing entirely but invalidates the signature range hash
      if (tamperedBuffer[i] === 0x20 || tamperedBuffer[i] === 0x61) { // space or 'a'
        tamperedBuffer[i] = 0x58; // Change to 'X'
        break;
      }
    }

    const tamperedPath = path.join(__dirname, 'test_invoice_tampered.pdf');
    fs.writeFileSync(tamperedPath, tamperedBuffer);
    console.log(`✓ Tampered PDF saved to scratch path: ${tamperedPath}`);

    console.log('Running signature verification on the modified PDF...');
    const tamperResult = verifyInvoicePDF(tamperedBuffer);
    console.log('Tampered Verification Output:', JSON.stringify(tamperResult, null, 2));

    if (!tamperResult.valid && tamperResult.tampered) {
      console.log('✓ TAMPER DETECTION PASSED!');
      console.log('  - Cryptographic validation correctly identified that the document was modified/altered.');
    } else {
      throw new Error('Tamper detection failed! The modified PDF was reported as valid or not tampered.');
    }

    console.log('\n======================================================');
    console.log('✓ ALL CRYPTOGRAPHIC TESTS COMPLETED AND PASSED!');
    console.log('======================================================');

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    if (err.response && err.response.data) {
      console.error('Error details:', err.response.data);
    }
    process.exit(1);
  }
}

runTest();
