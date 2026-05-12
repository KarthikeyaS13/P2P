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

        // Parallel fetch for speed
        const [dashRes, dcRes] = await Promise.all([
          axios.get('http://localhost:5000/api/dashboard', { headers }),
          axios.get('http://localhost:5000/api/dc', { headers })
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
        <div className="stat-card animate-fade animate-stagger-1" onClick={() => handleCardClick('active_pos', 'Active Purchase Orders')} style={{ cursor: 'pointer' }}>
          <p className="stat-card__label">Active POs</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.active_pos}</span>
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-2" onClick={() => handleCardClick('pending_pos', 'Pending PO Review')} style={{ cursor: 'pointer' }}>
          <p className="stat-card__label">Pending PO Review</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.pending_pos}</span>
            {data.stats.pending_pos > 0 && <span className="stat-card__trend stat-card__trend--warn">Needs Attention</span>}
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-3" onClick={() => handleCardClick('pending_dcs', 'Pending DC Requests')} style={{ cursor: 'pointer' }}>
          <p className="stat-card__label">Pending DC Requests</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.pending_dcs}</span>
            {data.stats.pending_dcs > 0 && <span className="stat-card__trend stat-card__trend--warn">Needs Dispatch</span>}
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-4" onClick={() => handleCardClick('pending_invoice_requests', 'Pending Invoice Requests')} style={{ cursor: 'pointer' }}>
          <p className="stat-card__label">Pending Invoice Requests</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.pending_invoice_requests || 0}</span>
            {data.stats.pending_invoice_requests > 0 && <span className="stat-card__trend stat-card__trend--success">Ready to Invoice</span>}
          </div>
        </div>
        <div className="stat-card animate-fade animate-stagger-5" onClick={() => handleCardClick('total_customers', 'Registered Customers')} style={{ cursor: 'pointer' }}>
          <p className="stat-card__label">Total Customers</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-card__value">{data.stats.total_customers}</span>
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
                              <td className="text-right" style={{ fontWeight: 600 }}>₹{item.grand_total?.toLocaleString('en-IN')}</td>
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
                              <td>{new Date(item.created_at).toLocaleDateString()}</td>
                            </>
                          )}
                          {summaryConfig.type === 'pending_invoice_requests' && (
                            <>
                              <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.dc_number}</td>
                              <td>{item.customer_name}</td>
                              <td>{item.po_no}</td>
                              <td>{new Date(item.created_at).toLocaleDateString()}</td>
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
