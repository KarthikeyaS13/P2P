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
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDCs();
  }, []);

  const fetchDCs = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:3000/api/dc', { headers });
      // Only show DCs that are accepted/closed, or at least raised if your flow allows
      const billable = res.data.filter(d => d.status === 'accepted' || d.status === 'closed' || d.status === 'raised');
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
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:3000/api/dc/${id}`, { headers });
      const data = res.data;
      
      // We need PO details to get rates and GST. Let's fetch the PO.
      const poRes = await axios.get(`http://localhost:3000/api/pos/${data.po_id}`, { headers });
      const poData = poRes.data;
      
      // Map DC items to include financial details from PO line items
      const enrichedItems = (data.items || []).map(di => {
        const pi = poData.line_items.find(p => p.id === di.po_line_item_id) || {};
        const rate = pi.rate_per_unit || 0;
        const gstPct = pi.gst_percent || 18;
        const qty = parseFloat(di.quantity_dispatched) || 0;
        
        const taxable = qty * rate;
        const gst = taxable * (gstPct / 100);
        const total = taxable + gst;
        
        return {
          ...di,
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
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes,
        items: dcDetails.enrichedItems.map(it => ({
          po_line_item_id: it.po_line_item_id,
          dc_line_item_id: it.id,
          item_name: it.item_name,
          quantity: it.quantity_dispatched,
          rate_per_unit: it.rate_per_unit,
          gst_percent: it.gst_percent,
          taxable_value: it.taxable_value,
          gst_amount: it.gst_amount,
          total_value: it.total_value
        }))
      };

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post('http://localhost:3000/api/invoices', payload, { headers });
      
      const result = res.data;
      alert(`Invoice ${result.invoice_number} created successfully!`);
      navigate('/ar-database');
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
        <div>
          <h1 className="text-h1 page-header__title">Raise Invoice</h1>
          <p className="page-header__subtitle">Generate an invoice against a delivered challan</p>
        </div>
      </div>
      
      {error && <div style={{ color: 'var(--error)', marginBottom: '16px' }}>{error}</div>}
      
      <div className="card card--padded">
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Select Delivery Challan</label>
              <select className="form-select" value={selectedDC} onChange={handleSelectDC} required>
                <option value="">-- Choose DC --</option>
                {dcs.map(d => (
                  <option key={d.id} value={d.id}>{d.dc_number} - {d.customer_name} (PO: {d.po_number})</option>
                ))}
              </select>
            </div>
            {dcDetails && (
              <div className="form-group">
                <label className="form-label">PO Number</label>
                <input className="form-input" value={dcDetails.po_number || ''} disabled />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Invoice Date</label>
              <input type="date" className="form-input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Notes / Terms</label>
            <textarea className="form-input" rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, special instructions..."></textarea>
          </div>

          {dcDetails && (
            <div style={{ marginTop: '24px' }}>
              <h3 className="text-h3" style={{ marginBottom: '16px' }}>Billable Items</h3>
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">GST %</th>
                      <th className="text-right">Taxable</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dcDetails.enrichedItems.map((it, i) => (
                      <tr key={i}>
                        <td>{it.item_name}</td>
                        <td className="text-right">{it.quantity_dispatched} {it.uom}</td>
                        <td className="text-right">₹{it.rate_per_unit.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                        <td className="text-right">{it.gst_percent}%</td>
                        <td className="text-right">₹{it.taxable_value.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                        <td className="text-right font-medium">₹{it.total_value.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="summary-card">
                <h4 style={{ fontSize: '0.857rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>Invoice Summary</h4>
                <div className="summary-card__row">
                  <span>Subtotal (Taxable)</span>
                  <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-card__row">
                  <span>GST Total</span>
                  <span>₹{gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-card__row">
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !dcDetails}>
              {submitting ? 'Raising...' : 'Confirm & Raise Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
