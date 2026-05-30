const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('\n====== [STARTING E2E EMAIL WORKFLOW VERIFICATION] ======\n');

  let salesToken = '';
  let storesToken = '';
  let accountsToken = '';

  // 1. Log in as Sales to obtain auth token
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/login`, {
      username: 'sales',
      password: 'qwe123'
    });
    salesToken = loginRes.data.token;
    console.log('✅ Sales login successful!');
  } catch (err) {
    console.error('❌ Sales login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 2. Log in as Stores to obtain auth token
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/login`, {
      username: 'stores',
      password: 'qwe123'
    });
    storesToken = loginRes.data.token;
    console.log('✅ Stores login successful!');
  } catch (err) {
    console.error('❌ Stores login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 3. Log in as Accounts to obtain auth token
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/login`, {
      username: 'accounts',
      password: 'qwe123'
    });
    accountsToken = loginRes.data.token;
    console.log('✅ Accounts login successful!');
  } catch (err) {
    console.error('❌ Accounts login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  let createdPoId = null;

  // 4. WORKFLOW 1: Create a Standard PO (Triggers New PO Creation Email Alert)
  console.log('\n--- [Testing Workflow 1: Create Standard PO] ---');
  try {
    const poPayload = {
      customer_id: 1,
      location_id: 1,
      po_number: 'PO-TEST-100',
      po_date: '2026-05-30',
      start_date: '2026-05-30',
      end_date: '2027-05-30',
      is_nt_po: false,
      is_temporary: false,
      subtotal: 20000,
      gst_total: 3600,
      grand_total: 23600,
      project_spoc_name: 'Projects Team',
      project_spoc_email: 'projects@o2c.local',
      project_spoc_phone: '9999988888',
      need_sales_invoice_approval: 'yes',
      remarks: 'E2E Standard PO verification',
      items: [
        {
          line_number: 1,
          reference_number: 'REF-001',
          package: 'Pkg 1',
          heading: 'H1',
          sub_heading: 'SH1',
          item_name: 'Standard Widget',
          item_description: 'Test Widget Description',
          uom: 'NOS',
          quantity: 20,
          rate_per_unit: 1000,
          value: 20000,
          gst_rate: 18,
          gst_amount: 3600,
          total_value: 23600
        }
      ]
    };

    const poRes = await axios.post(`${BASE_URL}/api/pos`, poPayload, {
      headers: { Authorization: `Bearer ${salesToken}` }
    });
    createdPoId = poRes.data.po_id;
    console.log(`✅ Standard PO Created Successfully! ID: ${createdPoId}`);
  } catch (err) {
    console.error('❌ Standard PO Creation failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 5. WORKFLOW 2: Create a Linked Non-Tender (NT) PO (Triggers NT PO Email Alert)
  console.log('\n--- [Testing Workflow 2: Create Non-Tender PO] ---');
  let ntPoId = null;
  try {
    const ntPoPayload = {
      customer_id: 1,
      location_id: 1,
      po_number: 'PO-TEST-100-NT-1',
      po_date: '2026-05-30',
      start_date: '2026-05-30',
      end_date: '2027-05-30',
      is_nt_po: true,
      is_temporary: true,
      linked_po_id: createdPoId,
      subtotal: 15000,
      gst_total: 2700,
      grand_total: 17700,
      project_spoc_name: 'Projects Team',
      project_spoc_email: 'projects@o2c.local',
      project_spoc_phone: '9999988888',
      need_sales_invoice_approval: 'yes',
      remarks: 'E2E Linked NT PO verification',
      items: [
        {
          line_number: 1,
          reference_number: 'REF-NT-001',
          package: 'Pkg 1',
          heading: 'H1',
          sub_heading: 'SH1',
          item_name: 'NT Widget',
          item_description: 'NT Widget Description',
          uom: 'NOS',
          quantity: 10,
          rate_per_unit: 1500,
          value: 15000,
          gst_rate: 18,
          gst_amount: 2700,
          total_value: 17700
        }
      ]
    };

    const ntRes = await axios.post(`${BASE_URL}/api/pos`, ntPoPayload, {
      headers: { Authorization: `Bearer ${salesToken}` }
    });
    ntPoId = ntRes.data.po_id;
    console.log(`✅ NT PO Created Successfully! ID: ${ntPoId}`);
  } catch (err) {
    console.error('❌ NT PO Creation failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 6. WORKFLOW 3: Edit standard PO (Triggers Edit PO/Revision Email Alert)
  console.log('\n--- [Testing Workflow 3: Edit Standard PO] ---');
  try {
    const editPayload = {
      project_spoc_name: 'Projects Team',
      project_spoc_email: 'projects@o2c.local',
      project_spoc_phone: '9999988888',
      need_sales_invoice_approval: 'yes',
      remarks: 'E2E Revision - Increment Quantity',
      items: [
        {
          id: 1, // first item ID
          line_number: 1,
          reference_number: 'REF-001',
          package: 'Pkg 1',
          heading: 'H1',
          sub_heading: 'SH1',
          item_name: 'Standard Widget',
          item_description: 'Test Widget Description Revised',
          uom: 'NOS',
          quantity: 25, // incremented qty
          rate_per_unit: 1000,
          value: 25000,
          gst_rate: 18,
          gst_amount: 4500,
          total_value: 29500
        }
      ]
    };

    const editRes = await axios.put(`${BASE_URL}/api/pos/${createdPoId}`, editPayload, {
      headers: { Authorization: `Bearer ${salesToken}` }
    });
    console.log(`✅ PO Revised Successfully! New PO Version ID: ${editRes.data.id}`);
  } catch (err) {
    console.error('❌ Edit Standard PO failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 7. Create a DC Request (Required precursor for Raising DC)
  console.log('\n--- [Creating DC Dispatch Request] ---');
  let dcrId = null;
  try {
    const dcrPayload = {
      po_id: createdPoId,
      location_id: 1,
      dispatch_date: '2026-05-30',
      transporter: 'VRL Logistics',
      special_instructions: 'Handle with care',
      vehicle_no: 'MH-12-AB-1234',
      driver_name: 'Ramesh',
      driver_phone: '9876543210',
      dispatch_from_line1: 'Plot No. 44, MIDC Industrial Area',
      dispatch_from_line2: 'Chakan, Pune',
      dispatch_from_pin: '410501',
      dispatch_from_landmark: 'Opposite Shell Fuel Station',
      requested_dc_number: '',
      is_manual_dc: false,
      logistics_remarks: 'Dispatched for E2E testing',
      items: [
        {
          line_item_id: 1, // PO line item ID
          qty: 5
        }
      ]
    };

    const dcrRes = await axios.post(`${BASE_URL}/api/dc-requests`, dcrPayload, {
      headers: { Authorization: `Bearer ${storesToken}` }
    });
    dcrId = dcrRes.data.id;
    console.log(`✅ DC Request Created successfully! ID: ${dcrId}`);
  } catch (err) {
    console.error('❌ DC Request Creation failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 8. WORKFLOW 4: Raise Delivery Challan (Triggers DC Dispatch Email Alert)
  console.log('\n--- [Testing Workflow 4: Raise Delivery Challan] ---');
  try {
    const raisePayload = {
      customDCNo: '',
      manualDC: '',
      dispatchFrom: {
        line1: 'Plot No. 44, MIDC Industrial Area',
        line2: 'Chakan, Pune',
        pin: '410501'
      },
      dispatchTo: null,
      itemHSNs: {
        '1': '8471-30' // standard HSN code
      },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6DAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gYDCB0Zz84gNwAAADJJREFUaEPt0LEJADAwzEDz/9MupmD/QhDcA1tSUpKUlJSkJCUpSUlKUpKSlKSkJCUpSfnHA44AA3X4jQAAAAAASUVORK5CYII=',
      email_to_project: 'projects@o2c.local'
    };

    const raiseRes = await axios.post(`${BASE_URL}/api/dc-requests/${dcrId}/raise`, raisePayload, {
      headers: { Authorization: `Bearer ${accountsToken}` }
    });
    console.log(`✅ Delivery Challan Raised successfully! DC Number: ${raiseRes.data.dc_number}`);
  } catch (err) {
    console.error('❌ Raising DC failed:', err.response?.data || err.message);
    process.exit(1);
  }

  console.log('\n====== [E2E EMAIL WORKFLOW VERIFICATION COMPLETED SUCCESSFULLY] ======\n');
}

runTests();
