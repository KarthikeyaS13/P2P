const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');

/**
 * Helper to split text into lines to fit a specific width
 */
function wrapText(text, maxWidth, font, fontSize) {
  if (!text) return [];
  const paragraphs = text.toString().replace(/\r/g, '').split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (!word) continue;
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

/**
 * Generates an invoice PDF buffer using pdf-lib
 * @param {Object} invoice Invoice DB object
 * @param {Array} items Invoice items
 * @param {Object} customer Customer DB object
 * @returns {Promise<PDFDocument>} PDF Document
 */
async function generateInvoicePDFBuffer(invoice, items, customer) {
  const pdfDoc = await PDFDocument.create();

  // Set up fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Standard A4 Size: 595.27 x 841.89 points
  const page = pdfDoc.addPage([595.27, 841.89]);
  const { width, height } = page.getSize();

  // Margin & dimensions
  const margin = 40;
  const contentWidth = width - 2 * margin; // 515.27

  // Colors
  const primaryColor = rgb(0.09, 0.12, 0.22); // Dark Navy #171f38
  const secondaryColor = rgb(0.3, 0.4, 0.5); // Slate gray
  const textColor = rgb(0.15, 0.15, 0.15); // Dark text
  const tableHeaderBg = rgb(0.94, 0.96, 0.98); // Light gray-blue #f1f5f9
  const greenSecured = rgb(0.08, 0.5, 0.28); // Green #15803d

  // 1. Header Section
  page.drawText('TAX INVOICE', {
    x: margin,
    y: height - 60,
    size: 24,
    font: helveticaBold,
    color: primaryColor,
  });

  // Seller / Issuer details (Left)
  page.drawText('SUDHA ANALYTICALS', { x: margin, y: height - 90, size: 12, font: helveticaBold, color: textColor });
  page.drawText('Corporate Office: Industrial Area, Phase II', { x: margin, y: height - 105, size: 9, font: helvetica, color: secondaryColor });
  page.drawText('Bangalore, Karnataka, India - 560001', { x: margin, y: height - 118, size: 9, font: helvetica, color: secondaryColor });
  page.drawText('GSTIN: 29SUDHA1234A1Z5', { x: margin, y: height - 131, size: 9, font: helveticaBold, color: textColor });

  // Invoice Metadata (Right)
  const metaX = 400;
  page.drawText(`Invoice No:`, { x: metaX, y: height - 90, size: 9, font: helveticaBold, color: textColor });
  page.drawText(invoice.invoice_number || 'DRAFT', { x: metaX + 70, y: height - 90, size: 9, font: helvetica, color: textColor });

  page.drawText(`Invoice Date:`, { x: metaX, y: height - 105, size: 9, font: helveticaBold, color: textColor });
  page.drawText(invoice.invoice_date || 'N/A', { x: metaX + 70, y: height - 105, size: 9, font: helvetica, color: textColor });

  page.drawText(`Due Date:`, { x: metaX, y: height - 120, size: 9, font: helveticaBold, color: textColor });
  page.drawText(invoice.due_date || 'N/A', { x: metaX + 70, y: height - 120, size: 9, font: helvetica, color: textColor });

  page.drawText(`PO Number:`, { x: metaX, y: height - 135, size: 9, font: helveticaBold, color: textColor });
  page.drawText(invoice.po_number || invoice.po_no || 'N/A', { x: metaX + 70, y: height - 135, size: 9, font: helvetica, color: textColor });

  // Divider
  page.drawLine({
    start: { x: margin, y: height - 150 },
    end: { x: width - margin, y: height - 150 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  // 2. Billing / Shipping Details
  const colWidth = 240;
  const detailsY = height - 170;

  // BILL TO
  page.drawText('BILL TO (CUSTOMER)', { x: margin, y: detailsY, size: 10, font: helveticaBold, color: primaryColor });
  page.drawText(customer?.name || 'N/A', { x: margin, y: detailsY - 15, size: 10, font: helveticaBold, color: textColor });

  const billingAddr = invoice.billing_address || customer?.address_line1 || 'N/A';
  const billingLines = wrapText(billingAddr, colWidth, helvetica, 8);
  let addrOffset = 30;
  billingLines.slice(0, 3).forEach((line) => {
    page.drawText(line, { x: margin, y: detailsY - addrOffset, size: 8, font: helvetica, color: secondaryColor });
    addrOffset += 11;
  });
  page.drawText(`GSTIN: ${customer?.gstin || 'N/A'}`, { x: margin, y: detailsY - addrOffset - 5, size: 8, font: helveticaBold, color: textColor });

  // SHIP TO
  const shipX = margin + colWidth + 30;
  page.drawText('SHIP TO / PLACE OF SUPPLY', { x: shipX, y: detailsY, size: 10, font: helveticaBold, color: primaryColor });

  const shippingAddr = invoice.shipping_address || customer?.address_line1 || 'N/A';
  const shippingLines = wrapText(shippingAddr, colWidth, helvetica, 8);
  let shipOffset = 15;
  shippingLines.slice(0, 4).forEach((line) => {
    page.drawText(line, { x: shipX, y: detailsY - shipOffset, size: 8, font: helvetica, color: secondaryColor });
    shipOffset += 11;
  });
  page.drawText(`Place of Supply: ${invoice.place_of_supply || 'N/A'}`, { x: shipX, y: detailsY - shipOffset - 5, size: 8, font: helveticaBold, color: textColor });

  // Divider
  page.drawLine({
    start: { x: margin, y: height - 260 },
    end: { x: width - margin, y: height - 260 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  // 3. Items Table Header
  const tableY = height - 280;

  const cols = [
    { name: 'S.No', x: margin + 2, width: 23, align: 'left' },
    { name: 'Item / Package Name', x: margin + 27, width: 168, align: 'left' },
    { name: 'Description', x: margin + 197, width: 118, align: 'left' },
    { name: 'Qty', x: margin + 317, width: 33, align: 'right' },
    { name: 'Rate', x: margin + 352, width: 43, align: 'right' },
    { name: 'GST %', x: margin + 397, width: 28, align: 'right' },
    { name: 'Taxable', x: margin + 427, width: 43, align: 'right' },
    { name: 'Total', x: margin + 472, width: 41, align: 'right' },
  ];

  // Helper to draw a right-aligned text string in pdf-lib
  const drawRightAlignedSkewedText = (pageObj, text, rightX, y, size, font, color) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    pageObj.drawText(text, {
      x: rightX - textWidth,
      y: y,
      size: size,
      font: font,
      color: color,
    });
  };

  // Helper to draw the table header cleanly
  const drawTableHeader = (pageObj, targetY) => {
    pageObj.drawRectangle({
      x: margin,
      y: targetY - 18,
      width: contentWidth,
      height: 18,
      color: tableHeaderBg,
    });

    cols.forEach((col) => {
      let xPos = col.x;
      if (col.align === 'right') {
        const textWidth = helveticaBold.widthOfTextAtSize(col.name, 8);
        xPos = col.x + col.width - textWidth;
      }
      pageObj.drawText(col.name, {
        x: xPos,
        y: targetY - 12,
        size: 8,
        font: helveticaBold,
        color: primaryColor,
      });
    });
  };

  // Draw Page 1 Table Header
  drawTableHeader(page, tableY);

  // Helper to create subsequent pages with continuing table headers
  const createNewPage = () => {
    const newPage = pdfDoc.addPage([595.27, 841.89]);

    // Draw table header on the new page (No TAX INVOICE continuation header as requested)
    const newTableY = height - 40;
    drawTableHeader(newPage, newTableY);

    return { newPage, startY: newTableY - 18 };
  };

  // 4. Draw Items Rows with Pagination
  let currentPage = page;
  let currentY = tableY - 18;
  const rowHeight = 22;

  items.forEach((item, index) => {
    // If next row exceeds page limit, break page
    if (currentY - rowHeight < 60) {
      currentPage.drawLine({
        start: { x: margin, y: currentY },
        end: { x: width - margin, y: currentY },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });

      const result = createNewPage();
      currentPage = result.newPage;
      currentY = result.startY;
    }

    currentY -= rowHeight;

    // Alt row background
    if (index % 2 === 1) {
      currentPage.drawRectangle({
        x: margin,
        y: currentY,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.99),
      });
    }

    // Draw row grid lines (bottom line)
    currentPage.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    const nameText = item.item_name || item.package_name || 'N/A';
    const descText = item.description || 'N/A';

    const nameLine = helvetica.widthOfTextAtSize(nameText, 8) > 160
      ? nameText.substring(0, 32) + '...'
      : nameText;
    const descLine = helvetica.widthOfTextAtSize(descText, 7) > 110
      ? descText.substring(0, 24) + '...'
      : descText;

    const qty = parseFloat(item.quantity || 0).toFixed(2);
    const rate = parseFloat(item.rate || item.rate_per_unit || 0).toFixed(2);
    const gstPercent = `${parseInt(item.gst_percent || item.gst_rate || 0)}%`;
    const taxable = parseFloat(item.taxable_value || item.value || 0).toFixed(2);
    const totalVal = parseFloat(item.total_value || (item.taxable_value + item.gst_amount) || 0).toFixed(2);

    // Draw Texts
    currentPage.drawText((index + 1).toString(), { x: cols[0].x, y: currentY + 7, size: 8, font: helvetica, color: textColor });
    currentPage.drawText(nameLine, { x: cols[1].x, y: currentY + 7, size: 8, font: helveticaBold, color: textColor });
    currentPage.drawText(descLine, { x: cols[2].x, y: currentY + 7, size: 7, font: helvetica, color: secondaryColor });

    const drawColText = (col, val, isBold = false) => {
      const fontSize = 8;
      const fontObj = isBold ? helveticaBold : helvetica;
      let xPos = col.x;
      if (col.align === 'right') {
        const textWidth = fontObj.widthOfTextAtSize(val, fontSize);
        xPos = col.x + col.width - textWidth;
      }
      currentPage.drawText(val, {
        x: xPos,
        y: currentY + 7,
        size: fontSize,
        font: fontObj,
        color: textColor,
      });
    };

    drawColText(cols[3], qty);
    drawColText(cols[4], rate);
    drawColText(cols[5], gstPercent);
    drawColText(cols[6], taxable);
    drawColText(cols[7], totalVal, true);
  });

  // 5. Total Calculations & Summary Box
  // If totals and signature cannot fit on the current page, add a new page
  if (currentY < 210) {
    currentPage.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    const result = createNewPage();
    currentPage = result.newPage;
    currentY = result.startY;
  }

  currentY -= 15;

  // Notes/Remarks (Left)
  currentPage.drawText('Notes:', { x: margin, y: currentY, size: 9, font: helveticaBold, color: primaryColor });
  const notesLines = wrapText(invoice.notes || 'Thank you for your business. Please remit payments according to the payment terms.', 240, helvetica, 8);
  notesLines.forEach((line, idx) => {
    currentPage.drawText(line, { x: margin, y: currentY - 12 - (idx * 11), size: 8, font: helvetica, color: secondaryColor });
  });

  // Totals calculations (Right aligned)
  const totalsX = 350;
  const rightAlignX = width - margin; // 555.27
  const formatAmt = (val) => parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  currentPage.drawText('Subtotal (Taxable):', { x: totalsX, y: currentY, size: 9, font: helvetica, color: secondaryColor });
  drawRightAlignedSkewedText(currentPage, formatAmt(invoice.subtotal || invoice.total_value), rightAlignX, currentY, 9, helvetica, textColor);

  currentPage.drawText('GST Total:', { x: totalsX, y: currentY - 15, size: 9, font: helvetica, color: secondaryColor });
  drawRightAlignedSkewedText(currentPage, formatAmt(invoice.gst_total), rightAlignX, currentY - 15, 9, helvetica, textColor);

  currentPage.drawLine({
    start: { x: totalsX, y: currentY - 24 },
    end: { x: rightAlignX, y: currentY - 24 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  currentPage.drawText('Grand Total:', { x: totalsX, y: currentY - 38, size: 10, font: helveticaBold, color: primaryColor });
  drawRightAlignedSkewedText(currentPage, `INR ${formatAmt(invoice.grand_total)}`, rightAlignX, currentY - 38, 11, helveticaBold, primaryColor);

  // Divider before signature section
  currentPage.drawLine({
    start: { x: margin, y: 150 },
    end: { x: width - margin, y: 150 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  // 6. Signature Section (Bottom)
  const sigX = margin;
  const sigY = 60;
  const sigW = 220;
  const sigH = 70;

  // Left: Visual placeholder box for Cryptographic Digital Signature
  currentPage.drawRectangle({
    x: sigX,
    y: sigY,
    width: sigW,
    height: sigH,
    borderColor: greenSecured,
    borderWidth: 1,
    borderStyle: 'dashed',
    color: rgb(0.96, 0.98, 0.96), // very light green
  });

  const formatSigningDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr.includes('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const month = months[istDate.getUTCMonth()];
    const year = istDate.getUTCFullYear();
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  };
  const signedOnStr = formatSigningDate(invoice.created_at || new Date().toISOString());

  currentPage.drawText('DIGITALLY SIGNED & VERIFIED', {
    x: sigX + 10,
    y: sigY + sigH - 15,
    size: 8,
    font: helveticaBold,
    color: greenSecured,
  });

  currentPage.drawText('Signer:', {
    x: sigX + 10,
    y: sigY + sigH - 26,
    size: 6.5,
    font: helvetica,
    color: secondaryColor,
  });

  currentPage.drawText('Sudha Analyticals', {
    x: sigX + 10,
    y: sigY + sigH - 35,
    size: 7.5,
    font: helveticaBold,
    color: textColor,
  });

  currentPage.drawText('Any modification invalidates authenticity.', {
    x: sigX + 10,
    y: sigY + sigH - 46,
    size: 6.5,
    font: helvetica,
    color: rgb(0.7, 0.2, 0.2),
  });

  currentPage.drawText('Signed on:', {
    x: sigX + 10,
    y: sigY + sigH - 58,
    size: 6.5,
    font: helvetica,
    color: secondaryColor,
  });

  currentPage.drawText(signedOnStr, {
    x: sigX + 50,
    y: sigY + sigH - 58,
    size: 7,
    font: helveticaBold,
    color: textColor,
  });



  // Right: Centered Authorized Signatory layout
  const authSigWidth = 150;
  const authSigX = width - margin - authSigWidth; // 405.27
  const authSigY = sigY;
  const authSigCenter = authSigX + authSigWidth / 2; // 480.27

  const authSigTitle = 'AUTHORIZED SIGNATORY';
  const authSigTitleWidth = helveticaBold.widthOfTextAtSize(authSigTitle, 9);
  const authSigTitleX = authSigCenter - authSigTitleWidth / 2;

  currentPage.drawText(authSigTitle, {
    x: authSigTitleX,
    y: authSigY + 55,
    size: 9,
    font: helveticaBold,
    color: primaryColor,
  });

  // Check if base64 hand signature image data is present
  if (invoice.signature_data && invoice.signature_data.includes('base64,')) {
    try {
      const base64Data = invoice.signature_data.split('base64,')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const signatureImg = await pdfDoc.embedPng(imageBuffer);

      const sigImgWidth = 120;
      const sigImgHeight = 35;
      const sigImgX = authSigCenter - sigImgWidth / 2;

      currentPage.drawImage(signatureImg, {
        x: sigImgX,
        y: authSigY + 12,
        width: sigImgWidth,
        height: sigImgHeight,
      });
    } catch (e) {
      console.error('[PDFGen] Failed to embed hand signature image in PDF:', e.message);
      currentPage.drawLine({ start: { x: authSigX, y: authSigY + 15 }, end: { x: authSigX + 150, y: authSigY + 15 }, thickness: 0.5, color: textColor });
    }
  } else {
    currentPage.drawLine({ start: { x: authSigX, y: authSigY + 15 }, end: { x: authSigX + 150, y: authSigY + 15 }, thickness: 0.5, color: textColor });
  }

  const deptTitle = 'Accounts Department';
  const deptTitleWidth = helvetica.widthOfTextAtSize(deptTitle, 8);
  const deptTitleX = authSigCenter - deptTitleWidth / 2;

  currentPage.drawText(deptTitle, {
    x: deptTitleX,
    y: authSigY,
    size: 8,
    font: helvetica,
    color: secondaryColor,
  });

  // Embed QR Code for secure verification
  const qrUrl = `http://localhost:5173/verify?invoice_id=${invoice.id}&token=${invoice.internal_document_uuid || ''}`;
  try {
    const qrBuffer = await QRCode.toBuffer(qrUrl, { margin: 1, width: 80 });
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    currentPage.drawImage(qrImage, {
      x: sigX + sigW + 15,
      y: sigY - 5,
      width: 80,
      height: 80,
    });
  } catch (qrErr) {
    console.error('[PDFGen] Failed to generate/embed QR code:', qrErr.message);
  }

  // Set the metadata subject watermark for integrity tracking
  const watermarkPayload = {
    invoice_id: invoice.id,
    uuid: invoice.internal_document_uuid || '',
    timestamp: new Date().toISOString(),
    hash: invoice.signature_hash || ''
  };
  pdfDoc.setSubject(`O2C_METADATA:${JSON.stringify(watermarkPayload)}`);

  // Write footers on all pages
  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`Page ${idx + 1} of ${pages.length}`, {
      x: width - margin - 60,
      y: 25,
      size: 8,
      font: helvetica,
      color: secondaryColor,
    });
  });

  return pdfDoc;
}

module.exports = {
  generateInvoicePDFBuffer,
};
