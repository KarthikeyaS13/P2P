import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PODetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();

  const [po, setPO] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    axios.get(`http://localhost:3000/api/pos/${id}`, { headers })
      .then(res => {
        setPO(res.data);
        setItems(res.data.items || []);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading PO details...</div>;
  if (!po) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Purchase Order not found.</div>;

  const subtotal = po.subtotal || items.reduce((s, i) => s + (i.taxable_value || 0), 0);
  const gstTotal = po.gst_total || items.reduce((s, i) => s + (i.gst_amount || 0), 0);
  const grandTotal = po.grand_total || subtotal + gstTotal;

  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getStatusBadge = (status) => {
    const styles = {
      pending: { background: '#FEF3C7', color: '#92400E', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      nt_created: { background: '#DBEAFE', color: '#1E40AF', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      accepted: { background: '#D1FAE5', color: '#065F46', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      rejected: { background: '#FEE2E2', color: '#991B1B', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      dc_raised: { background: '#FED7AA', color: '#92400E', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      invoice_raised: { background: '#EDE9FE', color: '#5B21B6', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 }
    };
    const style = styles[status] || { background: '#F3F4F6', color: '#374151', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 };
    return <span style={style}>{status.replace('_', ' ').toUpperCase()}</span>;
  };

  const handleAccept = () => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    setActionLoading(true);
    axios.put(`http://localhost:3000/api/pos/${id}/status`, { status: 'accepted' }, { headers })
      .then(() => {
        alert('PO Accepted successfully');
        navigate('/purchase-orders');
      })
      .catch(err => alert('Failed: ' + (err.response?.data?.error || err.message)))
      .finally(() => setActionLoading(false));
  };

  const handleReject = () => {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // User cancelled prompt
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    setActionLoading(true);
    axios.put(`http://localhost:3000/api/pos/${id}/status`, { status: 'rejected' }, { headers })
      .then(() => {
        alert('PO Rejected');
        navigate('/purchase-orders');
      })
      .catch(err => alert('Failed: ' + (err.response?.data?.error || err.message)))
      .finally(() => setActionLoading(false));
  };

  const showActions = (role === 'accounts' || role === 'admin') && (po.status === 'pending' || po.status === 'nt_created');

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* SECTION 1: Header card */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '15px' }}>
        <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          ← Back
        </button>
        <h2 style={{ margin: 0, color: '#111827' }}>PO Details</h2>
        {getStatusBadge(po.status)}
      </div>

      <div style={{ background: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>PO Number:</strong> {po.po_number || po.order_id}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Customer:</strong> {po.customer_name}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Location:</strong> {po.location_name}</p>
          <p style={{ margin: 0, color: '#4B5563' }}><strong style={{ color: '#111827' }}>SPOC:</strong> {po.spoc_name || 'N/A'} {po.spoc_phone ? `(${po.spoc_phone})` : ''}</p>
        </div>
        <div>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>PO Date:</strong> {po.po_date ? new Date(po.po_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Start Date:</strong> {po.start_date ? new Date(po.start_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>End Date:</strong> {po.end_date ? new Date(po.end_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: 0, color: '#4B5563' }}><strong style={{ color: '#111827' }}>Type:</strong> {po.is_nt_po ? 'NT PO' : 'Regular'}</p>
        </div>
      </div>

      {/* SECTION 2: Items table */}
      <h3 style={{ marginTop: 0, color: '#111827' }}>Line Items</h3>
      <div style={{ overflowX: 'auto', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead style={{ background: '#F3F4F6' }}>
            <tr>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>#</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Package</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Item Name</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>Description</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600, textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600, textAlign: 'right' }}>Rate</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600, textAlign: 'right' }}>GST%</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600, textAlign: 'right' }}>Taxable</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600, textAlign: 'right' }}>GST Amt</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 600, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id || idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '12px 16px', color: '#4B5563' }}>{it.line_number || idx + 1}</td>
                <td style={{ padding: '12px 16px', color: '#111827' }}>{it.package_name || '-'}</td>
                <td style={{ padding: '12px 16px', color: '#111827', fontWeight: 500 }}>{it.item_name}</td>
                <td style={{ padding: '12px 16px', color: '#4B5563', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.description}>{it.description || '-'}</td>
                <td style={{ padding: '12px 16px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px' }}>{it.quantity} {it.uom}</td>
                <td style={{ padding: '12px 16px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px' }}>{fmt(it.rate_per_unit)}</td>
                <td style={{ padding: '12px 16px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px' }}>{it.gst_percent}%</td>
                <td style={{ padding: '12px 16px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px' }}>{fmt(it.taxable_value || (it.quantity * it.rate_per_unit))}</td>
                <td style={{ padding: '12px 16px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px' }}>{fmt(it.gst_amount)}</td>
                <td style={{ padding: '12px 16px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px', fontWeight: 600 }}>{fmt(it.total_value)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan="10" style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>No items found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* SECTION 3: Totals card */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#4B5563' }}>
            <span>Subtotal (Taxable):</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#4B5563' }}>
            <span>GST Total:</span>
            <span>{fmt(gstTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: '16px', color: '#111827', fontWeight: 'bold', fontSize: '1.1rem' }}>
            <span>Grand Total:</span>
            <span>{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* SECTION 4: Actions */}
      {showActions && (
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
          <button 
            onClick={handleAccept} 
            disabled={actionLoading}
            style={{ padding: '12px 24px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '1rem', opacity: actionLoading ? 0.7 : 1 }}
          >
            {actionLoading ? 'Processing...' : '✓ Accept PO'}
          </button>
          <button 
            onClick={handleReject} 
            disabled={actionLoading}
            style={{ padding: '12px 24px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '1rem', opacity: actionLoading ? 0.7 : 1 }}
          >
            {actionLoading ? 'Processing...' : '✗ Reject PO'}
          </button>
        </div>
      )}
      
    </div>
  );
}
