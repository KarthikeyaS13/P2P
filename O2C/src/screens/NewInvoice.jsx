import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getUser } from '../auth';

export default function NewInvoice() {
  const [dcs, setDcs] = useState([]);
  const [selectedDC, setSelectedDC] = useState('');
  const [dcDetails, setDcDetails] = useState(null);

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Enterprise Fields
  const [placeOfSupply, setPlaceOfSupply] = useState('Hyderabad');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const user = getUser();
  const isAccounts = user?.role === 'accounts' || user?.role === 'admin';

  useEffect(() => {
    fetchDCs();
  }, []);

  const fetchDCs = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:3000/api/dc', { headers });
      // Only show DCs that are delivery_confirmed AND not fully invoiced
      const billable = res.data.filter(d =>
        (d.status === 'delivery_confirmed' || d.delivery_status === 'delivery_confirmed') &&
        d.invoicing_status !== 'fully_invoiced'
      );
      setDcs(billable);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
      const res = await axios.get(`http://localhost:3000/api/dc/${id}`, { headers });
      const data = res.data;

      // Auto-populate addresses
      setBillingAddress(`${data.customer_legal_name || data.customer_name}\n${data.customer_addr1}\n${data.customer_addr2 || ''}\n${data.customer_city} - ${data.customer_pin}\nGSTIN: ${data.customer_gstin}`);
      setShippingAddress(`${data.location_name}\n${data.loc_addr1}\n${data.loc_addr2 || ''}\n${data.loc_city} - ${data.loc_pin}`);

      // We need PO details to get rates and GST. Let's fetch the PO.
      const poRes = await axios.get(`http://localhost:3000/api/pos/${data.po_id}`, { headers });
      const poData = poRes.data;

      // Map DC items to include financial details from PO line items
      const enrichedItems = (data.items || []).map(di => {
        const pi = poData.items.find(p => p.id === di.po_line_item_id) || {};
        const rate = pi.supply_rate || 0;
        const gstPct = pi.supply_gst_rate || 18;

        const delivered = parseFloat(di.quantity_dispatched) || 0;
        const alreadyInvoiced = parseFloat(di.invoiced_qty) || 0;
        const remaining = Math.max(0, delivered - alreadyInvoiced);

        // Default to invoicing full remaining qty
        const taxable = remaining * rate;
        const gst = taxable * (gstPct / 100);
        const total = taxable + gst;

        return {
          ...di,
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
      alert("Please select a DC");
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
        payment_terms: paymentTerms,
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        subtotal: dcDetails.enrichedItems.reduce((acc, it) => acc + it.taxable_value, 0),
        gst_total: dcDetails.enrichedItems.reduce((acc, it) => acc + it.gst_amount, 0),
        grand_total: dcDetails.enrichedItems.reduce((acc, it) => acc + it.total_value, 0),
        items: dcDetails.enrichedItems
      };

      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post('http://localhost:3000/api/invoices', payload, { headers });

      const result = res.data;
      
      alert(`Invoice Request ${result.invoice_number} created successfully!`);
      const targetPath = isAccounts ? `/invoice-approval/${result.id}` : `/invoice-request/${result.id}`;
      navigate(targetPath);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
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
            className="btn-ghost"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'white',
              border: '1px solid var(--outline-variant)'
            }}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title">
              {isAccounts ? 'Issue Official Invoice' : 'Invoice Request'}
            </h1>
            <p className="page-header__subtitle">
              {isAccounts 
                ? 'Finalize billing and generate official tax document' 
                : 'Raise a billing request for Accounts department approval'}
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
              <input type="date" className="form-input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Terms</label>
              <input className="form-input" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
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
                  Billable Items (Based on Delivered Qty)
                </h3>
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item Description</th>
                        <th className="text-right">Delivered Qty</th>
                        <th className="text-right">Unit </th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">GST %</th>
                        <th className="text-right">Taxable</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dcDetails.enrichedItems.map((it, i) => (
                        <tr key={i}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{it.item_name}</div>
                            <div style={{ fontSize: '11px', color: '#6B7280' }}>HSN: {it.hsn || '-'}</div>
                          </td>
                          <td className="text-right">
                            <div style={{ fontWeight: 700 }}>{it.delivered_qty} {it.uom}</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Invoiced: {it.already_invoiced_qty}</div>
                          </td>
                          <td className="text-right" style={{ width: '120px' }}>
                            <input
                              type="number"
                              className="form-input text-right"
                              style={{ padding: '4px 8px', height: '32px' }}
                              value={it.quantity}
                              max={it.remaining_qty}
                              min={0}
                              onChange={(e) => handleQtyChange(i, e.target.value)}
                            />
                            <div style={{ fontSize: '10px', color: it.remaining_qty - it.quantity <= 0 ? 'var(--green)' : 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                              {it.remaining_qty - it.quantity <= 0 ? 'Fully Billed' : `Rem: ${it.remaining_qty - it.quantity}`}
                            </div>
                          </td>
                          <td className="text-right">₹{it.rate_per_unit.toLocaleString('en-IN')}</td>
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
            <button type="submit" className="btn btn-primary" disabled={submitting || !dcDetails}>
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
