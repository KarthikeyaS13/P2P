import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';


export default function POManagement() {
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    axios.get('http://localhost:3000/api/pos', { headers })
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        setPOs(data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = pos.filter(p => {
    const matchSearch = 
      (p.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.customer_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = 
      filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status) => {
    const styles = {
      pending: { background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' },
      nt_created: { background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' },
      accepted: { background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' },
      rejected: { background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' },
      dc_raised: { background: '#FED7AA', color: '#92400E', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' },
      invoice_raised: { background: '#EDE9FE', color: '#5B21B6', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' }
    };
    const style = styles[status] || { background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' };
    return <span style={style}>{status.replace('_', ' ').toUpperCase()}</span>;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/dashboard')}
            className="btn-ghost btn-back"
            style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          </button>
          <h2 style={{ margin: 0, color: '#111827' }}>Active Purchase Orders</h2>
        </div>
      </div>

      <div className="responsive-grid responsive-grid--2" style={{ marginBottom: '20px', gap: '15px' }}>
        <input 
          type="text" 
          placeholder="Search PO, customer..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input"
          style={{ width: '100%' }}
        />
        <select 
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-input"
          style={{ width: '100%' }}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="nt_created">NT Created</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="dc_raised">DC Raised</option>
          <option value="invoice_raised">Invoice Raised</option>
        </select>
      </div>

      <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#6B7280' }}>
        {filtered.length} records
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>Loading purchase orders...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280', background: '#F9FAFB', borderRadius: '8px' }}>
          No purchase orders found
        </div>
      ) : (
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#F3F4F6' }}>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>PO Number</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Location</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Value</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #E5E7EB', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>{p.po_number || p.order_id}</td>
                  <td style={{ padding: '12px 16px', color: '#4B5563' }}>{p.customer_name}</td>
                  <td style={{ padding: '12px 16px', color: '#4B5563' }}>{p.location_name}{p.location_city ? `, ${p.location_city}` : ''}</td>
                  <td style={{ padding: '12px 16px', color: '#111827', fontWeight: 500 }}>₹{Number(p.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ padding: '12px 16px', color: '#4B5563' }}>{new Date(p.po_date || p.created_at).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding: '12px 16px' }}>{getStatusBadge(p.status)}</td>
                  <td style={{ padding: '12px 16px', color: '#4B5563' }}>{p.is_nt_po ? 'NT PO' : 'Regular'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button 
                      onClick={() => navigate(`/pos/${p.id}`)}
                      style={{ padding: '6px 12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
