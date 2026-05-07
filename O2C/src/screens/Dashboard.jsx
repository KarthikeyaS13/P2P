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

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        // Parallel fetch for speed
        const [dashRes, dcRes] = await Promise.all([
          axios.get('http://localhost:3000/api/dashboard', { headers }),
          axios.get('http://localhost:3000/api/dc', { headers })
        ]);

        setData(dashRes.data);
        setLogistics(dcRes.data.filter(d => ['ready_for_dispatch', 'in_transit', 'delivery_confirmed'].includes(d.status) || d.delivery_status === 'awaiting_site_confirmation'));
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
  }, []);

  if (loading) {
    return (
      <div className="screen-enter" id="dashboard-container">
        <div className="page-header">
          <div>
            <h1 className="text-h1 page-header__title">Executive Dashboard</h1>
            <p className="page-header__subtitle">High-level pipeline overview for the current fiscal cycle.</p>
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

        <div className="sales-cards-grid">
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/po-review')}>
            <div className="feature-card__icon" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
              <span className="material-symbols-outlined">rate_review</span>
            </div>
            <h3 className="feature-card__title">PO Review</h3>
            <p className="feature-card__description">Verify and approve incoming Purchase Orders.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/raise-dc')}>
            <div className="feature-card__icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <span className="material-symbols-outlined">verified</span>
            </div>
            <h3 className="feature-card__title">Raise DC</h3>
            <p className="feature-card__description">Formally issue and sign off on approved delivery challans.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/purchase-orders')}>
            <div className="feature-card__icon" style={{ background: '#FFF7ED', color: '#F97316' }}>
              <span className="material-symbols-outlined">assignment_turned_in</span>
            </div>
            <h3 className="feature-card__title">Close DC</h3>
            <p className="feature-card__description">Finalize and close completed delivery challans.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-4" onClick={() => navigate('/analytics')}>
            <div className="feature-card__icon" style={{ background: '#F5F3FF', color: '#8B5CF6' }}>
              <span className="material-symbols-outlined">monitoring</span>
            </div>
            <h3 className="feature-card__title">Reports</h3>
            <p className="feature-card__description">Analyze financial performance and tax data.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-5" onClick={() => navigate('/new-invoice')}>
            <div className="feature-card__icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              <span className="material-symbols-outlined">receipt_long</span>
            </div>
            {/* <h3 className="feature-card__title">Raise Invoice</h3> */}
            <p className="feature-card__description">Generate tax invoices against dispatched items.</p>
            {data?.stats?.pending_invoice_requests > 0 && (
              <span className="badge badge--warn" style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '10px' }}>
                {data.stats.pending_invoice_requests} Pending Requests
              </span>
            )}
          </div>

          <div className="feature-card animate-fade animate-stagger-6" onClick={() => navigate('/ar-database')}>
            <div className="feature-card__icon" style={{ background: '#F0F9FF', color: '#0EA5E9' }}>
              <span className="material-symbols-outlined">account_balance_wallet</span>
            </div>
            <h3 className="feature-card__title">Close Invoice</h3>
            <p className="feature-card__description">Reconcile payments and close open invoices.</p>
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

        <div className="sales-cards-grid">
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/new-po')}>
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">add_shopping_cart</span>
            </div>
            <h3 className="feature-card__title">New PO</h3>
            <p className="feature-card__description">Create and upload a new standard Purchase Order.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/new-nt-po')}>
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">post_add</span>
            </div>
            <h3 className="feature-card__title">New NT PO</h3>
            <p className="feature-card__description">Initiate a Non-Tendered/Internal Purchase Order.</p>
          </div>
          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/invoice-request')}>
            <div className="feature-card__icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
              <span className="material-symbols-outlined">receipt_long</span>
            </div>
            <h3 className="feature-card__title">Request Invoice</h3>
            <p className="feature-card__description">Request financial invoice generation for delivered items.</p>
            {data?.stats?.pending_invoice_requests > 0 && (
              <span className="badge badge--warn" style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '10px' }}>
                {data.stats.pending_invoice_requests} Pending
              </span>
            )}
          </div>

          <div className="feature-card animate-fade animate-stagger-4" onClick={() => navigate('/edit-po')}>
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">edit_document</span>
            </div>
            <h3 className="feature-card__title">Edit PO</h3>
            <p className="feature-card__description">Modify existing PO details</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-5" onClick={() => navigate('/analytics')}>
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">assessment</span>
            </div>
            <h3 className="feature-card__title">Reports</h3>
            <p className="feature-card__description">View sales performance and order lifecycle analytics.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-6" onClick={() => navigate('/projects')}>
            <div className="feature-card__icon" style={{ background: '#F0F9FF', color: '#0EA5E9' }}>
              <span className="material-symbols-outlined">location_on</span>
            </div>
            <h3 className="feature-card__title">Projects</h3>
            <p className="feature-card__description">Manage site delivery acknowledgements and site coordination.</p>
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
            <h1 className="text-h1 page-header__title">Stores Dashboard</h1>
            <p className="page-header__subtitle">Manage inventory dispatch and delivery challan fulfillment.</p>
          </div>
        </div>

        <div className="sales-cards-grid" style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="feature-card animate-fade animate-stagger-1" onClick={() => navigate('/dc-request')}>
            <div className="feature-card__icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <span className="material-symbols-outlined">add_task</span>
            </div>
            <h3 className="feature-card__title">Create DC Request</h3>
            <p className="feature-card__description">Request material dispatch for approved Purchase Orders.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-2" onClick={() => navigate('/dispatch-confirmation')}>
            <div className="feature-card__icon" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
              <span className="material-symbols-outlined">local_shipping</span>
            </div>
            <h3 className="feature-card__title">Confirm Dispatch</h3>
            <p className="feature-card__description">Pack materials and assign vehicle for approved DCs.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/analytics')}>
            <div className="feature-card__icon" style={{ background: '#F5F3FF', color: '#8B5CF6' }}>
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
            <h3 className="feature-card__title">Reports</h3>
            <p className="feature-card__description">View dispatch history and fulfillment analytics.</p>
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

      <div className="stats-grid">
        <div className="stat-card animate-fade animate-stagger-1">
          <p className="stat-card__label">Active POs</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.active_pos}</span>
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-2">
          <p className="stat-card__label">Pending PO Review</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.pending_pos}</span>
            {data.stats.pending_pos > 0 && <span className="stat-card__trend stat-card__trend--warn">Needs Attention</span>}
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-3">
          <p className="stat-card__label">Pending DC Requests</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.pending_dcs}</span>
            {data.stats.pending_dcs > 0 && <span className="stat-card__trend stat-card__trend--warn">Needs Dispatch</span>}
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-4">
          <p className="stat-card__label">Pending Invoice Requests</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.pending_invoice_requests || 0}</span>
            {data.stats.pending_invoice_requests > 0 && <span className="stat-card__trend stat-card__trend--success">Ready to Invoice</span>}
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-5">
          <p className="stat-card__label">Total Customers</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.total_customers}</span>
          </div>
        </div>
      </div>

      <div className="grid-2-1" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="card card--padded animate-fade animate-stagger-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
            <h3 className="text-h3">Recent Purchase Orders</h3>
          </div>
          {data.recent_pos.length === 0 ? (
            <p style={{ color: 'var(--secondary)' }}>No recent POs.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>PO Number</th><th>Customer</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.recent_pos.map((po, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 500, color: 'var(--primary)' }}>{po.po_number || '-'}</td>
                    <td>{po.customer_name}</td>
                    <td>
                      <span className={`badge badge--${po.status.replace('_', '-')}`}>
                        <span className="badge__dot"></span>{po.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card card--dark card--padded animate-fade animate-stagger-3" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="card__circle"></div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h3 className="text-h3" style={{ color: '#fff', marginBottom: '8px' }}>System Health</h3>
            <p style={{ fontSize: '0.9286rem', opacity: 0.8, marginBottom: 'var(--space-lg)' }}>All O2C modules operational. 99.7% uptime this month.</p>
            <p style={{ fontSize: '0.9286rem', opacity: 0.8, marginBottom: 'var(--space-lg)' }}>
              <strong>{data.stats.pending_pos}</strong> POs pending review.<br />
              <strong>{data.stats.pending_dcs}</strong> DC requests pending dispatch.
            </p>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <button className="btn btn-white btn-sm" style={{ width: '100%' }} onClick={() => navigate('/po-review')}>
              Review PO Queue →
            </button>
          </div>
        </div>
      </div>

      {!isStores && !isSales && (
        <div className="card data-table-wrapper animate-fade animate-stagger-4">
          <div className="data-table-header">
            <h3 className="text-h3">Recent DC Requests & Tracking</h3>
          </div>
          {data.recent_dcs.length === 0 ? (
            <p style={{ color: 'var(--secondary)', padding: '16px' }}>No recent dispatch requests.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request #</th><th>PO Number</th><th>Date</th><th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_dcs.map((dc, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 500, color: 'var(--primary)' }}>{dc.request_number}</td>
                    <td>{dc.po_number || '-'}</td>
                    <td>{new Date(dc.updated_at).toLocaleDateString()}</td>
                    <td className="text-right">
                      <span className={`badge badge--${dc.status.replace('_', '-')}`}>
                        <span className="badge__dot"></span>{dc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
