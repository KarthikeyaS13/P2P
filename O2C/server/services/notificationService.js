const { sendEmail } = require('./emailService');

// 1. Database Table Initialization for Email Logs
function initEmailLogsTable(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        so_number TEXT,
        customer_name TEXT,
        performed_by TEXT,
        recipients TEXT NOT NULL,
        cc_recipients TEXT,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // console.log('✅ email_logs table initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize email_logs table:', error);
  }
}

// 2. Define standard event triggers in a scalable registry
const WORKFLOW_EVENTS = {
  SO_UPLOAD: {
    name: 'Sales Order (SO) Upload',
    roles: ['accounts', 'admin'],
    nextDept: 'Accounts Department (Review & Acceptance)',
    subject: '📄 New Sales Order Uploaded: SO #{soNumber} - {customerName}',
    linkPath: '/po-review/{soId}',
    statusText: 'Pending Accounts Acceptance'
  },
  SO_ACCEPTED: {
    name: 'Sales Order Accepted',
    roles: ['stores', 'projects', 'admin'],
    nextDept: 'Stores & Projects Departments (Dispatch / SCR Planning)',
    subject: '✅ Sales Order Accepted: SO #{soNumber} - {customerName}',
    linkPath: '/pos/{soId}',
    statusText: 'Approved & Active'
  },
  SO_EDITED: {
    name: 'Edit Sales Order',
    roles: ['accounts', 'admin'],
    nextDept: 'Accounts Department (Review & Approve Revised SO)',
    subject: '🔄 Sales Order Edited: SO #{soNumber} - {customerName}',
    linkPath: '/po-review/{soId}',
    statusText: 'Pending Review (Revised Version)'
  },
  SO_EDITED_APPROVED: {
    name: 'Approve Edited Sales Order',
    roles: ['stores', 'projects', 'admin'],
    nextDept: 'Stores & Projects Departments (Execution)',
    subject: '✅ Edited Sales Order Approved: SO #{soNumber} - {customerName}',
    linkPath: '/pos/{soId}',
    statusText: 'Approved & Active (Revised)'
  },
  DC_SCR_RAISED: {
    name: 'Raise DC / Raise SCR',
    roles: ['accounts', 'sales', 'admin'],
    nextDept: 'Accounts Department (Invoicing & Financial Audits)',
    subject: '🚚 Material Dispatch / SCR Raised: SO #{soNumber} - {customerName}',
    linkPath: '/raise-dc/{soId}',
    statusText: 'Material Dispatched / SCR Pending Verification'
  },
  DC_SCR_APPROVED: {
    name: 'Approve DC / SCR',
    roles: ['projects'],
    nextDept: 'Projects Team (Delivery Confirmation / Site Clearance Execution)',
    subject: '🎉 DC / SCR Approved: SO #{soNumber} - {customerName}',
    linkPath: '/projects',
    statusText: 'Approved for Dispatch / Site Clearance'
  },
  INVOICE_REQUESTED: {
    name: 'Raise Invoice Request',
    roles: ['accounts'],
    nextDept: 'Accounts Department (Billing & Invoice Generation)',
    subject: '💰 Invoice Request Raised: SO #{soNumber} - {customerName}',
    linkPath: '/invoice-approval/{soId}',
    statusText: 'Invoice Pending Generation'
  },
  INVOICE_APPROVED: {
    name: 'Approve Invoice Request',
    roles: ['sales', 'admin'],
    nextDept: 'Sales Department (Client Delivery & Accounts Receivable Tracking)',
    subject: '💵 Invoice Request Approved: SO #{soNumber} - {customerName}',
    linkPath: '/ar-database',
    statusText: 'Invoice Generated / Awaiting Collection'
  },
  INVOICE_REQUEST_RAISED: {
    name: 'Raise Invoice Request',
    roles: ['accounts'],
    nextDept: 'Accounts Department (Billing & Invoice Generation)',
    subject: '💰 Invoice Request Raised: SO #{soNumber} - {customerName}',
    linkPath: '/invoice-approval/{soId}',
    statusText: 'Invoice Pending Generation'
  },
  INVOICE_REQUEST_APPROVED: {
    name: 'Approve Invoice Request',
    roles: ['sales', 'admin'],
    nextDept: 'Sales Department (Client Delivery & Accounts Receivable Tracking)',
    subject: '💵 Invoice Request Approved: SO #{soNumber} - {customerName}',
    linkPath: '/ar-database',
    statusText: 'Invoice Generated / Awaiting Collection'
  }
};

