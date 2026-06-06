const fs = require('fs');
const path = require('path');

function generateEmailSummaryHtml(items) {
  // Group Supply items
  const supplyGrouped = {};
  let hasSupply = false;
  let supplyTaxableTotal = 0;
  let supplyGstTotal = 0;
  let supplyInvoiceTotal = 0;

  // Group Service items
  const serviceGrouped = {};
  let hasService = false;
  let serviceTaxableTotal = 0;
  let serviceGstTotal = 0;
  let serviceInvoiceTotal = 0;

  (items || []).forEach(it => {
    const pkg = (it.package_name || '').trim() || 'General';
    
    const taxableSupply = parseFloat(it.taxable_supply) || 0;
    const gstSupply = parseFloat(it.gst_supply) || 0;
    const totalSupply = parseFloat(it.total_supply) || 0;

    const taxableService = parseFloat(it.taxable_service) || 0;
    const gstService = parseFloat(it.gst_service) || 0;
    const totalService = parseFloat(it.total_service) || 0;

    if (totalSupply > 0 || taxableSupply > 0) {
      if (!supplyGrouped[pkg]) {
        supplyGrouped[pkg] = { package_name: pkg, taxable: 0, gst: 0, invoice: 0 };
      }
      supplyGrouped[pkg].taxable += taxableSupply;
      supplyGrouped[pkg].gst += gstSupply;
      supplyGrouped[pkg].invoice += totalSupply;
      
      supplyTaxableTotal += taxableSupply;
      supplyGstTotal += gstSupply;
      supplyInvoiceTotal += totalSupply;
      hasSupply = true;
    }

    if (totalService > 0 || taxableService > 0) {
      if (!serviceGrouped[pkg]) {
        serviceGrouped[pkg] = { package_name: pkg, taxable: 0, gst: 0, invoice: 0 };
      }
      serviceGrouped[pkg].taxable += taxableService;
      serviceGrouped[pkg].gst += gstService;
      serviceGrouped[pkg].invoice += totalService;

      serviceTaxableTotal += taxableService;
      serviceGstTotal += gstService;
      serviceInvoiceTotal += totalService;
      hasService = true;
    }
  });

  const formatCurrency = (val) => {
    return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  let html = '<div style="margin: 20px 0;">';

  // Render Supply Summary Table
  if (hasSupply) {
    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; font-weight: 700; color: #0F766E; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
          🚚 Supply Summary
        </h4>
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                <th style="padding: 8px 12px; text-align: left; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em;">Package Name</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">Taxable Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">GST Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 28%;">Grand Total Invoice Value</th>
              </tr>
            </thead>
            <tbody>
    `;

    Object.values(supplyGrouped).forEach(row => {
      html += `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; text-align: left; font-weight: 600; color: #1E293B;">${row.package_name}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.taxable)}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.gst)}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #0F766E;">${formatCurrency(row.invoice)}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
            <tfoot>
              <tr style="background-color: #F0FDFA; font-weight: 700; color: #0F766E; border-top: 2px solid #0F766E;">
                <td style="padding: 8px 12px; text-align: left;">Supply Total</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(supplyTaxableTotal)}</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(supplyGstTotal)}</td>
                <td style="padding: 8px 12px; text-align: right; font-size: 13px;">${formatCurrency(supplyInvoiceTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  // Render Service Summary Table
  if (hasService) {
    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; font-weight: 700; color: #1E3A8A; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
          ⚙️ Service Summary
        </h4>
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                <th style="padding: 8px 12px; text-align: left; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em;">Package Name</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">Taxable Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 22%;">GST Value</th>
                <th style="padding: 8px 12px; text-align: right; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; width: 28%;">Grand Total Invoice Value</th>
              </tr>
            </thead>
            <tbody>
    `;

    Object.values(serviceGrouped).forEach(row => {
      html += `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; text-align: left; font-weight: 600; color: #1E293B;">${row.package_name}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.taxable)}</td>
          <td style="padding: 8px 12px; text-align: right; color: #334155;">${formatCurrency(row.gst)}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #1E3A8A;">${formatCurrency(row.invoice)}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
            <tfoot>
              <tr style="background-color: #EFF6FF; font-weight: 700; color: #1E3A8A; border-top: 2px solid #1E3A8A;">
                <td style="padding: 8px 12px; text-align: left;">Service Total</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(serviceTaxableTotal)}</td>
                <td style="padding: 8px 12px; text-align: right;">${formatCurrency(serviceGstTotal)}</td>
                <td style="padding: 8px 12px; text-align: right; font-size: 13px;">${formatCurrency(serviceInvoiceTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

const mockItems = [
  {
    package_name: 'Hardware',
    taxable_supply: 325000.00,
    gst_supply: 58500.00,
    total_supply: 383500.00,
    taxable_service: 0,
    gst_service: 0,
    total_service: 0
  },
  {
    package_name: 'Office Supplies',
    taxable_supply: 24000.00,
    gst_supply: 4320.00,
    total_supply: 28320.00,
    taxable_service: 0,
    gst_service: 0,
    total_service: 0
  },
  {
    package_name: 'Water Quality Testing Project',
    taxable_supply: 100000.00,
    gst_supply: 18000.00,
    total_supply: 118000.00,
    taxable_service: 0,
    gst_service: 0,
    total_service: 0
  },
  {
    package_name: 'IT Services',
    taxable_supply: 0,
    gst_supply: 0,
    total_supply: 0,
    taxable_service: 50000.00,
    gst_service: 9000.00,
    total_service: 59000.00
  },
  {
    package_name: 'Consulting',
    taxable_supply: 0,
    gst_supply: 0,
    total_supply: 0,
    taxable_service: 25000.00,
    gst_service: 4500.00,
    total_service: 29500.00
  },
  {
    package_name: 'Maintenance',
    taxable_supply: 0,
    gst_supply: 0,
    total_supply: 0,
    taxable_service: 30000.00,
    gst_service: 5400.00,
    total_service: 35400.00
  },
  {
    package_name: 'Water Quality Testing Project',
    taxable_supply: 0,
    gst_supply: 0,
    total_supply: 0,
    taxable_service: 200000.00,
    gst_service: 36000.00,
    total_service: 236000.00
  }
];

const summaryTablesHtml = generateEmailSummaryHtml(mockItems);

const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email Notification Preview</title>
</head>
<body style="background-color: #F1F5F9; padding: 40px; margin: 0;">
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #FFFFFF; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); padding: 20px; border-radius: 8px; text-align: center; color: #FFFFFF; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">New Purchase Order Created</h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Enterprise O2C Workflow Alert</p>
    </div>

    <!-- Main Greeting -->
    <p style="font-size: 14px; color: #334155; line-height: 1.5;">Dear <strong>Project SPOC</strong>,</p>
    <p style="font-size: 14px; color: #334155; line-height: 1.5;">A new <strong>Tender</strong> Sales Order has been successfully created in the Enterprise O2C Portal. Please review the details below:</p>

    <!-- Order Summary Card -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; color: #1E3A8A; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">📋 Order Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: #64748B; width: 40%;"><strong>SO Number:</strong></td>
          <td style="padding: 4px 0; color: #1E293B;"><strong>SO-2026-0004</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B;"><strong>Customer:</strong></td>
          <td style="padding: 4px 0; color: #1E293B;">Test Customer Private Limited</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B;"><strong>Order Type:</strong></td>
          <td style="padding: 4px 0; color: #1E293B;"><span style="background-color: #DBEAFE; color: #1E40AF; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Tender</span></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B;"><strong>Sales Order Date:</strong></td>
          <td style="padding: 4px 0; color: #1E293B;">2026-06-05</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B;"><strong>Internal Order ID:</strong></td>
          <td style="padding: 4px 0; color: #1E293B; font-family: monospace; font-size: 12px;">ORD-987162541</td>
        </tr>
      </table>
    </div>

    <!-- Financial Summary Card -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; color: #1E3A8A; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">💰 Financial Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: #64748B; width: 40%;"><strong>Subtotal:</strong></td>
          <td style="padding: 4px 0; color: #1E293B; text-align: right;">₹7,54,000.00</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B;"><strong>GST Total:</strong></td>
          <td style="padding: 4px 0; color: #1E293B; text-align: right;">₹1,35,720.00</td>
        </tr>
        <tr style="border-top: 1px dashed #CBD5E1; font-size: 15px;">
          <td style="padding: 8px 0 0 0; color: #1E293B;"><strong>Grand Total:</strong></td>
          <td style="padding: 8px 0 0 0; color: #10B981; text-align: right; font-weight: 700;">₹8,89,720.00</td>
        </tr>
      </table>
    </div>

    <!-- Line Items Summaries -->
    ${summaryTablesHtml}

    <!-- Footer Contact Info -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; font-size: 12px; color: #64748B; margin-top: 24px;">
      <p style="margin: 0 0 4px 0;"><strong>Project SPOC Contact Information:</strong></p>
      <p style="margin: 0;">Name: Surendra PM | Email: surendra@projects.com | Phone: 9876543210</p>
    </div>

    <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
    <p style="font-size: 11px; color: #94A3B8; text-align: center; margin: 0;">This is an automated operational alert generated by the Enterprise O2C Workflow Engine.</p>
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../O2C/public/test_email.html'), fullHtml);
console.log('✅ test_email.html written to O2C/public/test_email.html successfully!');
