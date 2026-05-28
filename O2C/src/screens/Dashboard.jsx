import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [logistics, setLogistics] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSales = user?.role?.toLowerCase() === 'sales';
  const isAccounts = user?.role?.toLowerCase() === 'accounts';
  const isStores = user?.role?.toLowerCase() === 'stores';
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const [masterAddressCount, setMasterAddressCount] = useState(0);
  const [poFlowCount, setPoFlowCount] = useState(0);
  const [summaryConfig, setSummaryConfig] = useState(null);
  const [summaryData, setSummaryData] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const handleCardClick = async (type, title) => {
    setSummaryConfig({ type, title });
    setSummaryLoading(true);
    setSummaryData([]);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      let res;
      if (type === 'active_pos') {
        res = await axios.get('/api/pos', { headers });
        setSummaryData(res.data.filter(p => !['rejected', 'invoice_closed'].includes(p.status)));
      } else if (type === 'pending_pos') {
        res = await axios.get('/api/pos', { headers });
        setSummaryData(res.data.filter(p => p.status === 'pending' || p.status === 'nt_created'));
      } else if (type === 'pending_dcs') {
        res = await axios.get('/api/dc-requests?status=dc_requested', { headers });
        setSummaryData(res.data);
      } else if (type === 'pending_invoice_requests') {
        res = await axios.get('/api/dc', { headers });
        setSummaryData(res.data.filter(d => d.delivery_status === 'delivery_confirmed'));
      } else if (type === 'pending_regular_pos') {
        res = await axios.get('/api/pos', { headers });
        setSummaryData(res.data.filter(p => p.is_nt_po === 0 && ['pending', 'rejected'].includes(p.status)));
      } else if (type === 'pending_nt_pos') {
        res = await axios.get('/api/pos', { headers });
        setSummaryData(res.data.filter(p => p.is_nt_po === 1 && ['nt_created', 'rejected'].includes(p.status)));
      } else if (type === 'total_customers') {
        res = await axios.get('/api/customers', { headers });
        setSummaryData(res.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const renderSummaryModal = () => {
    if (!summaryConfig) return null;
    return (
      <div className="summary-modal-overlay" onClick={() => setSummaryConfig(null)}>
        <div className="summary-modal-content" onClick={e => e.stopPropagation()}>
          <div className="summary-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 className="text-h2" style={{ margin: 0, fontSize: '1.15rem', color: '#1e3a8a', fontWeight: 700 }}>{summaryConfig.title}</h2>
            <button className="btn-ghost" onClick={() => setSummaryConfig(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#64748b' }}>close</span>
            </button>
          </div>
          <div className="summary-modal-body" style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
            {summaryLoading ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Loading summary data...</p>
              </div>
            ) : summaryData.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--secondary)' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>No items found in this category.</p>
              </div>
            ) : (
              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    {summaryConfig.type.includes('pos') && (
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Sales Order Number</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Customer</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Status</th>
                        <th className="text-right" style={{ textAlign: 'right', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Total</th>
                      </tr>
                    )}
                    {summaryConfig.type === 'pending_dcs' && (
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Request Number</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Customer</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Sales Order Number</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Date</th>
                      </tr>
                    )}
                    {summaryConfig.type === 'pending_invoice_requests' && (
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Dispatch Date</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Delivery Challan Number</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Manual DC</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Vehicle No</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Status</th>
                        <th className="text-right" style={{ textAlign: 'right', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Qty</th>
                        <th className="text-right" style={{ textAlign: 'right', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Value</th>
                      </tr>
                    )}
                    {summaryConfig.type === 'total_customers' && (
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Customer Name</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Code</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>Location Count</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {summaryData.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        {summaryConfig.type.includes('pos') && (
                          <>
                            <td style={{ fontWeight: 600, color: '#3b82f6', padding: '6px 10px', fontSize: '12px' }}>{item.po_number}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.customer_name}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px' }}>
                              <span className={`badge badge--${item.status?.replace('_', '-')}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                                <span className="badge__dot"></span>{item.status}
                              </span>
                            </td>
                            <td className="text-right" style={{ fontWeight: 600, textAlign: 'right', padding: '6px 10px', fontSize: '12px', color: '#334155' }}>₹{item.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </>
                        )}
                        {summaryConfig.type === 'pending_dcs' && (
                          <>
                            <td style={{ fontWeight: 600, color: '#3b82f6', padding: '6px 10px', fontSize: '12px', textAlign: 'left' }}>{item.dc_request_no || item.requested_dc_number || '-'}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155', textAlign: 'left' }}>{item.customer_name || '-'}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155', textAlign: 'left' }}>{item.po_no || '-'}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', textAlign: 'left' }}>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: '#fef9c3',
                                color: '#854d0e',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                textTransform: 'uppercase',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#854d0e' }}></span>
                                {item.status?.replace('_', ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155', textAlign: 'left' }}>{new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                          </>
                        )}
                        {summaryConfig.type === 'pending_invoice_requests' && (
                          <>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.dispatch_date ? new Date(item.dispatch_date).toLocaleDateString('en-IN') : '-'}</td>
                            <td style={{ fontWeight: 700, color: '#0369a1', padding: '6px 10px', fontSize: '12px' }}>{item.dc_number}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.manual_dc_number || '-'}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.vehicle_no || item.vehicle_number || '-'}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px' }}>
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                background: item.status === 'delivered' || item.delivery_status === 'delivered' || item.delivery_status === 'delivery_confirmed' ? '#dcfce7' : '#fef9c3',
                                color: item.status === 'delivered' || item.delivery_status === 'delivered' || item.delivery_status === 'delivery_confirmed' ? '#166534' : '#854d0e',
                                padding: '1px 6px',
                                borderRadius: '12px',
                                textTransform: 'uppercase'
                              }}>
                                {item.delivery_status || item.status}
                              </span>
                            </td>
                            <td className="text-right" style={{ fontWeight: 600, textAlign: 'right', padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.total_qty}</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#0369a1', textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}>
                              ₹{item.total_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </>
                        )}
                        {summaryConfig.type === 'total_customers' && (
                          <>
                            <td style={{ fontWeight: 600, color: '#3b82f6', padding: '6px 10px', fontSize: '12px' }}>{item.name}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.cust_code}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#334155' }}>{item.location_count || 0} Locations</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summaryConfig.type === 'pending_invoice_requests' && (
                  <div style={{ padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', marginTop: '10px', borderRadius: '0 0 6px 6px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', marginRight: '8px' }}>Total Pending Value:</span>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#0369a1' }}>
                        ₹{summaryData.reduce((acc, curr) => acc + (Number(curr.total_value) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <style>{`
          .summary-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            backdrop-filter: blur(2px);
            animation: fadeIn 0.15s ease-out;
          }
          .summary-modal-content {
            background: white;
            width: 90%;
            max-width: 750px;
            max-height: 80vh;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            animation: scaleIn 0.15s ease-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scaleIn {
            from { transform: scale(0.97); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const userRole = user?.role?.toLowerCase();

        // Parallel fetch for speed
        const [dashRes, dcRes] = await Promise.all([
          axios.get('/api/dashboard', { headers }),
          axios.get('/api/dc', { headers })
        ]);

        setData(dashRes.data);
        setLogistics(dcRes.data.filter(d => ['ready_for_dispatch', 'in_transit', 'delivery_confirmed'].includes(d.status) || d.delivery_status === 'awaiting_site_confirmation'));

        if (userRole === 'admin') {
          try {
            const [addrRes, poFlowRes] = await Promise.all([
              axios.get('/api/master-addresses', { headers }),
              axios.get('/api/po-flow', { headers })
            ]);
            setMasterAddressCount(addrRes.data?.length || 0);
            setPoFlowCount(poFlowRes.data?.length || 0);
          } catch (adminErr) {
            console.error('Failed to load admin stats:', adminErr);
          }
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();

    // Clear drafts when landing on dashboard to ensure "New Sales Order" starts fresh
    sessionStorage.removeItem('new_po_draft');
    sessionStorage.removeItem('new_nt_po_draft');
  }, [user]);

  if (loading) {
    const userRole = user?.role?.toLowerCase();
    const loadingTitle = userRole === 'admin' ? "Dashboard" : "Executive Dashboard";
    const loadingSubtitle = userRole === 'admin' ? "Configure master tables, customers, and PO flow rules." : "High-level pipeline overview for the current fiscal cycle.";
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">{loadingTitle}</h1>
            <p className="page-header__subtitle">{loadingSubtitle}</p>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--secondary)' }}>Loading dashboard data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div style={{ color: 'var(--error)', padding: '24px', textAlign: 'center' }}>Error loading dashboard: {error}</div>
      </div>
    );
  }

  if (isAccounts) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">Accounts Command Center</h1>
            <p className="page-header__subtitle">Manage procurement verification and financial processing.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '24px' }}>
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/po-review')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sales Order Review</span>
              <div className="feature-card__icon" style={{ background: '#EEF2FF', color: '#4F46E5', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>rate_review</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {data?.stats?.pending_pos ?? 0}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Pending PO approvals</p>
            </div>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/raise-dc')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Raise Delivery Challan</span>
              <div className="feature-card__icon" style={{ background: '#ECFDF5', color: '#10B981', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>verified</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {data?.stats?.pending_dcs ?? 0}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>DCs ready to be issued</p>
            </div>
          </div>

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/purchase-orders')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Close DC</span>
              <div className="feature-card__icon" style={{ background: '#FFF7ED', color: '#F97316', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>assignment_turned_in</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {data?.stats?.pending_invoice_requests ?? 0}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Completed dispatches awaiting invoice</p>
            </div>
          </div>

          <div className="feature-card animate-fade animate-stagger-4" onClick={() => navigate('/ar-database')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Close Invoice</span>
              <div className="feature-card__icon" style={{ background: '#F0F9FF', color: '#0EA5E9', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_balance_wallet</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {data?.stats?.pending_ar ?? 0}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Pending AR reconciliations</p>
            </div>
          </div>
        </div>
        {renderSummaryModal()}
      </div>
    );
  }

  if (isSales) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">Sales Dashboard</h1>
            <p className="page-header__subtitle">Welcome back, {user.name}. What would you like to do today?</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '24px' }}>
          {/* Column 1: Sales Order Operations (Vertical Column) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/new-po')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>New Sales Order</span>
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick('pending_regular_pos', 'Pending Standard Sales Orders');
                  }}
                  title="View pending standard sales orders"
                  style={{
                    background: '#EEF2FF',
                    color: '#4F46E5',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: '1px solid #C7D2FE',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#4F46E5';
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#EEF2FF';
                    e.currentTarget.style.color = '#4F46E5';
                  }}
                >
                  {data?.stats?.pending_regular_pos ?? 0} Pending
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#6B7280', lineHeight: '1.4' }}>Create and upload a new standard Sales Order.</p>
            </div>
 
            <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/new-nt-po')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>New NT Sales Order</span>
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick('pending_nt_pos', 'Pending NT Sales Orders');
                  }}
                  title="View pending NT sales orders"
                  style={{
                    background: '#F5F3FF',
                    color: '#8B5CF6',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: '1px solid #DDD6FE',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#8B5CF6';
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#F5F3FF';
                    e.currentTarget.style.color = '#8B5CF6';
                  }}
                >
                  {data?.stats?.pending_nt_pos ?? 0} Pending
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#6B7280', lineHeight: '1.4' }}>Initiate a Non-Tendered/Internal Sales Order.</p>
            </div>

            <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/edit-po')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Edit Sales Order</span>
                <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#ECFDF5', color: '#10B981' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit_document</span>
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#6B7280', lineHeight: '1.4' }}>Modify existing Sales Order details.</p>
            </div>
          </div>

          {/* Column 2: Invoicing & Financials */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="feature-card animate-fade animate-stagger-4" onClick={() => navigate('/invoice-request')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Request Invoice</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {data?.stats?.pending_invoice_requests > 0 && (
                    <span className="badge badge--warn" style={{ fontSize: '10px', padding: '2px 6px', margin: 0, position: 'static' }}>
                      {data.stats.pending_invoice_requests} Pending
                    </span>
                  )}
                  <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#FEF3C7', color: '#D97706' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>receipt_long</span>
                  </div>
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#6B7280', lineHeight: '1.4' }}>Request financial invoice generation for delivered items.</p>
            </div>
          </div>

          {/* Column 3: Reserved for Future Expansion / Extra Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Any future dashboard cards can be dropped directly into this 3rd column */}
          </div>
        </div>
        {renderSummaryModal()}
      </div>
    );
  }

  if (isStores) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title" style={{ fontSize: '24px' }}>Stores Dashboard</h1>
            <p className="page-header__subtitle">Manage inventory dispatch and delivery challan fulfillment.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '24px' }}>
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/dc-request')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Create Delivery Challan Request</span>
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick('pending_dcs', 'Pending Delivery Challan Requests');
                }}
                title="View pending delivery challan requests"
                style={{
                  background: '#ECFDF5',
                  color: '#10B981',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: '1px solid #A7F3D0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#10B981';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ECFDF5';
                  e.currentTarget.style.color = '#10B981';
                }}
              >
                {data?.stats?.pending_dcs ?? 0} Pending
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Request material dispatch for approved Sales Orders.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/dispatch-confirmation')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Confirm Dispatch</span>
              <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#EEF2FF', color: '#4F46E5' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Pack materials and assign vehicle for approved DCs.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/analytics')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Reports</span>
              <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#F5F3FF', color: '#8B5CF6' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>inventory_2</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>View dispatch history and fulfillment analytics.</p>
          </div>
        </div>
        {renderSummaryModal()}
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">Dashboard</h1>
            <p className="page-header__subtitle">Configure master tables, customers, and PO flow rules.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '24px' }}>
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/customers')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customers</span>
              <div className="feature-card__icon" style={{ background: '#EEF2FF', color: '#4F46E5', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>group</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {data?.stats?.total_customers ?? 0}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Registered corporate accounts</p>
            </div>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/po-flow')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status of Sales Order</span>
              <div className="feature-card__icon" style={{ background: '#FFF7ED', color: '#F97316', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_tree</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {poFlowCount}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Active order pipeline flows</p>
            </div>
          </div>
        </div>
        {renderSummaryModal()}
      </div>
    );
  }

  return (
    <div className="screen-enter" id="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="text-h1 page-header__title">Executive Dashboard</h1>
          <p className="page-header__subtitle">High-level pipeline overview for the current fiscal cycle.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '24px' }}>
        <div className="stat-card animate-fade animate-stagger-1" onClick={() => handleCardClick('active_pos', 'Active Sales Orders')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Sales Orders</span>
            <div style={{ color: '#4F46E5', background: '#EEF2FF', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_shopping_cart</span>
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
              {data.stats.active_pos}
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Current active orders</p>
          </div>
        </div>

        <div className="stat-card animate-fade animate-stagger-2" onClick={() => handleCardClick('pending_pos', 'Pending Sales Order Review')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Sales Order Review</span>
            <div style={{ color: '#D97706', background: '#FFF7ED', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>rate_review</span>
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{data.stats.pending_pos}</span>
              {data.stats.pending_pos > 0 && <span className="badge badge--warn" style={{ fontSize: '9px', padding: '1px 4px' }}>Needs Attention</span>}
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Awaiting verification</p>
          </div>
        </div>

        <div className="stat-card animate-fade animate-stagger-3" onClick={() => handleCardClick('pending_dcs', 'Pending Delivery Challan Requests')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Delivery Challan Requests</span>
            <div style={{ color: '#10B981', background: '#ECFDF5', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span>
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{data.stats.pending_dcs}</span>
              {data.stats.pending_dcs > 0 && <span className="badge badge--warn" style={{ fontSize: '9px', padding: '1px 4px' }}>Needs Dispatch</span>}
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Awaiting shipment</p>
          </div>
        </div>

        <div className="stat-card animate-fade animate-stagger-4" onClick={() => handleCardClick('pending_invoice_requests', 'Pending Invoice Requests')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Invoice Requests</span>
            <div style={{ color: '#0EA5E9', background: '#F0F9FF', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>receipt_long</span>
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{data.stats.pending_invoice_requests || 0}</span>
              {data.stats.pending_invoice_requests > 0 && <span className="badge badge--success" style={{ fontSize: '9px', padding: '1px 4px' }}>Ready to Invoice</span>}
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Delivered dispatches</p>
          </div>
        </div>

        <div className="stat-card animate-fade animate-stagger-5" onClick={() => handleCardClick('total_customers', 'Registered Customers')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Customers</span>
            <div style={{ color: '#8B5CF6', background: '#F5F3FF', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>group</span>
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
              {data.stats.total_customers}
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Registered corporate accounts</p>
          </div>
        </div>
      </div>
      {renderSummaryModal()}
    </div>
  );
}
