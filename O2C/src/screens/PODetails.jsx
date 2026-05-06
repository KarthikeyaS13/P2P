import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function PODetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();

  const [po, setPO] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Preview State
  const [previewPath, setPreviewPath] = useState(null);
  const [previewExcelData, setPreviewExcelData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');

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

  const subtotal = po.subtotal || items.reduce((s, i) => s + (i.total_taxable || 0), 0);
  const gstTotal = po.gst_total || items.reduce((s, i) => s + (i.total_gst || 0), 0);
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

  const handleViewFile = async (path) => {
    const filename = path.split('/').pop();
    const fullUrl = `http://localhost:3000/uploads/${filename}`;
    const isExcel = filename.toLowerCase().match(/\.(xlsx|xls|xlsm|csv)$/);

    if (isExcel) {
      setLoadingPreview(true);
      setPreviewPath(filename);
      try {
        const res = await axios.get(fullUrl, { responseType: 'arraybuffer' });
        const wb = XLSX.read(res.data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

        let headerIdx = 0;
        let maxScore = -1;
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
          const row = rawData[i] || [];
          const s = row.map(c => String(c || '').toLowerCase()).join(' ');
          let sc = 0;
          if (s.includes('item')) sc += 2;
          if (s.includes('qty')) sc += 2;
          if (s.includes('rate')) sc += 2;
          if (s.includes('package')) sc += 2;
          if (sc > maxScore) { maxScore = sc; headerIdx = i; }
        }

        const headersRaw = rawData[headerIdx] || [];
        const dataRows = (maxScore < 2) ? rawData : rawData.slice(headerIdx + 1);

        const formatted = dataRows.map(row => {
          const obj = {};
          if (maxScore >= 2) {
            headersRaw.forEach((h, idx) => { if (h) obj[String(h).trim()] = row[idx]; });
          } else {
            headersRaw.forEach((_, idx) => { obj[`Col ${idx + 1}`] = row[idx]; });
          }
          return obj;
        }).filter(row => Object.values(row).some(v => v !== null && v !== ''));

        setPreviewExcelData(formatted);
      } catch (err) {
        console.error("Preview failed", err);
        alert("Could not preview Excel file.");
        setPreviewPath(null);
      } finally {
        setLoadingPreview(false);
      }
    } else {
      setPreviewPath(fullUrl);
      setPreviewExcelData(null);
    }
  };

  const renderFileViewer = () => {
    if (!previewPath) return null;
    const allHeaders = previewExcelData ? Array.from(new Set(previewExcelData.flatMap(row => Object.keys(row)))) : [];

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '95%', height: '90%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Preview: {previewPath.split('/').pop()}</h3>
            <button onClick={() => { setPreviewPath(null); setPreviewExcelData(null); }} style={{ padding: '8px 16px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close Preview</button>
          </div>

          <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '8px', overflow: 'auto' }}>
            {loadingPreview ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <p>Parsing Excel data...</p>
              </div>
            ) : previewExcelData ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: 'white' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 10 }}>
                  <tr>
                    {allHeaders.map(h => <th key={h} style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewExcelData.map((row, i) => (
                    <tr key={i}>
                      {allHeaders.map((h, j) => <td key={j} style={{ padding: '8px', border: '1px solid #E5E7EB' }}>{row[h] !== undefined ? String(row[h]) : '-'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <iframe src={previewPath} width="100%" height="100%" title="File Viewer" style={{ border: 'none' }} />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', width: '100%', textAlign: 'left', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {renderFileViewer()}

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
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Location:</strong> {po.location_name} - {po.location_city}, {po.location_state} {po.location_pincode}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Address:</strong> {po.location_address || 'N/A'}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Location GST:</strong> {po.location_gstin || 'N/A'}</p>
          <p style={{ margin: 0, color: '#4B5563' }}><strong style={{ color: '#111827' }}>SPOC:</strong> {po.spoc_name || 'N/A'} {po.spoc_phone ? `(${po.spoc_phone})` : ''}</p>
        </div>
        <div>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>PO Date:</strong> {po.po_date ? new Date(po.po_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>Start Date:</strong> {po.start_date ? new Date(po.start_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: '0 0 8px', color: '#4B5563' }}><strong style={{ color: '#111827' }}>End Date:</strong> {po.end_date ? new Date(po.end_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {/* {po.po_copy_path && (
              <button onClick={() => handleViewFile(po.po_copy_path)} style={{ fontSize: '0.75rem', color: '#3B82F6', background: 'none', border: '1px solid #3B82F6', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>View PO Copy</button>
            )} */}
            {po.po_annex_path && (
              <button onClick={() => handleViewFile(po.po_annex_path)} style={{ fontSize: '0.75rem', color: '#10B981', background: 'none', border: '1px solid #10B981', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>View Annex</button>
            )}
            {po.other_attachment_path && (
              <button onClick={() => handleViewFile(po.other_attachment_path)} style={{ fontSize: '0.75rem', color: '#6B7280', background: 'none', border: '1px solid #6B7280', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>View Other</button>
            )}
            {/* <button
              onClick={() => {
                const ws = XLSX.utils.json_to_sheet(items);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Items");
                XLSX.writeFile(wb, `PO_${po.po_number || po.order_id}_Items.xlsx`);
              }}
              style={{ fontSize: '0.75rem', color: '#3B82F6', background: '#EFF6FF', border: '1px solid #3B82F6', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
            >
              📥 Download Items (Excel)
            </button> */}
          </div>
        </div>
      </div>

      {/* SECTION 2: Search Bar */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <input
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search across all items (Ref No, Name, Description...)"
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '0.85rem',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>🔍</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
          Showing <strong>{items.length}</strong> items
          {globalFilter && ` (filtered from ${items.length})`}
        </span>
      </div>

      {/* SECTION 3: Items table */}
      <div style={{ overflow: 'auto', maxHeight: '70vh', background: 'white', borderRadius: '12px', border: '1px solid #E5E7EB', marginBottom: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <table style={{ width: 'max-content', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.7rem' }}>
          <thead style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ whiteSpace: 'nowrap' }}>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '40px', textAlign: 'left' }}>#</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '60px', textAlign: 'left' }}>Ref No</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '80px', textAlign: 'left' }}>Package</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '80px', textAlign: 'left' }}>Heading</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '80px', textAlign: 'left' }}>Sub Heading</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '120px', textAlign: 'left' }}>Item Name</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '150px', textAlign: 'left' }}>Description</th>
              <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '50px', textAlign: 'center' }}>UOM</th>

              <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#ECFDF5', textAlign: 'center' }}>Supply Details</th>
              <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'center' }}>Service Details</th>

              <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center' }}>Calculated Supply</th>
              <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center' }}>Calculated Service</th>

              <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center' }}>TOTALS</th>
            </tr>
            <tr style={{ whiteSpace: 'nowrap' }}>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '80px' }}>Qty</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '90px' }}>Rate</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '60px' }}>GST%</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '80px' }}>Qty</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '90px' }}>Rate</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '60px' }}>GST%</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '90px' }}>Taxable</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '90px' }}>GST</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '90px' }}>Total</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '90px' }}>Taxable</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '90px' }}>GST</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '90px' }}>Total</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '90px' }}>Taxable</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '90px' }}>GST</th>
              <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '100px' }}>Invoice</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter(it => {
                if (!globalFilter) return true;
                const search = globalFilter.toLowerCase();
                return (
                  (it.item_name || '').toLowerCase().includes(search) ||
                  (it.description || '').toLowerCase().includes(search) ||
                  (it.ref_no || '').toLowerCase().includes(search) ||
                  (it.package_name || '').toLowerCase().includes(search) ||
                  (it.heading || '').toLowerCase().includes(search) ||
                  (it.sub_heading || '').toLowerCase().includes(search)
                );
              })
              .map((it, idx) => (
                <tr key={it.id || idx}>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'left', color: '#6B7280' }}>{it.line_number || idx + 1}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.ref_no || '-'}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.package_name || '-'}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.heading || '-'}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', maxWidth: '250px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{it.sub_heading || '-'}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', fontWeight: 600 }}>{it.item_name === 'Item' ? '' : it.item_name}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', color: '#4B5563', maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{it.description || '-'}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.uom || '-'}</td>

                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#ECFDF5' }}>{it.supply_qty || 0}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#ECFDF5' }}>{fmt(it.supply_rate || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#ECFDF5' }}>{it.supply_gst_rate || 0}%</td>

                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#EFF6FF' }}>{it.service_qty || 0}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#EFF6FF' }}>{fmt(it.service_rate || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#EFF6FF' }}>{it.service_gst_rate || 0}%</td>

                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F9FAFB' }}>{fmt(it.taxable_supply || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F9FAFB' }}>{fmt(it.gst_supply || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F9FAFB' }}>{fmt(it.total_supply || 0)}</td>

                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F9FAFB' }}>{fmt(it.taxable_service || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F9FAFB' }}>{fmt(it.gst_service || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F9FAFB' }}>{fmt(it.total_service || 0)}</td>

                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB' }}>{fmt(it.total_taxable || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB' }}>{fmt(it.total_gst || 0)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, background: '#FEF3C7' }}>{fmt(it.total_invoice || 0)}</td>
                </tr>
              ))}
            {items.length === 0 && (
              <tr>
                <td colSpan="23" style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>No items found</td>
              </tr>
            )}
          </tbody>
          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, background: '#374151', color: 'white', fontWeight: 700 }}>
            <tr>
              <td colSpan="8" style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.8rem' }}>GRAND TOTALS:</td>
              <td colSpan="3"></td>
              <td colSpan="3"></td>
              <td colSpan="3" style={{ textAlign: 'right', padding: '10px 16px', fontSize: '0.8rem' }}>{fmt(po.subtotal)} <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>(Taxable)</span></td>
              <td colSpan="3" style={{ textAlign: 'right', padding: '10px 16px', fontSize: '0.8rem' }}>{fmt(po.gst_total)} <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>(GST)</span></td>
              <td colSpan="3" style={{ textAlign: 'right', padding: '10px 16px', background: '#059669', fontSize: '1rem' }}>{fmt(po.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
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
