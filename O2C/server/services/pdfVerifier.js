const verifyPDF = require('@qlever-llc/verify-pdf').default;
const { getCertificatesInfoFromPDF } = require('@qlever-llc/verify-pdf');
const { PDFDocument } = require('pdf-lib');

/**
 * Cryptographically verifies the digital signature of a PDF file buffer
 * @param {Buffer} pdfBuffer The PDF file buffer
 * @returns {Object} Verification results containing validity, signer details, and integrity status
 */
function verifyInvoicePDF(pdfBuffer) {
  try {
    // 1. Run cryptographic signature verification
    const verification = verifyPDF(pdfBuffer);
    
    // If no signature is found, verified will be false and message may be set
    if (!verification.signatures || verification.signatures.length === 0) {
      return {
        valid: false,
        message: 'No digital signature found in the document.',
        tampered: false,
        details: null,
      };
    }
    
    // Extract first signature result
    const sigResult = verification.signatures[0];
    
    // In our O2C portal, we use self-signed certificates.
    // Thus, 'authenticity' (trusted root CA validation) will be false,
    // but 'integrity' tells us if the PDF byte-ranges match the cryptographic seal.
    // Integrity is true iff the document has NOT been tampered with since signing.
    const isIntegrityIntact = sigResult.integrity === true;
    
    // Extract certificate info
    let certInfo = null;
    try {
      const certsList = getCertificatesInfoFromPDF(pdfBuffer);
      if (certsList && certsList.length > 0 && certsList[0].length > 0) {
        certInfo = certsList[0][0]; // First cert of first signature
      }
    } catch (certError) {
      console.warn('[PDFVerifier] Could not extract certificate details:', certError.message);
    }
    
    // Map certificates metadata
    const issuedTo = certInfo?.issuedTo || {};
    const issuedBy = certInfo?.issuedBy || {};
    const validity = certInfo?.validityPeriod || {};
    const signatureMeta = sigResult.meta?.signatureMeta || {};
    
    const details = {
      signerName: issuedTo.organizationName || issuedTo.commonName || signatureMeta.name || 'Unknown Signer',
      issuer: issuedBy.organizationName || issuedBy.commonName || 'Unknown Issuer',
      serialNumber: certInfo?.serialNumber || 'N/A',
      validFrom: validity.notBefore || null,
      validTo: validity.notAfter || null,
      reason: signatureMeta.reason || 'N/A',
      location: signatureMeta.location || 'N/A',
      authenticity: sigResult.authenticity === true,
      integrity: isIntegrityIntact,
    };
    
    if (isIntegrityIntact) {
      return {
        valid: true,
        message: 'Digital signature is cryptographically valid. The document is intact and has NOT been modified since it was signed.',
        tampered: false,
        details,
      };
    } else {
      return {
        valid: false,
        message: 'WARNING: Document has been tampered with or modified after the digital signature was applied! The cryptographic seal is broken.',
        tampered: true,
        details,
      };
    }
  } catch (error) {
    console.error('[PDFVerifier] Verification error:', error);
    return {
      valid: false,
      message: `Verification failed: ${error.message}`,
      tampered: true,
      details: null,
    };
  }
}

async function extractWatermarkMetadata(pdfBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const subject = pdfDoc.getSubject();
    if (subject && subject.startsWith('O2C_METADATA:')) {
      const jsonStr = subject.substring('O2C_METADATA:'.length);
      return JSON.parse(jsonStr);
    }
  } catch (e) {
    console.error('[PDFVerifier] Error parsing watermark JSON metadata using pdf-lib:', e.message);
  }

  // Fallback to raw binary buffer scanning if pdf-lib parsing fails or has no subject
  try {
    const rawStr = pdfBuffer.toString('binary');
    
    // 1. Try ASCII/UTF-8 extraction
    let startIdx = rawStr.indexOf('O2C_METADATA:{');
    if (startIdx !== -1) {
      const slice = rawStr.slice(startIdx + 13); // Start after 'O2C_METADATA:'
      const endIdx = slice.indexOf('}');
      if (endIdx !== -1) {
        const jsonStr = slice.substring(0, endIdx + 1);
        return JSON.parse(jsonStr);
      }
    }
    
    // 2. Try UTF-16BE extraction
    const utf16Target = '\x00O\x002\x00C\x00_\x00M\x00E\x00T\x00A\x00D\x00A\x00T\x00A\x00:\x00{';
    startIdx = rawStr.indexOf(utf16Target);
    if (startIdx !== -1) {
      const slice = rawStr.slice(startIdx + utf16Target.length - 2);
      const endIdx = slice.indexOf('\x00}');
      if (endIdx !== -1) {
        const utf16Json = slice.substring(0, endIdx + 2);
        const cleanJsonStr = utf16Json
          .replace(/\x00/g, '')
          .replace(/\xfe\xff/g, '')
          .replace(/\xff\xfe/g, '');
        return JSON.parse(cleanJsonStr);
      }
    }
  } catch (err) {
    console.error('[PDFVerifier] Fallback scan error:', err.message);
  }
  
  return null;
}

module.exports = {
  verifyInvoicePDF,
  extractWatermarkMetadata,
};