/**
 * Fetch all active user emails matching given roles from the database
 * @param {object} db - better-sqlite3 connection
 * @param {string[]} roles - Array of role names
 * @returns {string[]} email addresses
 */
function getEmailsForRoles(db, roles) {
  if (!roles || roles.length === 0) return [];
  
  const placeholders = roles.map(() => '?').join(',');
  const query = `
    SELECT DISTINCT u.email 
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE LOWER(r.name) IN (${placeholders}) 
      AND u.is_active = 1 
      AND u.email IS NOT NULL 
      AND u.email != ''
  `;
  
  try {
    const rows = db.prepare(query).all(...roles.map(r => r.toLowerCase()));
    return rows.map(row => row.email);
  } catch (err) {
    console.error('❌ Error fetching recipient emails for roles:', roles, err);
    return [];
  }
}

/**
 * Generate a premium, clean card-based HTML email body.
 */
function generateEmailBody({
  actionPerformed,
  soNumber,
  customerName,
  performedBy,
  dateTime,
  currentStatus,
  nextDept,
  actionLink,
  extraDetails = {}
}) {
  // Format extra details dynamically as small table rows
  let extraRowsHtml = '';
  if (Object.keys(extraDetails).length > 0) {
    extraRowsHtml = `
      <div style="margin-top: 15px; border-top: 1px dashed #E2E8F0; padding-top: 10px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1E3A8A; text-transform: uppercase;">ℹ️ Additional Details</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          ${Object.entries(extraDetails).map(([key, val]) => `
            <tr>
              <td style="padding: 4px 0; color: #64748B; width: 40%;"><strong>${key}:</strong></td>
              <td style="padding: 4px 0; color: #1E293B;">${val || 'N/A'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${actionPerformed}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 650px; margin: 30px auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); padding: 24px; text-align: center; color: #FFFFFF;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Workflow Action Notification</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.90; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Order-to-Cash Portal</p>
        </div>

        <!-- Content Body -->
        <div style="padding: 30px 24px;">
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">
            Hello Team,
          </p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            A key step in the workflow has been completed. Please find the transaction and assignment details below:
          </p>

          <!-- Main Info Card -->
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin: 24px 0;">
            <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; color: #1E3A8A; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">📋 Transaction Summary</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #64748B; width: 40%;"><strong>Action Performed:</strong></td>
                <td style="padding: 6px 0; color: #1E293B; font-weight: 600;">${actionPerformed}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;"><strong>Sales Order (SO) #:</strong></td>
                <td style="padding: 6px 0; color: #1E293B; font-weight: bold; font-family: monospace; font-size: 14px;">${soNumber}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;"><strong>Customer Name:</strong></td>
                <td style="padding: 6px 0; color: #1E293B;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;"><strong>Performed By:</strong></td>
                <td style="padding: 6px 0; color: #1E293B;">${performedBy}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;"><strong>Date & Time:</strong></td>
                <td style="padding: 6px 0; color: #1E293B;">${dateTime}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;"><strong>Current Status:</strong></td>
                <td style="padding: 6px 0; color: #1E293B;"><span style="background-color: #DBEAFE; color: #1E40AF; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${currentStatus}</span></td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;"><strong>Next Action Dept:</strong></td>
                <td style="padding: 6px 0; color: #059669; font-weight: 600;">${nextDept}</td>
              </tr>
            </table>

            ${extraRowsHtml}
          </div>

          <!-- Action CTA -->
          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${actionLink}" target="_blank" style="background-color: #1E3A8A; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block; box-shadow: 0 4px 6px rgba(30, 58, 138, 0.15); transition: background-color 0.2s;">
              View in O2C Portal
            </a>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px; text-align: center; font-size: 12px; color: #64748B;">
          <p style="margin: 0 0 4px 0;">This is an automated workflow notification from the Sudha Analytics O2C System.</p>
          <p style="margin: 0;">Do not reply directly to this email.</p>
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Triggers a notification based on a workflow event.
 * @param {object} db - better-sqlite3 database connection
 * @param {string} eventKey - Key from WORKFLOW_EVENTS
 * @param {object} data - Data payload for formatting
 * @param {number|string} data.soId - Sales Order / Purchase Order primary key ID
 * @param {string} data.performedBy - User who performed the action
 * @param {object} [data.extraDetails] - Key-value pair of extra data to attach
 * @param {string[]} [data.customCc] - Optional custom CC emails
 */
async function triggerNotification(db, eventKey, data) {
  const eventConfig = WORKFLOW_EVENTS[eventKey];
  if (!eventConfig) {
    console.error(`❌ Event ${eventKey} not found in notification registry.`);
    return { success: false, error: 'Invalid event key' };
  }

  try {
    // 1. Fetch SO details
    const po = db.prepare(`
      SELECT p.po_number, c.name as customer_name, p.status 
      FROM purchase_orders p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.id = ?
    `).get(data.soId);

    if (!po) {
      console.error(`❌ Purchase Order not found for ID: ${data.soId}`);
      return { success: false, error: 'SO not found' };
    }

    const soNumber = po.po_number;
    const customerName = po.customer_name;
    const currentStatus = eventConfig.statusText || po.status;
    const performedBy = data.performedBy || 'System User';
    
    // Format Date/Time (IST representation)
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const dateTime = new Date().toLocaleString('en-IN', options) + ' IST';

    // 2. Fetch Recipient Emails from dynamic User Management records
    const recipientEmails = getEmailsForRoles(db, eventConfig.roles);
    if (recipientEmails.length === 0) {
      console.warn(`⚠️ No active users found with roles ${JSON.stringify(eventConfig.roles)} to receive notification for ${eventKey}.`);
    }

    // 3. Setup redirect URL link
    const portalBaseUrl = process.env.PORTAL_BASE_URL || 'http://localhost:5173';
    const relativePath = eventConfig.linkPath
      .replace('{soId}', data.soId)
      .replace('{soNumber}', soNumber);
    const actionLink = `${portalBaseUrl}${relativePath}`;

    // 4. Interpolate templates
    const subject = eventConfig.subject
      .replace('{soNumber}', soNumber)
      .replace('{customerName}', customerName);

    const bodyHtml = generateEmailBody({
      actionPerformed: eventConfig.name,
      soNumber,
      customerName,
      performedBy,
      dateTime,
      currentStatus,
      nextDept: eventConfig.nextDept,
      actionLink,
      extraDetails: data.extraDetails || {}
    });

    // Handle Recipients mapping
    const to = recipientEmails.join(', ');
    const cc = data.customCc && data.customCc.length > 0 ? data.customCc.join(', ') : '';

    console.log(`✉️ Sending workflow email for ${eventKey} to: ${to} (CC: ${cc})`);

    // 5. Send email via emailService
    let emailResult;
    if (to) {
      emailResult = await sendEmail({
        to,
        subject,
        html: bodyHtml
      });
    } else {
      emailResult = { success: true, mock: true, message: 'No recipients configured' };
    }

    // 6. Log email to database
    db.prepare(`
      INSERT INTO email_logs (
        event_type, so_number, customer_name, performed_by,
        recipients, cc_recipients, subject, body_html,
        status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventKey,
      soNumber,
      customerName,
      performedBy,
      to || 'No Recipients',
      cc || null,
      subject,
      bodyHtml,
      emailResult.success ? 'sent' : 'failed',
      emailResult.success ? null : String(emailResult.error?.message || emailResult.error || 'Unknown error')
    );

    return { success: emailResult.success, logged: true };
  } catch (err) {
    console.error(`❌ Failed to trigger email notification for ${eventKey}:`, err);
    // Write a local fallback log in db if possible
    try {
      db.prepare(`
        INSERT INTO email_logs (
          event_type, performed_by, recipients, subject, body_html, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventKey,
        data.performedBy || 'System',
        'Error Log',
        'Notification Failure Alert',
        'Failure in triggerNotification',
        'failed',
        err.message
      );
    } catch (dbErr) {
      console.error('❌ Could not log email failure to db:', dbErr);
    }
    return { success: false, error: err.message };
  }
}

module.exports = {
  WORKFLOW_EVENTS,
  initEmailLogsTable,
  triggerNotification,
  getEmailsForRoles
};
