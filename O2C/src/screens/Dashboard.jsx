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
        res = await axios.get('http://localhost:5000/api/pos', { headers });
        setSummaryData(res.data.filter(p => !['rejected', 'invoice_closed'].includes(p.status)));
      } else if (type === 'pending_pos') {
        res = await axios.get('http://localhost:5000/api/pos?status=pending', { headers });
        setSummaryData(res.data);
      } else if (type === 'pending_dcs') {
        res = await axios.get('http://localhost:5000/api/dc', { headers });
        setSummaryData(res.data.filter(d => ['draft', 'raised'].includes(d.status)));
      } else if (type === 'pending_invoice_requests') {
        res = await axios.get('http://localhost:5000/api/dc', { headers });
        setSummaryData(res.data.filter(d => d.delivery_status === 'delivery_confirmed'));
      } else if (type === 'total_customers') {
        res = await axios.get('http://localhost:5000/api/customers', { headers });
        setSummaryData(res.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const userRole = user?.role?.toLowerCase();

        // Parallel fetch for speed
        const [dashRes, dcRes] = await Promise.all([
          axios.get('http://localhost:5000/api/dashboard', { headers }),
          axios.get('http://localhost:5000/api/dc', { headers })
        ]);

        setData(dashRes.data);
        setLogistics(dcRes.data.filter(d => ['ready_for_dispatch', 'in_transit', 'delivery_confirmed'].includes(d.status) || d.delivery_status === 'awaiting_site_confirmation'));

        if (userRole === 'admin') {
          try {
            const [addrRes, poFlowRes] = await Promise.all([
              axios.get('http://localhost:5000/api/master-addresses', { headers }),
              axios.get('http://localhost:5000/api/po-flow', { headers })
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

    // Clear drafts when landing on dashboard to ensure "New PO" starts fresh
    sessionStorage.removeItem('new_po_draft');
    sessionStorage.removeItem('new_nt_po_draft');
  }, [user]);

  if (loading) {
    const userRole = user?.role?.toLowerCase();
    const loadingTitle = userRole === 'admin' ? "Admin Command Center" : "Executive Dashboard";
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
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PO Review</span>
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
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Raise DC</span>
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
      </div>
    );
  }

  if (isSales) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">Sales Command Center</h1>
            <p className="page-header__subtitle">Welcome back, {user.name}. What would you like to do today?</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '24px' }}>
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/new-po')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>New PO</span>
              <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#EEF2FF', color: '#4F46E5' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_shopping_cart</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Create and upload a new standard Purchase Order.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/new-nt-po')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>New NT PO</span>
              <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#F5F3FF', color: '#8B5CF6' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>post_add</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Initiate a Non-Tendered/Internal Purchase Order.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/invoice-request')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Request Invoice</span>
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
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Request financial invoice generation for delivered items.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-4" onClick={() => navigate('/edit-po')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Edit PO</span>
              <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#ECFDF5', color: '#10B981' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit_document</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Modify existing Purchase Order details.</p>
          </div>
        </div>
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
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Create DC Request</span>
              <div className="feature-card__icon" style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#ECFDF5', color: '#10B981' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_task</span>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Request material dispatch for approved Purchase Orders.</p>
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

      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">Admin Command Center</h1>
            <p className="page-header__subtitle">Configure master tables, customers, and PO flow rules.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '24px' }}>
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

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/master-address')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Master Address</span>
              <div className="feature-card__icon" style={{ background: '#ECFDF5', color: '#10B981', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>location_on</span>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
                {masterAddressCount}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>Dispatch and site addresses</p>
            </div>
          </div>

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/po-flow')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PO Flow Management</span>
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
        <div className="stat-card animate-fade animate-stagger-1" onClick={() => handleCardClick('active_pos', 'Active Purchase Orders')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active POs</span>
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

        <div className="stat-card animate-fade animate-stagger-2" onClick={() => handleCardClick('pending_pos', 'Pending PO Review')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending PO Review</span>
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

        <div className="stat-card animate-fade animate-stagger-3" onClick={() => handleCardClick('pending_dcs', 'Pending DC Requests')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', borderRadius: '16px', minHeight: '120px', alignItems: 'stretch', textAlign: 'left', gap: '0px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending DC Requests</span>
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

      {summaryConfig && (
        <div className="summary-modal-overlay" onClick={() => setSummaryConfig(null)}>
          <div className="summary-modal-content" onClick={e => e.stopPropagation()}>
            <div className="summary-modal-header">
              <h2 className="text-h2" style={{ margin: 0 }}>{summaryConfig.title}</h2>
              <button className="btn-ghost" onClick={() => setSummaryConfig(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="summary-modal-body">
              {summaryLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <p>Loading summary data...</p>
                </div>
              ) : summaryData.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--secondary)' }}>
                  <p>No items found in this category.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      {summaryConfig.type.includes('pos') && (
                        <tr><th>PO Number</th><th>Customer</th><th>Status</th><th className="text-right">Total</th></tr>
                      )}
                      {summaryConfig.type === 'pending_dcs' && (
                        <tr><th>DC Number</th><th>PO Number</th><th>Status</th><th>Date</th></tr>
                      )}
                      {summaryConfig.type === 'pending_invoice_requests' && (
                        <tr><th>DC Number</th><th>Customer</th><th>PO Number</th><th>Date</th></tr>
                      )}
                      {summaryConfig.type === 'total_customers' && (
                        <tr><th>Customer Name</th><th>Code</th><th>Location Count</th></tr>
                      )}
                    </thead>
                    <tbody>
                      {summaryData.map((item, idx) => (
                        <tr key={idx}>
                          {summaryConfig.type.includes('pos') && (
                            <>
                              <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.po_number}</td>
                              <td>{item.customer_name}</td>
                              <td>
                                <span className={`badge badge--${item.status?.replace('_', '-')}`}>
                                  <span className="badge__dot"></span>{item.status}
                                </span>
                              </td>
                              <td className="text-right" style={{ fontWeight: 600 }}>₹{item.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </>
                          )}
                          {summaryConfig.type === 'pending_dcs' && (
                            <>
                              <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.dc_number || item.requested_dc_number || '-'}</td>
                              <td>{item.po_no || '-'}</td>
                              <td>
                                <span className={`badge badge--${item.status?.replace('_', '-')}`}>
                                  <span className="badge__dot"></span>{item.status}
                                </span>
                              </td>
                              <td>{new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                            </>
                          )}
                          {summaryConfig.type === 'pending_invoice_requests' && (
                            <>
                              <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.dc_number}</td>
                              <td>{item.customer_name}</td>
                              <td>{item.po_no}</td>
                              <td>{new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                            </>
                          )}
                          {summaryConfig.type === 'total_customers' && (
                            <>
                              <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.name}</td>
                              <td>{item.cust_code}</td>
                              <td>{item.location_count || 0} Locations</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .summary-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease-out;
        }
        .summary-modal-content {
          background: white;
          width: 90%;
          max-width: 900px;
          max-height: 85vh;
          border-radius: var(--radius-xl);
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          animation: scaleIn 0.2s ease-out;
        }
        .summary-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--outline-variant);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .summary-modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
