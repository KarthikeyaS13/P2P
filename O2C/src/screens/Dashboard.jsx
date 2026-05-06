import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSales = user?.role?.toLowerCase() === 'sales';

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/dashboard', { headers });
        setData(res.data);
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

          <div className="feature-card animate-fade animate-stagger-3" onClick={() => navigate('/edit-po')}>
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">edit_document</span>
            </div>
            <h3 className="feature-card__title">Edit PO</h3>
            <p className="feature-card__description">Modify existing PO details</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-4" onClick={() => navigate('/analytics')}>
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">assessment</span>
            </div>
            <h3 className="feature-card__title">Reports</h3>
            <p className="feature-card__description">View sales performance and order lifecycle analytics.</p>
          </div>

          <div className="feature-card animate-fade animate-stagger-5">
            <div className="feature-card__icon">
              <span className="material-symbols-outlined">location_on</span>
            </div>
            <h3 className="feature-card__title">Request Customer Location</h3>
            <p className="feature-card__description">Send a request to customers for precise site coordinates.</p>
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

      <div className="card data-table-wrapper animate-fade animate-stagger-4">
        <div className="data-table-header">
          <h3 className="text-h3">Recent Dispatch Requests</h3>
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
    </div>
  );
}
