import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getUser } from '../auth';

const formatIndianCommas = (val) => {
  if (val === null || val === undefined) return '';
  const str = val.toString();
  if (!str) return '';
  const parts = str.split('.');
  let integerPart = parts[0].replace(/,/g, '');
  const decimalPart = parts[1];

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherParts = integerPart.substring(0, integerPart.length - 3);
  if (otherParts !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherParts.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

  if (parts.length > 1) {
    return formattedInteger + '.' + decimalPart;
  }
  return formattedInteger;
};

export default function ARDatabase() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  
  // Payment Modal State
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // View Payments Modal State
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState('all');
  const user = getUser();

  const isAccounts = user?.role === 'accounts' || user?.role === 'admin';

  useEffect(() => {
    fetchAR();
  }, []);

  const fetchAR = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:5000/api/invoices/ar/entries', { headers });
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
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`http://localhost:5000/api/invoices/${selectedEntry.invoice_id}/payment`, {
        amount: parseFloat(amountReceived),
        payment_date: paymentDate,
        payment_mode: 'NEFT', // Default, could be a dropdown
        transaction_ref: paymentRef
      }, { headers });
      
      Swal.fire({ icon: 'success', title: 'Payment Recorded', text: 'Payment recorded successfully', timer: 2000, showConfirmButton: false });
      setSelectedEntry(null);
      fetchAR();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleShowPayments = async (entry) => {
    setLoadingHistory(true);
    setPaymentHistory({ invoice_number: entry.invoice_number, payments: [] });
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:5000/api/invoices/${entry.invoice_id}`, { headers });
      setPaymentHistory({
        invoice_number: entry.invoice_number,
        payments: res.data.payments || []
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to fetch payment history' });
      setPaymentHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getStatusDisplay = (entry) => {
    if (entry.status === 'paid') return { text: 'PAID', className: 'badge--verified' };
    
    const dueDate = new Date(entry.due_date);
    const today = new Date();
    today.setHours(0,0,0,0);
    dueDate.setHours(0,0,0,0);
    
    if (today <= dueDate) {
      return { text: 'NOT DUE', className: 'badge--pending' };
    } else {
      const diffTime = Math.abs(today - dueDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { text: `DUE (${diffDays} DAYS)`, className: 'badge--rejected' };
    }
  };

  if (loading) return <div className="screen-enter"><p>Loading AR Database...</p></div>;


  const filteredEntries = entries.filter(e => {
    if (statusFilter === 'all') return true;
    const status = getStatusDisplay(e);
    if (statusFilter === 'due') return status.text.startsWith('DUE');
    if (statusFilter === 'not_due') return status.text === 'NOT DUE';
    if (statusFilter === 'paid') return status.text === 'PAID';
    return true;
  });

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
            <h1 className="text-h1 page-header__title">Accounts Receivable</h1>
            <p className="page-header__subtitle">Track invoice payments and outstanding balances</p>
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ margin: 0, minWidth: '150px' }}>
            <select 
              className="form-input" 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', height: '42px' }}
            >
              <option value="all">All Status</option>
              <option value="due">Due</option>
              <option value="not_due">Not Due</option>
              <option value="paid">Paid</option>
            </select>
          </div>
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
              {filteredEntries.map(e => (
                <tr key={e.id}>
                  <td className="font-medium">{e.invoice_number}</td>
                  <td>{e.customer_name}</td>
                  <td>{e.po_number}</td>
                  <td>{new Date(e.due_date).toLocaleDateString()}</td>
                  <td className="text-right">₹{e.amount_due?.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  <td className="text-right">
                    {e.amount_received > 0 ? (
                      <button
                        onClick={() => handleShowPayments(e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--green)',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontWeight: 600,
                          padding: 0,
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          textAlign: 'right',
                          width: '100%'
                        }}
                      >
                        ₹{e.amount_received?.toLocaleString('en-IN', {minimumFractionDigits:2})}
                      </button>
                    ) : (
                      <span style={{ color: '#9CA3AF' }}>₹0.00</span>
                    )}
                  </td>
                  <td className="text-right font-medium" style={{ color: e.balance > 0 ? 'var(--error)' : 'inherit' }}>
                    ₹{e.balance?.toLocaleString('en-IN', {minimumFractionDigits:2})}
                  </td>
                  <td>
                    {(() => {
                      const status = getStatusDisplay(e);
                      return (
                        <span className={`badge ${status.className}`} style={{ whiteSpace: 'nowrap' }}>
                          <span className="badge__dot"></span>
                          {status.text}
                        </span>
                      );
                    })()}
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
              {filteredEntries.length === 0 && (
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
              Balance Due: <strong>₹{selectedEntry.balance?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </p>
            <form onSubmit={handleRecordPayment} autoComplete="off">
              <div className="form-group">
                <label className="form-label">Amount Received (₹)</label>
                <input
                  type="text"
                  name="ar_amount_received"
                  id="ar_amount_received"
                  className="form-input"
                  value={formatIndianCommas(amountReceived)}
                  onChange={e => {
                    let val = e.target.value.replace(/,/g, '');
                    // Allow only digits and up to one decimal point
                    val = val.replace(/[^0-9.]/g, '');
                    const parts = val.split('.');
                    if (parts.length > 2) {
                      val = parts[0] + '.' + parts.slice(1).join('');
                    }
                    if (parts[1] && parts[1].length > 2) {
                      val = parts[0] + '.' + parts[1].substring(0, 2);
                    }
                    // Enforce max balance limit
                    const maxVal = selectedEntry.balance || 0;
                    const num = parseFloat(val);
                    if (!isNaN(num) && num > maxVal) {
                      val = maxVal.toFixed(2);
                    }
                    setAmountReceived(val);
                  }}
                  required
                  autoComplete="new-password"
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <div className="date-picker-container">
                  <DatePicker
                    selected={paymentDate ? new Date(paymentDate) : null}
                    onChange={(date) => setPaymentDate(date ? date.toISOString().split('T')[0] : '')}
                    dateFormat="dd/MM/yyyy"
                    className="form-input"
                    placeholderText="DD/MM/YYYY"
                    required
                  />
                  <span className="material-symbols-outlined calendar-icon">calendar_today</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reference (UTR/Cheque)</label>
                <input type="text" className="form-input" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} required autoComplete="off" />
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

      {paymentHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card card--padded animate-scale-up" style={{ width: '600px', maxWidth: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
              <h3 className="text-h3" style={{ margin: 0 }}>Payment History</h3>
              <button 
                onClick={() => setPaymentHistory(null)} 
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6B7280' }}
              >
                &times;
              </button>
            </div>
            <p className="text-body-sm" style={{ marginBottom: '16px' }}>
              Invoice Number: <strong>{paymentHistory.invoice_number}</strong>
            </p>

            {loadingHistory ? (
              <div style={{ padding: '24px', textAlign: 'center' }}>Loading payment records...</div>
            ) : (
              <>
                {paymentHistory.payments.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280' }}>No payments recorded for this invoice.</div>
                ) : (
                  <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Payment Date</th>
                          <th>Method</th>
                          <th>Reference / UTR</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentHistory.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                            <td><span className="badge badge--pending">{p.payment_mode || 'NEFT'}</span></td>
                            <td style={{ fontFamily: 'monospace' }}>{p.transaction_ref || '-'}</td>
                            <td className="text-right font-medium" style={{ color: 'var(--green)' }}>
                              ₹{p.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                  <div className="font-semibold" style={{ color: '#374151' }}>
                    Total Received: <span style={{ color: 'var(--green)' }}>
                      ₹{paymentHistory.payments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={() => setPaymentHistory(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
