const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const signpdf = require('@signpdf/signpdf').default;
const { P12Signer } = require('@signpdf/signer-p12');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');

/**
 * Digitally signs a pdf-lib PDFDocument using a P12 certificate and saves it to disk.
 * @param {PDFDocument} pdfDoc pdf-lib PDFDocument instance (not saved yet)
 * @param {number|string} invoiceId Invoice ID in the DB
 * @param {string} invoiceNumber Invoice number (e.g. INV/2026/0001)
 * @param {string} location Location of the signer
 * @returns {Promise<Object>} Path and hash information of the signed PDF
 */
async function signInvoicePDF(pdfDoc, invoiceId, invoiceNumber, location = 'Bangalore, India') {
  try {
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    // Add signature field placeholder to the document
    // Visual coordinates in pdf-lib start from bottom-left.
    // Our visual dashed box in pdfGenerator.js is drawn at x=40, y=60, width=220, height=70
    pdflibAddPlaceholder({
      pdfDoc,
      pdfPage: lastPage,
      reason: 'Official tax invoice cryptographic approval seal.',
      contactInfo: 'support@sudha.com',
      location: location,
      name: 'Sudha Analyticals O2C Portal',
      widgetRect: [40, 60, 260, 130], // x1, y1, x2, y2
      signatureLength: 8192,
    });

    // Save pdf-lib doc to Uint8Array/Buffer
    const pdfBytes = await pdfDoc.save();

    // Load keystore.p12 certificate
    const p12Path = path.join(__dirname, '..', 'keys', 'keystore.p12');
    if (!fs.existsSync(p12Path)) {
      throw new Error('PKCS#12 certificate keystore.p12 not found. Run generate-certs.sh first.');
    }

    const passphrase = process.env.PDF_SIGN_PASSPHRASE || 'password123';
    const p12Buffer = fs.readFileSync(p12Path);
    const signer = new P12Signer(p12Buffer, { passphrase });

    // Extract certificate details for database storage
    let certificateSerial = 'N/A';
    let signerName = 'Sudha Analyticals';
    try {
      const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'), false);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);

      for (const safeContents of p12.safeContents) {
        for (const safeBag of safeContents.safeBags) {
          if (safeBag.cert) {
            const cert = safeBag.cert;
            if (cert.serialNumber) {
              certificateSerial = cert.serialNumber;
            }
            if (cert.subject && cert.subject.getField) {
              const cnField = cert.subject.getField('CN');
              if (cnField) {
                signerName = cnField.value;
              }
            }
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[PDFSigner] Could not parse cert details with node-forge:', e.message);
    }

    // Apply digital signature using node-signpdf
    const signedPdfBuffer = await signpdf.sign(Buffer.from(pdfBytes), signer);

    // Make safe name for disk
    const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `invoice_signed_${invoiceId}_${safeNumber}.pdf`;

    // Target path in uploads folder
    const relativePath = path.join('uploads', 'signed-pdfs', filename);
    const absolutePath = path.join(__dirname, '..', relativePath);

    // Ensure parent folders exist
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    // Write signed file to disk
    fs.writeFileSync(absolutePath, signedPdfBuffer);

    // Generate a cryptographic hash of the entire signed PDF for audit trail
    const fileHash = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

    return {
      filename,
      relativePath: '/uploads/signed-pdfs/' + filename,
      absolutePath,
      hash: fileHash,
      signerName,
      certificateSerial,
    };
  } catch (error) {
    console.error('[PDFSigner] Error signing PDF invoice:', error);
    throw error;
  }
}

module.exports = {
  signInvoicePDF,
};
