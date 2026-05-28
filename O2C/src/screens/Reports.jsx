import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'items'
  const [pos, setPos] = useState([]);
  const [items, setItems] = useState([]);
  const [loadingPos, setLoadingPos] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  
  // Selected PO for line items detail tracking
  const [selectedPo, setSelectedPo] = useState(null);
  
  // Filters
  const [searchSummary, setSearchSummary] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchItems, setSearchItems] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchSummaryData();
    fetchItemsData();
  }, []);

  const fetchSummaryData = async () => {
    setLoadingPos(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get('/api/reports/po-summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPos(res.data);
    } catch (err) {
      console.error('Error fetching reports PO summary:', err);
    } finally {
      setLoadingPos(false);
    }
  };

  const fetchItemsData = async () => {
    setLoadingItems(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get('/api/reports/items', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(res.data);
    } catch (err) {
      console.error('Error fetching reports line items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Helper formatting functions
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

  // Helper status determination
  const getPOStatus = (po) => {
    const poValue = Number(po.po_value) || 0;
    const suppliedValue = Number(po.supplied_value) || 0;
    const invoiceAmount = Number(po.invoice_amount) || 0;
    const receivedAmount = Number(po.received_amount) || 0;
    
    const toBeSupplied = Math.max(0, poValue - suppliedValue);
    const toBeInvoiced = Number(po.to_be_invoiced_value) || 0;
    const outstandingAR = Math.max(0, invoiceAmount - receivedAmount);

    if (outstandingAR === 0 && invoiceAmount > 0) return { label: 'Fully Paid', color: '#10B981', bg: '#ECFDF5' };
    if (outstandingAR > 0) return { label: 'Outstanding AR', color: '#EF4444', bg: '#FEF2F2' };
    if (toBeInvoiced > 0) return { label: 'Pending Invoice', color: '#F59E0B', bg: '#FFFBEB' };
    if (toBeSupplied === 0 && suppliedValue > 0) return { label: 'Fully Supplied', color: '#3B82F6', bg: '#EFF6FF' };
    if (toBeSupplied > 0) return { label: 'Pending Supply', color: '#6366F1', bg: '#EEF2FF' };
    return { label: 'Active', color: '#6B7280', bg: '#F9FAFB' };
  };

  // Scoped lists
  const filteredPOs = useMemo(() => {
    return pos.filter(po => {
      const matchSearch =
        (po.po_number || '').toLowerCase().includes(searchSummary.toLowerCase()) ||
        (po.customer_name || '').toLowerCase().includes(searchSummary.toLowerCase());

      const status = getPOStatus(po);
      let matchFilter = true;
      if (statusFilter !== 'all') {
        matchFilter = status.label.toLowerCase().replace(' ', '_') === statusFilter;
      }

      return matchSearch && matchFilter;
    });
  }, [pos, searchSummary, statusFilter]);

  const filteredItems = useMemo(() => {
    if (!selectedPo) return [];
    return items.filter(it => {
      const matchSearch =
        (it.item_name || '').toLowerCase().includes(searchItems.toLowerCase()) ||
        (it.package_name || '').toLowerCase().includes(searchItems.toLowerCase()) ||
        (it.description || '').toLowerCase().includes(searchItems.toLowerCase());

      const matchPo = it.po_id === selectedPo.id;
      return matchSearch && matchPo;
    });
  }, [items, searchItems, selectedPo]);

  return (
    <div className="screen-enter" style={{ padding: '0 0 16px 0', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px', marginTop: '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} className="btn-ghost btn-back" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title" style={{ fontSize: '1.25rem', margin: 0 }}>Reports</h1>
            <p className="page-header__subtitle" style={{ fontSize: '0.85rem', margin: 0 }}>Unified Material Status & Financial Ledger Reports</p>
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: '16px', gap: '8px' }}>
        <button
          onClick={() => {
            setActiveTab('summary');
          }}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'summary' ? '2.5px solid #3B82F6' : '2.5px solid transparent',
            color: activeTab === 'summary' ? '#3B82F6' : '#64748B',
            fontWeight: activeTab === 'summary' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
        >
          Sales Order Summary
        </button>
        
        {/* Render Tab 2 ONLY when a specific SO is clicked */}
        {selectedPo && (
          <button
            onClick={() => setActiveTab('items')}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'items' ? '2.5px solid #3B82F6' : '2.5px solid transparent',
              color: activeTab === 'items' ? '#3B82F6' : '#64748B',
              fontWeight: activeTab === 'items' ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none'
            }}
          >
            Line Item Details ({selectedPo.po_number})
          </button>
        )}
      </div>

      {/* TAB 1: Sales Order Summary */}
      {activeTab === 'summary' && (
        <div>
          {/* Filters Panel */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            background: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            border: '1px solid #E5E7EB'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '16px' }}>search</span>
                <input
                  type="text"
                  placeholder="Search by SO # or Customer Name..."
                  value={searchSummary}
                  onChange={(e) => setSearchSummary(e.target.value)}
                  style={{
                    width: '100%',
                    height: '32px',
                    padding: '0 10px 0 32px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  background: 'white',
                  outline: 'none',
                  minWidth: '150px'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="pending_supply">Pending Supply</option>
                <option value="fully_supplied">Fully Supplied</option>
                <option value="pending_invoice">Pending Invoice</option>
                <option value="outstanding_ar">Outstanding AR</option>
                <option value="fully_paid">Fully Paid</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {loadingPos ? (
              <div style={{ padding: '60px 0', textRendering: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>Loading PO Summary Data...</span>
              </div>
            ) : filteredPOs.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                No matching sales orders found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', height: '40px' }}>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', width: '40px' }}>Sl</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155' }}>SO Number</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155' }}>Customer Name</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155' }}>SO Date</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>SO Value</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>Supplied Value</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>Pending Supply</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>Invoiced Amount</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>To Be Invoiced</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>Received Amount</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textRendering: 'right', textAlign: 'right' }}>Outstanding AR</th>
                      <th style={{ padding: '0 12px', fontWeight: 600, color: '#334155', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPOs.map((po, index) => {
                      const poValue = Number(po.po_value) || 0;
                      const suppliedValue = Number(po.supplied_value) || 0;
                      const invoiceAmount = Number(po.invoice_amount) || 0;
                      const receivedAmount = Number(po.received_amount) || 0;
                      const status = getPOStatus(po);
                      
                      const toBeSupplied = Math.max(0, poValue - suppliedValue);
                      const toBeInvoiced = Number(po.to_be_invoiced_value) || 0;
                      const outstandingAR = Math.max(0, invoiceAmount - receivedAmount);

                      return (
                        <tr key={po.id} style={{ borderBottom: '1px solid #F1F5F9', height: '36px', transition: 'background-color 0.15s ease' }} className="hover-bg">
                          <td style={{ padding: '0 12px', color: '#64748B', fontWeight: 500 }}>{index + 1}</td>
                          <td style={{ padding: '0 12px', fontWeight: 600, color: '#0F172A' }}>
                            <span 
                              onClick={() => {
                                // Select this PO and switch tabs!
                                setSelectedPo(po);
                                setActiveTab('items');
                              }}
                              style={{ color: '#2563EB', cursor: 'pointer', textDecoration: 'underline' }}
                              title="Click to view line items"
                            >
                              {po.po_number}
                            </span>
                          </td>
                          <td style={{ padding: '0 12px', color: '#334155' }}>{po.customer_name}</td>
                          <td style={{ padding: '0 12px', color: '#475569' }}>{formatDate(po.po_date)}</td>
                          
                          <td style={{ padding: '0 12px', textAlign: 'right', fontWeight: 600, color: '#0F172A' }}>{formatCurrency(poValue)}</td>
                          <td style={{ padding: '0 12px', textAlign: 'right', color: '#2563EB' }}>{formatCurrency(suppliedValue)}</td>
                          <td style={{ padding: '0 12px', textAlign: 'right', color: toBeSupplied > 0 ? '#EF4444' : '#64748B' }}>{formatCurrency(toBeSupplied)}</td>
                          
                          <td style={{ padding: '0 12px', textAlign: 'right', color: '#D97706' }}>{formatCurrency(invoiceAmount)}</td>
                          <td style={{ padding: '0 12px', textAlign: 'right', color: toBeInvoiced > 0 ? '#B45309' : '#64748B' }}>{formatCurrency(toBeInvoiced)}</td>
                          <td style={{ padding: '0 12px', textAlign: 'right', color: '#10B981' }}>{formatCurrency(receivedAmount)}</td>
                          <td style={{ padding: '0 12px', textAlign: 'right', fontWeight: 700, color: outstandingAR > 0 ? '#DC2626' : '#059669' }}>{formatCurrency(outstandingAR)}</td>
                          
                          <td style={{ padding: '0 12px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: status.color,
                              background: status.bg
                            }}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Line Item Details */}
      {activeTab === 'items' && selectedPo && (
        <div>
          {/* Active PO Info Box & Actions */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="material-symbols-outlined" style={{ color: '#3B82F6', fontSize: '18px' }}>description</span>
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{selectedPo.po_number}</span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '9px',
                  fontWeight: 600,
                  color: getPOStatus(selectedPo).color,
                  background: getPOStatus(selectedPo).bg
                }}>
                  {getPOStatus(selectedPo).label}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontWeight: 500 }}>
                Customer: <span style={{ color: '#0F172A', fontWeight: 600 }}>{selectedPo.customer_name}</span> | Date: {formatDate(selectedPo.po_date)} | Value: {formatCurrency(Number(selectedPo.po_value))}
              </p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '250px' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '14px' }}>search</span>
                <input
                  type="text"
                  placeholder="Filter items in this SO..."
                  value={searchItems}
                  onChange={(e) => setSearchItems(e.target.value)}
                  style={{
                    width: '100%',
                    height: '32px',
                    padding: '0 8px 0 28px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '11px',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                onClick={() => {
                  setSelectedPo(null);
                  setActiveTab('summary');
                }}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  background: '#64748B',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>arrow_back</span>
                Back to Summary
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {loadingItems ? (
              <div style={{ padding: '60px 0', textRendering: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>Loading Item Ledger Details...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                No line items found matching filter criteria.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', height: '40px' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #E2E8F0', width: '35px' }}>Sl</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #E2E8F0' }}>Package</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #E2E8F0', minWidth: '180px' }}>Item Name</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #E2E8F0', width: '50px' }}>UOM</th>
                      
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#065f46', background: '#ECFDF5', borderBottom: '1px solid #D1D5DB', textAlign: 'right' }}>Supply Qty</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#065f46', background: '#ECFDF5', borderBottom: '1px solid #D1D5DB', textAlign: 'right' }}>Supply Rate</th>
                      
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#1e40af', background: '#EFF6FF', borderBottom: '1px solid #D1D5DB', textAlign: 'right' }}>Service Qty</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#1e40af', background: '#EFF6FF', borderBottom: '1px solid #D1D5DB', textAlign: 'right' }}>Service Rate</th>
                      
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#3730a3', background: '#EEF2FF', borderBottom: '1px solid #CBD5E1', textAlign: 'right' }}>Delivered</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#3730a3', background: '#EEF2FF', borderBottom: '1px solid #CBD5E1', textAlign: 'right' }}>Invoiced</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, color: '#9d174d', background: '#FDF2F8', borderBottom: '1px solid #FBCFE8', textAlign: 'right' }}>Pending</th>
                      
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>Taxable Val</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>GST Val</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#059669', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, idx) => {
                      const totalQty = (Number(it.supply_qty) || 0) + (Number(it.service_qty) || 0);
                      const delivered = Number(it.qty_delivered) || 0;
                      const invoiced = Number(it.qty_invoiced) || 0;
                      
                      // Calculate pending based on which qty is filled
                      const originalQty = it.supply_qty > 0 ? it.supply_qty : it.service_qty;
                      const pending = Math.max(0, originalQty - delivered);

                      return (
                        <tr key={it.id} style={{ borderBottom: '1px solid #F1F5F9', height: '32px' }} className="hover-bg">
                          <td style={{ padding: '8px 10px', color: '#64748B' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px', color: '#64748B' }}>{it.package_name || 'General'}</td>
                          <td style={{ padding: '8px 10px', color: '#0F172A', fontWeight: 600 }}>{it.item_name}</td>
                          <td style={{ padding: '8px 10px', color: '#64748B', textRendering: 'center' }}>{it.uom || 'N/A'}</td>
                          
                          <td style={{ padding: '8px 10px', background: '#ECFDF550', textAlign: 'right', fontWeight: 500 }}>{it.supply_qty || '-'}</td>
                          <td style={{ padding: '8px 10px', background: '#ECFDF550', textAlign: 'right', color: it.supply_qty > 0 ? '#0F172A' : '#64748B' }}>{it.supply_qty > 0 ? formatCurrency(it.supply_rate) : '-'}</td>
                          
                          <td style={{ padding: '8px 10px', background: '#EFF6FF50', textAlign: 'right', fontWeight: 500 }}>{it.service_qty || '-'}</td>
                          <td style={{ padding: '8px 10px', background: '#EFF6FF50', textAlign: 'right', color: it.service_qty > 0 ? '#0F172A' : '#64748B' }}>{it.service_qty > 0 ? formatCurrency(it.service_rate) : '-'}</td>
                          
                          <td style={{ padding: '8px 10px', background: '#EEF2FF50', textAlign: 'right', fontWeight: 700, color: '#4F46E5' }}>{delivered}</td>
                          <td style={{ padding: '8px 10px', background: '#EEF2FF50', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>{invoiced}</td>
                          <td style={{ padding: '8px 10px', background: '#FDF2F850', textAlign: 'right', fontWeight: 800, color: pending > 0 ? '#DB2777' : '#9CA3AF' }}>{pending}</td>
                          
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{formatCurrency(it.total_taxable)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{formatCurrency(it.total_gst)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#F0FDF450' }}>{formatCurrency(it.total_invoice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
