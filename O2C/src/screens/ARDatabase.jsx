import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getUser } from '../auth';

export default function ARDatabase() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Payment Modal State
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const user = getUser();
  const isAccounts = user?.role === 'accounts' || user?.role === 'admin';

  useEffect(() => {
    fetchAR();
  }, []);

  const fetchAR = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:3000/api/invoices/ar/entries', { headers });
      setEntries(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedEntry) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`http://localhost:3000/api/invoices/ar/${selectedEntry.id}/payment`, {
        amount_received: parseFloat(amountReceived),
        payment_date: paymentDate,
        payment_reference: paymentRef
      }, { headers });
      
      alert('Payment recorded successfully');
      setSelectedEntry(null);
      fetchAR();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="screen-enter"><p>Loading AR Database...</p></div>;

  return (
    <div className="screen-enter">
      <div className="page-header">
        <div>
          <h1 className="text-h1 page-header__title">Accounts Receivable</h1>
          <p className="page-header__subtitle">Track invoice payments and outstanding balances</p>
        </div>
      </div>
      
      {error && <div style={{ color: 'var(--error)', marginBottom: '16px' }}>{error}</div>}

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>PO #</th>
                <th>Due Date</th>
                <th className="text-right">Amount Due</th>
                <th className="text-right">Received</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                {isAccounts && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td className="font-medium">{e.invoice_number}</td>
                  <td>{e.customer_name}</td>
                  <td>{e.po_number}</td>
                  <td>{new Date(e.due_date).toLocaleDateString()}</td>
                  <td className="text-right">₹{e.amount_due?.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  <td className="text-right" style={{ color: 'var(--green)' }}>₹{e.amount_received?.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  <td className="text-right font-medium" style={{ color: e.balance > 0 ? 'var(--error)' : 'inherit' }}>
                    ₹{e.balance?.toLocaleString('en-IN', {minimumFractionDigits:2})}
                  </td>
                  <td>
                    <span className={`badge ${e.status === 'paid' ? 'badge--verified' : e.status === 'partial' ? 'badge--pending' : 'badge--rejected'}`}>
                      <span className="badge__dot"></span>
                      {e.status.toUpperCase()}
                    </span>
                  </td>
                  {isAccounts && (
                    <td className="text-right">
                      {e.status !== 'paid' && (
                        <button className="btn btn-sm btn-outline" onClick={() => {
                          setSelectedEntry(e);
                          setAmountReceived(e.balance || '');
                          setPaymentRef('');
                        }}>Record Payment</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={isAccounts ? 9 : 8} className="text-center" style={{ padding: '24px' }}>No AR entries found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card card--padded animate-scale-up" style={{ width: '400px', maxWidth: '90%' }}>
            <h3 className="text-h3" style={{ marginBottom: '16px' }}>Record Payment</h3>
            <p className="text-body-sm" style={{ marginBottom: '16px' }}>
              Invoice: <strong>{selectedEntry.invoice_number}</strong><br/>
              Balance Due: <strong>₹{selectedEntry.balance?.toLocaleString('en-IN')}</strong>
            </p>
            <form onSubmit={handleRecordPayment}>
              <div className="form-group">
                <label className="form-label">Amount Received (₹)</label>
                <input type="number" step="0.01" max={selectedEntry.balance} className="form-input" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input type="date" className="form-input" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Reference (UTR/Cheque)</label>
                <input type="text" className="form-input" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSelectedEntry(null)}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
