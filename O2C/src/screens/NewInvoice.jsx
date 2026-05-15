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

  const [dcs, setDcs] = useState([]);
  const [allDcs, setAllDcs] = useState([]); // Store all billable DCs
  const [selectedDC, setSelectedDC] = useState('');
  const [dcDetails, setDcDetails] = useState(null);

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
    fetchDCs();
  }, []);

  const fetchDCs = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:5000/api/dc', { headers });
      // Only show DCs that are delivery_confirmed AND not fully invoiced
      const billable = res.data.filter(d =>
        (d.status === 'delivery_confirmed' || d.delivery_status === 'delivery_confirmed') &&
        d.invoicing_status !== 'fully_invoiced'
      );
      setAllDcs(billable);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      const res = await axios.get(`http://localhost:5000/api/dc/${id}`, { headers });
      const data = res.data;

      // Auto-populate addresses
      setBillingAddress(`${data.customer_legal_name || data.customer_name}\n${data.customer_addr1}\n${data.customer_addr2 || ''}\n${data.customer_city} - ${data.customer_pin}\nGSTIN: ${data.customer_gstin}`);
      setShippingAddress(`${data.location_name}\n${data.loc_addr1}\n${data.loc_addr2 || ''}\n${data.loc_city} - ${data.loc_pin}`);

      // We need PO details to get rates and GST. Let's fetch the PO.
      const poRes = await axios.get(`http://localhost:5000/api/pos/${data.po_id}`, { headers });
      const poData = poRes.data;

      // Map DC items to include financial details from PO line items
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
          package_name: pi.package || di.package_name || '-',
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

  const handleQtyChange = (idx, value) => {
    const qty = parseFloat(value) || 0;
    const items = [...dcDetails.enrichedItems];
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

    setDcDetails({ ...dcDetails, enrichedItems: items });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDC || !dcDetails) {
      Swal.fire({ icon: 'warning', title: 'Selection Required', text: 'Please select a DC' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        po_id: dcDetails.po_id,
        dc_id: dcDetails.id,
        customer_id: dcDetails.customer_id,
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes,
        place_of_supply: placeOfSupply,
        payment_terms: 'Net 30 Days',
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        subtotal: dcDetails.enrichedItems.reduce((acc, it) => acc + it.taxable_value, 0),
        gst_total: dcDetails.enrichedItems.reduce((acc, it) => acc + it.gst_amount, 0),
        grand_total: dcDetails.enrichedItems.reduce((acc, it) => acc + it.total_value, 0),
        items: dcDetails.enrichedItems
      };

      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post('http://localhost:5000/api/invoices', payload, { headers });

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

  const subtotal = dcDetails?.enrichedItems?.reduce((acc, it) => acc + (it.taxable_value || 0), 0) || 0;
  const gstTotal = dcDetails?.enrichedItems?.reduce((acc, it) => acc + (it.gst_amount || 0), 0) || 0;
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

      <div className="card card--padded animate-fade">
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Select Delivery Challan</label>
              <select className="form-select" value={selectedDC} onChange={handleSelectDC} required>
                <option value="">-- Choose DC --</option>
                {dcs.map(d => (
                  <option key={d.id} value={d.id}>{d.dc_number} - {d.customer_name} (PO: {d.po_no || d.po_number})</option>
                ))}
              </select>
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

          {dcDetails && (
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
                  Billable Items (Based on Site-Received Qty)
                </h3>
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Package</th>
                        <th style={{ textAlign: 'left' }}>Item Name</th>
                        <th style={{ textAlign: 'left' }}>Description</th>
                        <th className="text-right">Received Qty</th>
                        <th className="text-right">Invoiced Qty</th>
                        <th className="text-right">Billable Qty</th>
                        <th className="text-right" style={{ width: '120px' }}>Invoice Qty</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">GST %</th>
                        <th className="text-right">Taxable</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dcDetails.enrichedItems.map((it, i) => (
                        <tr key={i} style={{ opacity: it.remaining_qty === 0 ? 0.6 : 1 }}>
                          <td>
                            <div style={{ fontWeight: 600, color: '#475569' }}>{it.package_name}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{it.item_name}</div>
                            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>HSN: {it.hsn || '-'}</div>
                          </td>
                          <td style={{ cursor: 'pointer' }} onClick={() => showFullDescription(it.description, it.item_name)}>
                            <div style={{ 
                              fontSize: '11px', 
                              color: '#64748B', 
                              maxWidth: '180px', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {it.description}
                            </div>
                          </td>
                          <td className="text-right">
                            <div style={{ fontWeight: 700 }}>{it.delivered_qty} {it.uom || ''}</div>
                          </td>
                          <td className="text-right">
                            <div style={{ fontWeight: 700, color: '#3b82f6' }}>{it.already_invoiced_qty} {it.uom || ''}</div>
                          </td>
                          <td className="text-right">
                            <div style={{ fontWeight: 700, color: it.remaining_qty === 0 ? 'var(--green)' : '#ef4444' }}>
                              {it.remaining_qty === 0 ? 'Fully Billed' : `${it.remaining_qty} ${it.uom || ''}`}
                            </div>
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              className="form-input text-right"
                              style={{ padding: '4px 8px', height: '32px' }}
                              value={it.quantity}
                              max={it.remaining_qty}
                              min={0}
                              disabled={it.remaining_qty === 0}
                              onChange={(e) => handleQtyChange(i, e.target.value)}
                            />
                          </td>
                          <td className="text-right">₹{it.rate_per_unit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="text-right">{it.gst_percent}%</td>
                          <td className="text-right">₹{it.taxable_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right font-medium">₹{it.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="summary-card">
                  <h4 style={{ fontSize: '0.857rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>Invoice Financial Summary</h4>
                  <div className="summary-card__row">
                    <span>Subtotal (Taxable Value)</span>
                    <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="summary-card__row">
                    <span>GST Total</span>
                    <span>₹{gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="summary-card__row" style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '12px', marginTop: '4px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Grand Total</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="form-group" style={{ marginTop: '24px' }}>
            <label className="form-label">Notes / Declaration</label>
            <textarea className="form-input" rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Goods once sold cannot be returned. Payment due within 30 days."></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Discard</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !dcDetails || subtotal === 0}>
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
