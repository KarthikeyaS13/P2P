import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function POFlowManagement() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPOPayments, setSelectedPOPayments] = useState(null);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const res = await axios.get('http://localhost:5000/api/po-flow', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPos(res.data);
      } catch (err) {
        console.error('Error fetching PO flow:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(val || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleViewPayments = async (po) => {
    if ((Number(po.received_amount) || 0) <= 0) return;
    
    setLoadingPayments(true);
    setSelectedPOPayments({ po_number: po.po_number, customer_name: po.customer_name, payments: [] });
    
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`http://localhost:5000/api/pos/${po.id}/payments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedPOPayments(prev => ({ ...prev, payments: res.data }));
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  return (
    <div className="screen-enter">
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate('/dashboard')} className="btn-ghost" style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid var(--outline-variant)' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title">PO Flow Management</h1>
            <p className="page-header__subtitle">Enterprise Financial Lifecycle Tracking</p>
          </div>
        </div>
      </div>

      <div className="table-wrapper animate-fade" style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: '1900px' }}>
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>Customer Name</th>
              <th>PO Number</th>
              <th className="text-center">PO Date</th>
              <th className="text-center">Start Date</th>
              <th className="text-center">End Date</th>
              <th className="text-right">PO Value</th>
              <th className="text-right">Supplied Value</th>
              <th className="text-right" style={{ background: '#fef2f2' }}>To be supplied value</th>
              <th className="text-right">Invoiced Value</th>
              <th className="text-right" style={{ background: '#fffbeb' }}>To be invoiced</th>
              <th className="text-right">Receipts</th>
              <th className="text-right" style={{ background: '#f0fdf4', paddingRight: '24px' }}>Outstanding AR</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '60px' }}>
                  <div className="animate-pulse" style={{ color: 'var(--secondary)', fontWeight: 500 }}>Fetching financial flow data...</div>
                </td>
              </tr>
            ) : pos.length === 0 ? (
              <tr><td colSpan="12" style={{ textAlign: 'center', padding: '40px', color: 'var(--secondary)' }}>No active records.</td></tr>
            ) : pos.map(po => {
              const poValue = Number(po.po_value) || 0;
              const suppliedValue = Number(po.supplied_value) || 0;
              const invoiceAmount = Number(po.invoice_amount) || 0;
              const receivedAmount = Number(po.received_amount) || 0;
              
              const toBeSupplied = Math.max(0, poValue - suppliedValue);
              const toBeInvoiced = Number(po.to_be_invoiced_value) || 0;
              const outstandingAR = Math.max(0, invoiceAmount - receivedAmount);
              
              return (
                <tr key={po.id} className="hover-row">
                  <td style={{ paddingLeft: '24px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{po.customer_name}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>tag</span>
                      {po.po_number}
                    </div>
                  </td>
                  <td className="text-center">
                    <div style={{ fontSize: '12px' }}>{formatDate(po.po_date)}</div>
                  </td>
                  <td className="text-center">
                    <div style={{ fontSize: '12px' }}>{formatDate(po.start_date)}</div>
                  </td>
                  <td className="text-center">
                    <div style={{ fontSize: '12px' }}>{formatDate(po.end_date)}</div>
                  </td>
                  <td className="text-right">
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{formatCurrency(poValue)}</div>
                  </td>
                  <td className="text-right">
                    <div style={{ fontWeight: 500, color: '#3b82f6', fontSize: '13px' }}>{formatCurrency(suppliedValue)}</div>
                  </td>
                  <td className="text-right" style={{ background: '#fef2f230' }}>
                    <div style={{ fontWeight: 600, color: toBeSupplied > 0 ? '#ef4444' : '#6b7280', fontSize: '13px' }}>
                        {formatCurrency(toBeSupplied)}
                    </div>
                  </td>
                  <td className="text-right">
                    <div style={{ fontWeight: 500, color: '#f59e0b', fontSize: '13px' }}>{formatCurrency(invoiceAmount)}</div>
                  </td>
                  <td className="text-right" style={{ background: '#fffbeb30' }}>
                    <div style={{ fontWeight: 600, color: toBeInvoiced > 0 ? '#d97706' : '#6b7280', fontSize: '13px' }}>
                        {formatCurrency(toBeInvoiced)}
                    </div>
                  </td>
                  <td className="text-right">
                    <div 
                        onClick={() => handleViewPayments(po)}
                        style={{ 
                            fontWeight: 600, 
                            color: receivedAmount > 0 ? '#10b981' : '#6b7280', 
                            fontSize: '13px',
                            cursor: receivedAmount > 0 ? 'pointer' : 'default',
                            textDecoration: receivedAmount > 0 ? 'underline dotted' : 'none'
                        }}
                        title={receivedAmount > 0 ? "Click to view transaction details" : ""}
                    >
                        {formatCurrency(receivedAmount)}
                    </div>
                  </td>
                  <td className="text-right" style={{ background: '#f0fdf430', paddingRight: '24px' }}>
                    <div style={{ fontWeight: 700, color: outstandingAR > 0 ? '#ef4444' : '#059669', fontSize: '13px' }}>
                        {formatCurrency(outstandingAR)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Transaction Overlay */}
      {selectedPOPayments && (
        <div className="details-overlay" onClick={() => setSelectedPOPayments(null)}>
          <div className="details-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="details-header">
              <div>
                <h2 className="text-h2">Payment Transactions</h2>
                <p className="text-secondary">{selectedPOPayments.customer_name} | {selectedPOPayments.po_number}</p>
              </div>
              <button onClick={() => setSelectedPOPayments(null)} className="btn-close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="details-body" style={{ padding: '24px' }}>
              {loadingPayments ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="animate-pulse">Loading transaction history...</div>
                </div>
              ) : selectedPOPayments.payments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--secondary)' }}>
                    No payment records found for this PO.
                </div>
              ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Invoice #</th>
                            <th>Mode</th>
                            <th>Transaction Ref / UTR</th>
                            <th className="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {selectedPOPayments.payments.map(pay => (
                            <tr key={pay.id}>
                                <td>{formatDate(pay.payment_date)}</td>
                                <td>
                                    <span style={{ fontWeight: 600, fontSize: '12px' }}>{pay.invoice_number}</span>
                                </td>
                                <td>
                                    <span style={{ 
                                        fontSize: '11px', 
                                        background: '#f1f5f9', 
                                        padding: '2px 8px', 
                                        borderRadius: '4px',
                                        textTransform: 'capitalize'
                                    }}>
                                        {pay.payment_mode}
                                    </span>
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#475569' }}>
                                    {pay.transaction_ref || 'N/A'}
                                </td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#059669' }}>
                                    {formatCurrency(pay.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
            </div>
            <div className="details-footer" style={{ padding: '16px 24px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)', marginRight: '12px' }}>Total Receipts:</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>
                        {formatCurrency(selectedPOPayments.payments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0))}
                    </span>
                </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hover-row:hover {
          background: #f8fafc;
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        .data-table th {
            font-size: 10px !important;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            background: #f8fafc;
            padding: 16px 16px;
            font-weight: 700;
        }
        .data-table td {
            padding: 16px 16px;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        
        .details-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
        }
        .details-card {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
            overflow: hidden;
            animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .details-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--outline-variant);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
        }
        .btn-close {
            background: white;
            border: 1px solid var(--outline-variant);
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-close:hover {
            background: #f1f5f9;
            color: #ef4444;
        }
      `}</style>
    </div>
  );
}
