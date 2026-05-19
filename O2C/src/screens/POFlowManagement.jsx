import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function POFlowManagement() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPOPayments, setSelectedPOPayments] = useState(null);
  const [selectedPOSupplied, setSelectedPOSupplied] = useState(null);
  const [selectedPOPending, setSelectedPOPending] = useState(null);
  const [selectedPOInvoiced, setSelectedPOInvoiced] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const navigate = useNavigate();

  const filteredPOs = useMemo(() => {
    return pos.filter(po => {
      const matchSearch =
        (po.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (po.customer_name || '').toLowerCase().includes(search.toLowerCase());
      
      const poValue = Number(po.po_value) || 0;
      const suppliedValue = Number(po.supplied_value) || 0;
      const invoiceAmount = Number(po.invoice_amount) || 0;
      const receivedAmount = Number(po.received_amount) || 0;
      
      const toBeSupplied = Math.max(0, poValue - suppliedValue);
      const toBeInvoiced = Number(po.to_be_invoiced_value) || 0;
      const outstandingAR = Math.max(0, invoiceAmount - receivedAmount);

      let matchFilter = true;
      if (filterType === 'pending_supply') {
        matchFilter = toBeSupplied > 0;
      } else if (filterType === 'fully_supplied') {
        matchFilter = toBeSupplied === 0 && suppliedValue > 0;
      } else if (filterType === 'pending_invoice') {
        matchFilter = toBeInvoiced > 0;
      } else if (filterType === 'outstanding_ar') {
        matchFilter = outstandingAR > 0;
      } else if (filterType === 'fully_paid') {
        matchFilter = outstandingAR === 0 && invoiceAmount > 0;
      }

      return matchSearch && matchFilter;
    });
  }, [pos, search, filterType]);

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
    
    setLoadingDetails(true);
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
      setLoadingDetails(false);
    }
  };

  const handleViewSupplied = async (po) => {
    if ((Number(po.supplied_value) || 0) <= 0) return;
    
    setLoadingDetails(true);
    setSelectedPOSupplied({ po_number: po.po_number, customer_name: po.customer_name, items: [] });
    
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`http://localhost:5000/api/pos/${po.id}/supplied-details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedPOSupplied(prev => ({ ...prev, items: res.data }));
    } catch (err) {
      console.error('Error fetching supplied details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleViewPending = async (po) => {
    const poValue = Number(po.po_value) || 0;
    const suppliedValue = Number(po.supplied_value) || 0;
    if (poValue - suppliedValue <= 0) return;
    
    setLoadingDetails(true);
    setSelectedPOPending({ po_number: po.po_number, customer_name: po.customer_name, items: [] });
    
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`http://localhost:5000/api/pos/${po.id}/pending-details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedPOPending(prev => ({ ...prev, items: res.data }));
    } catch (err) {
      console.error('Error fetching pending details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleViewInvoiced = async (po) => {
    if ((Number(po.invoice_amount) || 0) <= 0) return;
    
    setLoadingDetails(true);
    setSelectedPOInvoiced({ po_number: po.po_number, customer_name: po.customer_name, invoices: [] });
    
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`http://localhost:5000/api/pos/${po.id}/invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedPOInvoiced(prev => ({ ...prev, invoices: res.data }));
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoadingDetails(false);
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

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        marginBottom: '24px',
        background: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder="Search by PO # or Customer Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 12px 0 40px',
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                background: '#F9FAFB'
              }}
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              flex: '0 0 280px',
              height: '42px',
              padding: '0 16px',
              border: '1px solid #D1D5DB',
              borderRadius: '8px',
              background: '#F9FAFB',
              fontSize: '14px',
              cursor: 'pointer',
              color: '#374151',
              outline: 'none'
            }}
          >
            <option value="all">All Purchase Orders</option>
            <option value="pending_supply">Pending Supply</option>
            <option value="fully_supplied">Fully Supplied</option>
            <option value="pending_invoice">Pending Invoice</option>
            <option value="outstanding_ar">Outstanding Accounts Receivable</option>
            <option value="fully_paid">Fully Paid & Closed</option>
          </select>
        </div>
        <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {filteredPOs.length} Records Found
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
            ) : filteredPOs.length === 0 ? (
              <tr><td colSpan="12" style={{ textAlign: 'center', padding: '40px', color: 'var(--secondary)' }}>No active records matched your filters.</td></tr>
            ) : filteredPOs.map(po => {
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
                    <div 
                      onClick={() => handleViewSupplied(po)}
                      style={{ 
                        fontWeight: 500, 
                        color: suppliedValue > 0 ? '#3b82f6' : '#6b7280', 
                        fontSize: '13px',
                        cursor: suppliedValue > 0 ? 'pointer' : 'default',
                        textDecoration: suppliedValue > 0 ? 'underline dotted' : 'none'
                      }}
                    >
                        {formatCurrency(suppliedValue)}
                    </div>
                  </td>
                  <td className="text-right" style={{ background: '#fef2f230' }}>
                    <div 
                      onClick={() => handleViewPending(po)}
                      style={{ 
                        fontWeight: 600, 
                        color: toBeSupplied > 0 ? '#ef4444' : '#6b7280', 
                        fontSize: '13px',
                        cursor: toBeSupplied > 0 ? 'pointer' : 'default',
                        textDecoration: toBeSupplied > 0 ? 'underline dotted' : 'none'
                      }}
                    >
                        {formatCurrency(toBeSupplied)}
                    </div>
                  </td>
                  <td className="text-right">
                    <div 
                      onClick={() => handleViewInvoiced(po)}
                      style={{ 
                        fontWeight: 500, 
                        color: invoiceAmount > 0 ? '#f59e0b' : '#6b7280', 
                        fontSize: '13px',
                        cursor: invoiceAmount > 0 ? 'pointer' : 'default',
                        textDecoration: invoiceAmount > 0 ? 'underline dotted' : 'none'
                      }}
                      title={invoiceAmount > 0 ? "Click to view invoice details" : ""}
                    >
                        {formatCurrency(invoiceAmount)}
                    </div>
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

      {/* Payment Transaction Overlay */}
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
            
            <div className="details-body" style={{ padding: '0 24px 24px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingDetails ? (
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

      {/* Supplied Items Overlay */}
      {selectedPOSupplied && (
        <div className="details-overlay" onClick={() => setSelectedPOSupplied(null)}>
          <div className="details-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
            <div className="details-header" style={{ background: '#f0f9ff' }}>
              <div>
                <h2 className="text-h2" style={{ color: '#0369a1' }}>Supplied Items History</h2>
                <p className="text-secondary">{selectedPOSupplied.customer_name} | {selectedPOSupplied.po_number}</p>
              </div>
              <button onClick={() => setSelectedPOSupplied(null)} className="btn-close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="details-body" style={{ padding: '0 24px 24px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingDetails ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="animate-pulse">Loading supply records...</div>
                </div>
              ) : selectedPOSupplied.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--secondary)' }}>
                    No supply records found.
                </div>
              ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Dispatch Date</th>
                            <th>DC Number</th>
                            <th>Manual DC</th>
                            <th>Vehicle No</th>
                            <th>Status</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {selectedPOSupplied.items.map((dc, idx) => (
                            <tr key={idx}>
                                <td>{formatDate(dc.dispatch_date)}</td>
                                <td style={{ fontWeight: 700, color: '#0369a1' }}>{dc.dc_number}</td>
                                <td>{dc.manual_dc_number || '-'}</td>
                                <td>{dc.vehicle_no || '-'}</td>
                                <td>
                                    <span style={{ 
                                        fontSize: '10px', 
                                        fontWeight: 700,
                                        background: dc.status === 'delivered' ? '#dcfce7' : '#fef9c3', 
                                        color: dc.status === 'delivered' ? '#166534' : '#854d0e',
                                        padding: '2px 8px', 
                                        borderRadius: '12px',
                                        textTransform: 'uppercase'
                                    }}>
                                        {dc.delivery_status || dc.status}
                                    </span>
                                </td>
                                <td className="text-right" style={{ fontWeight: 600 }}>{dc.total_qty}</td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#0369a1' }}>
                                    {formatCurrency(dc.total_value)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
            </div>
            <div className="details-footer" style={{ padding: '16px 24px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)', marginRight: '12px' }}>Total Supplied Value:</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#0369a1' }}>
                        {formatCurrency(selectedPOSupplied.items.reduce((acc, curr) => acc + (Number(curr.total_value) || 0), 0))}
                    </span>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Items Overlay */}
      {selectedPOPending && (
        <div className="details-overlay" onClick={() => setSelectedPOPending(null)}>
          <div className="details-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px', width: '95%' }}>
            <div className="details-header" style={{ background: '#fff1f2' }}>
              <div>
                <h2 className="text-h2" style={{ color: '#be123c' }}>Pending Supplies Breakdown</h2>
                <p className="text-secondary">{selectedPOPending.customer_name} | {selectedPOPending.po_number}</p>
              </div>
              <button onClick={() => setSelectedPOPending(null)} className="btn-close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="details-body" style={{ padding: '0 24px 24px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingDetails ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="animate-pulse">Analyzing pending items...</div>
                </div>
              ) : selectedPOPending.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#059669', fontWeight: 700 }}>
                    All items have been fully supplied!
                </div>
              ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Package</th>
                            <th>Item Name</th>
                            <th>Description</th>
                            <th className="text-right">PO Qty</th>
                            <th className="text-right">Supplied</th>
                            <th className="text-right">Pending</th>
                            <th className="text-right">Rate</th>
                            <th className="text-right">Pending Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {selectedPOPending.items.map((it, idx) => (
                            <tr key={idx}>
                                <td style={{ fontSize: '12px' }}>{it.package_name || '-'}</td>
                                <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                <td style={{ fontSize: '11px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.description}>
                                    {it.description}
                                </td>
                                <td className="text-right">{it.supply_qty}</td>
                                <td className="text-right" style={{ color: '#059669' }}>{it.qty_delivered}</td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#be123c' }}>{it.pending_qty}</td>
                                <td className="text-right" style={{ fontSize: '12px' }}>{formatCurrency(it.rate)}</td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#be123c' }}>
                                    {formatCurrency(it.pending_value)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
            </div>
            <div className="details-footer" style={{ padding: '16px 24px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)', marginRight: '12px' }}>Total Pending Value:</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#be123c' }}>
                        {formatCurrency(selectedPOPending.items.reduce((acc, curr) => acc + (Number(curr.pending_value) || 0), 0))}
                    </span>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoiced Breakdown Overlay */}
      {selectedPOInvoiced && (
        <div className="details-overlay" onClick={() => setSelectedPOInvoiced(null)}>
          <div className="details-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', width: '90%' }}>
            <div className="details-header" style={{ background: '#fffbeb' }}>
              <div>
                <h2 className="text-h2" style={{ color: '#d97706' }}>Invoiced Breakdown</h2>
                <p className="text-secondary">{selectedPOInvoiced.customer_name} | {selectedPOInvoiced.po_number}</p>
              </div>
              <button onClick={() => setSelectedPOInvoiced(null)} className="btn-close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="details-body" style={{ padding: '0 24px 24px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingDetails ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="animate-pulse">Loading invoice history...</div>
                </div>
              ) : selectedPOInvoiced.invoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--secondary)' }}>
                    No invoice records found for this PO.
                </div>
              ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Invoice Date</th>
                            <th>Invoice #</th>
                            <th>DC Number</th>
                            <th>Status</th>
                            <th className="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {selectedPOInvoiced.invoices.map(inv => (
                            <tr key={inv.id}>
                                <td>{formatDate(inv.invoice_date)}</td>
                                <td style={{ fontWeight: 700, color: '#d97706' }}>{inv.invoice_number}</td>
                                <td>{inv.dc_number || '-'}</td>
                                <td>
                                    <span style={{ 
                                        fontSize: '10px', 
                                        fontWeight: 700,
                                        background: inv.status === 'paid' ? '#dcfce7' : inv.status === 'partially_paid' ? '#fef9c3' : '#fee2e2', 
                                        color: inv.status === 'paid' ? '#166534' : inv.status === 'partially_paid' ? '#854d0e' : '#991b1b',
                                        padding: '2px 8px', 
                                        borderRadius: '12px',
                                        textTransform: 'uppercase'
                                    }}>
                                        {inv.status}
                                    </span>
                                </td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#d97706' }}>
                                    {formatCurrency(inv.grand_total)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
            </div>
            <div className="details-footer" style={{ padding: '16px 24px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)', marginRight: '12px' }}>Total Invoiced:</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#d97706' }}>
                        {formatCurrency(selectedPOInvoiced.invoices.reduce((acc, curr) => acc + (Number(curr.grand_total) || 0), 0))}
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
            position: sticky;
            top: 0;
            z-index: 10;
            font-size: 11px !important;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #1e293b;
            background: #f8fafc;
            box-shadow: inset 0 -1px 0 #e2e8f0;
            padding: 16px 16px;
            font-weight: 800 !important;
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
