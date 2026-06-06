import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getUser } from '../auth';

export default function NewInvoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const filterPO = queryParams.get('po');

  const [billingSource, setBillingSource] = useState('dc'); // 'dc' or 'scr'
  const [dcs, setDcs] = useState([]);
  const [allDcs, setAllDcs] = useState([]); // Store all billable DCs
  const [selectedDC, setSelectedDC] = useState('');
  const [dcDetails, setDcDetails] = useState(null);

  const [scrs, setScrs] = useState([]);
  const [selectedSCR, setSelectedSCR] = useState('');
  const [scrDetails, setScrDetails] = useState(null);

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Enterprise Fields
  const [placeOfSupply, setPlaceOfSupply] = useState('Hyderabad');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const user = getUser();
  const isAccounts = user?.role === 'accounts' || user?.role === 'admin';

  useEffect(() => {
    Promise.all([fetchDCs(), fetchSCRs()]).finally(() => setLoading(false));
  }, []);

  const fetchDCs = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/dc', { headers });
      // Only show DCs that are delivery_confirmed AND not fully invoiced
      const billable = res.data.filter(d =>
        (d.status === 'delivery_confirmed' || d.delivery_status === 'delivery_confirmed') &&
        d.invoicing_status !== 'fully_invoiced'
      );
      setAllDcs(billable);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchSCRs = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/scr', { headers });
      // Only show approved SCRs that are not fully invoiced
      const billable = res.data.filter(s =>
        s.status === 'approved' &&
        s.invoicing_status !== 'fully_invoiced'
      );
      setScrs(billable);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (filterPO) {
      const filtered = allDcs.filter(d => (d.po_no || d.po_number) === filterPO);
      setDcs(filtered);
    } else {
      setDcs(allDcs);
    }
  }, [allDcs, filterPO]);

  const handleSourceChange = (source) => {
    setBillingSource(source);
    setSelectedDC('');
    setDcDetails(null);
    setSelectedSCR('');
    setScrDetails(null);
    setBillingAddress('');
    setShippingAddress('');
  };

  const handleSelectDC = async (e) => {
    const id = e.target.value;
    setSelectedDC(id);
    if (!id) {
      setDcDetails(null);
      return;
    }

    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/dc/${id}`, { headers });
      const data = res.data;

      // Auto-populate addresses
      setBillingAddress(`${data.customer_legal_name || data.customer_name}\n${data.customer_addr1}\n${data.customer_addr2 || ''}\n${data.customer_city} - ${data.customer_pin}\nGSTIN: ${data.customer_gstin}`);
      setShippingAddress(`${data.location_name}\n${data.loc_addr1}\n${data.loc_addr2 || ''}\n${data.loc_city} - ${data.loc_pin}`);

      // We need PO details to get rates and GST. Let's fetch the PO.
      const poRes = await axios.get(`/api/pos/${data.po_id}`, { headers });
      const poData = poRes.data;

      // Map Delivery Challan items to include financial details from PO line items
      const enrichedItems = (data.items || []).map(di => {
        const pi = poData.items.find(p => p.id === di.po_line_item_id) || {};
        const rate = pi.supply_rate || 0;
        const gstPct = pi.supply_gst_rate || 18;

        const delivered = parseFloat(di.received_qty ?? di.quantity_dispatched) || 0;
        const alreadyInvoiced = parseFloat(di.invoiced_qty) || 0;
        const remaining = Math.max(0, delivered - alreadyInvoiced);

        // Default to invoicing full remaining qty
        const taxable = remaining * rate;
        const gst = taxable * (gstPct / 100);
        const total = taxable + gst;

        return {
          ...di,
          dc_line_item_id: di.id,
          package_name: pi.package_name || di.package_name || '-',
          item_name: pi.item_name || di.item_name || 'Item',
          description: pi.item_description || di.description || '',
          quantity: remaining, // Qty being invoiced NOW
          delivered_qty: delivered,
          already_invoiced_qty: alreadyInvoiced,
          remaining_qty: remaining,
          rate_per_unit: rate,
          gst_percent: gstPct,
          taxable_value: taxable,
          gst_amount: gst,
          total_value: total
        };
      });

      setDcDetails({ ...data, enrichedItems });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSelectSCR = async (e) => {
    const id = e.target.value;
    setSelectedSCR(id);
    if (!id) {
      setScrDetails(null);
      return;
    }

    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/scr/${id}`, { headers });
      const data = res.data;

      // Auto-populate addresses
      setBillingAddress(`${data.customer_legal_name || data.customer_name}\n${data.customer_addr1}\n${data.customer_addr2 || ''}\n${data.customer_city} - ${data.customer_pin}\nGSTIN: ${data.customer_gstin}`);
      setShippingAddress(`${data.location_label || data.location_name}\n${data.location_address || data.loc_addr1}\n${data.location_city || data.loc_city} - ${data.location_state || data.loc_state}`);

      // We need PO details to get rates and GST. Let's fetch the PO.
      const poRes = await axios.get(`/api/pos/${data.po_id}`, { headers });
      const poData = poRes.data;

      // Map SCR items to include financial details from PO line items
      const enrichedItems = (data.items || []).map(si => {
        const pi = poData.items.find(p => p.id === si.po_line_item_id) || {};
        const rate = pi.service_rate || 0;
        const gstPct = pi.service_gst_rate || 18;

        const targetQty = parseFloat(si.invoice_qty) || 0;
        const alreadyInvoiced = parseFloat(si.invoiced_qty) || 0;
        const remaining = Math.max(0, targetQty - alreadyInvoiced);

        // Default to invoicing full remaining qty
        const taxable = remaining * rate;
        const gst = taxable * (gstPct / 100);
        const total = taxable + gst;

        return {
          ...si,
          scr_line_item_id: si.id,
          po_line_item_id: si.po_line_item_id,
          package_name: pi.package_name || si.package_name || '-',
          item_name: pi.item_name || si.item_name || 'Item',
          description: pi.item_description || si.description || '',
          quantity: remaining, // Qty being invoiced NOW
          delivered_qty: targetQty,
          already_invoiced_qty: alreadyInvoiced,
          remaining_qty: remaining,
          rate_per_unit: rate,
          gst_percent: gstPct,
          taxable_value: taxable,
          gst_amount: gst,
          total_value: total
        };
      });

      setScrDetails({ ...data, enrichedItems });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQtyChange = (idx, value) => {
    const qty = parseFloat(value) || 0;
    const details = billingSource === 'dc' ? dcDetails : scrDetails;
    const items = [...details.enrichedItems];
    const item = items[idx];

    // Validate against remaining qty
    const finalQty = Math.min(qty, item.remaining_qty);

    const taxable = finalQty * item.rate_per_unit;
    const gst = taxable * (item.gst_percent / 100);
    const total = taxable + gst;

    items[idx] = {
      ...item,
      quantity: finalQty,
      taxable_value: taxable,
      gst_amount: gst,
      total_value: total
    };

    if (billingSource === 'dc') {
      setDcDetails({ ...dcDetails, enrichedItems: items });
    } else {
      setScrDetails({ ...scrDetails, enrichedItems: items });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (billingSource === 'dc' && (!selectedDC || !dcDetails)) {
      Swal.fire({ icon: 'warning', title: 'Selection Required', text: 'Please select a DC' });
      return;
    }
    if (billingSource === 'scr' && (!selectedSCR || !scrDetails)) {
      Swal.fire({ icon: 'warning', title: 'Selection Required', text: 'Please select an SCR' });
      return;
    }

    setSubmitting(true);
    try {
      const details = billingSource === 'dc' ? dcDetails : scrDetails;
      const payload = {
        po_id: details.po_id,
        dc_id: billingSource === 'dc' ? details.id : null,
        scr_id: billingSource === 'scr' ? details.id : null,
        customer_id: details.customer_id,
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes,
        place_of_supply: placeOfSupply,
        payment_terms: 'Net 30 Days',
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        subtotal: details.enrichedItems.reduce((acc, it) => acc + it.taxable_value, 0),
        gst_total: details.enrichedItems.reduce((acc, it) => acc + it.gst_amount, 0),
        grand_total: details.enrichedItems.reduce((acc, it) => acc + it.total_value, 0),
        items: details.enrichedItems
      };

      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post('/api/invoices', payload, { headers });

      const result = res.data;

      Swal.fire({ icon: 'success', title: 'Invoice Request Created', text: `Invoice Request ${result.invoice_number} created successfully!`, timer: 2000, showConfirmButton: false });
      const targetPath = isAccounts ? `/invoice-approval/${result.id}` : `/invoice-request/${result.id}`;
      navigate(targetPath);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const showFullDescription = (desc, name) => {
    Swal.fire({
      title: name,
      text: desc,
      icon: 'info',
      confirmButtonColor: 'var(--primary)',
      customClass: {
        container: 'swal-wide'
      }
    });
  };

  if (loading) return <div className="screen-enter"><p>Loading...</p></div>;

  const currentDetails = billingSource === 'dc' ? dcDetails : scrDetails;
  const subtotal = currentDetails?.enrichedItems?.reduce((acc, it) => acc + (it.taxable_value || 0), 0) || 0;
  const gstTotal = currentDetails?.enrichedItems?.reduce((acc, it) => acc + (it.gst_amount || 0), 0) || 0;
  const grandTotal = subtotal + gstTotal;

  return (
    <div className="screen-enter">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-ghost btn-back"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title">
              {isAccounts ? 'Issue Official Invoice' : 'Invoice Request'}
            </h1>
            <p className="page-header__subtitle">
              {filterPO ? `Filtering for PO: ${filterPO}` : (isAccounts
                ? 'Finalize billing and generate official tax document'
                : 'Raise a billing request for Accounts department approval')}
            </p>
          </div>
        </div>
      </div>

      {error && <div style={{ color: 'var(--error)', marginBottom: '16px' }}>{error}</div>}

      <div className="card card--padded animate-fade" style={{ padding: '16px 20px' }}>
        <style>{`
          .new-invoice-compact-form .form-group {
            margin-bottom: 12px !important;
          }
          .new-invoice-compact-form .form-label {
            font-size: 10px !important;
            margin-bottom: 4px !important;
            font-weight: 700 !important;
            color: #475569 !important;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .new-invoice-compact-form .grid-2 .form-input,
          .new-invoice-compact-form .grid-2 .form-select,
          .new-invoice-compact-form .grid-2 .react-datepicker__input-container input {
            padding: 6px 12px !important;
            height: 32px !important;
            font-size: 12px !important;
            border-radius: 4px !important;
          }
          .new-invoice-compact-form .grid-2 textarea.form-input {
            height: auto !important;
            padding: 8px 12px !important;
          }
          .new-invoice-compact-form .grid-2 .date-picker-container .calendar-icon {
            font-size: 16px !important;
          }
        `}</style>
        <form onSubmit={handleSubmit} className="new-invoice-compact-form">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Billing Source Type</label>
              <div style={{ display: 'flex', gap: '16px', height: '32px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="billingSource"
                    value="dc"
                    checked={billingSource === 'dc'}
                    onChange={() => handleSourceChange('dc')}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  Supply (Delivery Challan)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="billingSource"
                    value="scr"
                    checked={billingSource === 'scr'}
                    onChange={() => handleSourceChange('scr')}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  Service (Site Clearance)
                </label>
              </div>
            </div>
            <div className="form-group">
              {billingSource === 'dc' ? (
                <>
                  <label className="form-label">Select Delivery Challan</label>
                  <select className="form-select" value={selectedDC} onChange={handleSelectDC} required>
                    <option value="">-- Choose DC --</option>
                    {dcs.map(d => (
                      <option key={d.id} value={d.id}>{d.dc_number} - {d.customer_name} (PO: {d.po_no || d.po_number})</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="form-label">Select Site Clearance Request (SCR)</label>
                  <select className="form-select" value={selectedSCR} onChange={handleSelectSCR} required>
                    <option value="">-- Choose SCR --</option>
                    {scrs.map(s => (
                      <option key={s.id} value={s.id}>{s.scr_number} - {s.customer_name} (PO: {s.po_no})</option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Place of Supply</label>
              <input className="form-input" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice Date</label>
              <div className="date-picker-container">
                <DatePicker
                  selected={invoiceDate ? new Date(invoiceDate) : null}
                  onChange={(date) => setInvoiceDate(date ? date.toISOString().split('T')[0] : '')}
                  dateFormat="dd/MM/yyyy"
                  className="form-input"
                  placeholderText="DD/MM/YYYY"
                  required
                />
                <span className="material-symbols-outlined calendar-icon">calendar_today</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <div className="date-picker-container">
                <DatePicker
                  selected={dueDate ? new Date(dueDate) : null}
                  onChange={(date) => setDueDate(date ? date.toISOString().split('T')[0] : '')}
                  dateFormat="dd/MM/yyyy"
                  className="form-input"
                  placeholderText="DD/MM/YYYY"
                  required
                />
                <span className="material-symbols-outlined calendar-icon">calendar_today</span>
              </div>
            </div>
          </div>

          {currentDetails && (
            <>
              <div className="grid-2" style={{ marginTop: '24px' }}>
                <div className="form-group">
                  <label className="form-label">Billing Address (Tax Address)</label>
                  <textarea className="form-input" rows="4" value={billingAddress} onChange={e => setBillingAddress(e.target.value)} required></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Shipping Address (Site Location)</label>
                  <textarea className="form-input" rows="4" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} required></textarea>
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h3 className="text-h3" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>inventory_2</span>
                  {billingSource === 'dc' ? 'Billable Items (Based on Site-Received Qty)' : 'Billable Items (Based on Site Clearance Qty)'}
                </h3>
                <style>{`
                  .new-invoice-table.data-table th {
                    padding: 10px 14px !important;
                    height: 44px !important;
                    font-size: 12px !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                    background: #F8FAFC !important;
                    color: #475569 !important;
                    border-bottom: 1px solid #E2E8F0 !important;
                  }
                  .new-invoice-table.data-table td {
                    padding: 8px 14px !important;
                    height: 40px !important;
                    font-size: 13px !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                    border-bottom: 1px solid #F1F5F9 !important;
                    color: #334155 !important;
                  }
                  .new-invoice-table.data-table tr {
                    height: 40px !important;
                  }
                  .new-invoice-table.data-table tr:hover {
                    background: #F8FAFC !important;
                  }
                  /* Hide number input spinners */
                  .new-invoice-table input::-webkit-outer-spin-button,
                  .new-invoice-table input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                  }
                  .new-invoice-table input[type=number] {
                    -moz-appearance: textfield;
                  }
                `}</style>
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table className="data-table new-invoice-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', width: '100px' }}>Package</th>
                        <th style={{ textAlign: 'left', width: '150px' }}>Item Name</th>
                        <th style={{ textAlign: 'left' }}>Description</th>
                        <th className="text-right" style={{ width: '80px' }}>{billingSource === 'dc' ? 'Received' : 'Cleared'}</th>
                        <th className="text-right" style={{ width: '80px' }}>Invoiced</th>
                        <th className="text-right" style={{ width: '80px' }}>Billable</th>
                        <th className="text-right" style={{ width: '80px' }}>Invoice Qty</th>
                        <th className="text-right" style={{ width: '90px' }}>Rate</th>
                        <th className="text-right" style={{ width: '70px' }}>GST Rate</th>
                        <th className="text-right" style={{ width: '100px' }}>Taxable</th>
                        <th className="text-right" style={{ width: '90px' }}>GST Amt</th>
                        <th className="text-right" style={{ width: '110px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentDetails.enrichedItems.map((it, i) => (
                        <tr key={i} style={{ opacity: it.remaining_qty === 0 ? 0.6 : 1 }}>
                          <td>
                            <div style={{ fontWeight: 600, color: '#475569', fontSize: '11px' }}>{it.package_name}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                              <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '11px' }}>{it.item_name}</div>
                              <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700 }}>HSN: {it.hsn || '-'}</div>
                            </div>
                          </td>
                          <td style={{ cursor: 'pointer' }} onClick={() => showFullDescription(it.description, it.item_name)}>
                            <div style={{ 
                              fontSize: '10px', 
                              color: '#64748B', 
                              maxWidth: '140px', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {it.description}
                            </div>
                          </td>
                          <td className="text-right" style={{ fontWeight: 700, fontSize: '11px' }}>{it.delivered_qty}</td>
                          <td className="text-right" style={{ fontWeight: 700, color: '#3b82f6', fontSize: '11px' }}>{it.already_invoiced_qty}</td>
                          <td className="text-right" style={{ fontWeight: 700, color: it.remaining_qty === 0 ? 'var(--green)' : '#ef4444', fontSize: '11px' }}>
                            {it.remaining_qty === 0 ? '0' : it.remaining_qty}
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              className="form-input text-right"
                              style={{ padding: '0 6px', height: '24px', fontSize: '11px', width: '60px', borderRadius: '4px', border: '1px solid #CBD5E1', display: 'inline-block', boxSizing: 'border-box' }}
                              value={it.quantity}
                              max={it.remaining_qty}
                              min={0}
                              disabled={it.remaining_qty === 0}
                              onChange={(e) => handleQtyChange(i, e.target.value)}
                            />
                          </td>
                          <td className="text-right" style={{ fontSize: '11px' }}>₹{it.rate_per_unit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="text-right" style={{ fontSize: '11px' }}>{it.gst_percent}%</td>
                          <td className="text-right" style={{ fontSize: '11px' }}>₹{it.taxable_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="text-right" style={{ fontSize: '11px' }}>₹{it.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="text-right font-medium" style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '11px' }}>₹{it.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="summary-card" style={{ padding: '10px 14px', borderRadius: '6px', marginTop: '12px' }}>
                  <h4 style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)', marginBottom: '6px', fontWeight: 700 }}>Invoice Financial Summary</h4>
                  <div className="summary-card__row" style={{ padding: '4px 0', fontSize: '11px' }}>
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="summary-card__row" style={{ padding: '4px 0', fontSize: '11px' }}>
                    <span>GST Total</span>
                    <span>₹{gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="summary-card__row" style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '6px', marginTop: '4px', paddingBottom: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>Estimated Grand Total</span>
                    <span style={{ fontSize: '14px', fontWeight: 900 }}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="form-group" style={{ marginTop: '12px', marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '10px', color: '#4B5563', marginBottom: '2px', display: 'block' }}>Notes / Declaration</label>
            <textarea className="form-input" rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Goods once sold cannot be returned. Payment due within 30 days." style={{ fontSize: '11px', padding: '6px 10px', height: '48px', resize: 'none', boxSizing: 'border-box' }}></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)} style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}>Discard</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !currentDetails || subtotal === 0} style={{ height: '30px', padding: '0 18px', fontSize: '12px' }}>
              {submitting
                ? (isAccounts ? 'Generating...' : 'Sending Request...')
                : (isAccounts ? 'Issue & Generate Official Invoice' : 'Send Invoice Request to Accounts')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
