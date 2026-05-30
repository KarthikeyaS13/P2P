import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
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

  const processedItems = React.useMemo(() => {
    return items.map(it => {
      const s_qty = parseFloat(it.supply_qty) || 0;
      const s_rate = parseFloat(it.supply_rate) || 0;
      const s_gst_pct = parseFloat(it.supply_gst_rate) || 0;
      const sv_qty = parseFloat(it.service_qty) || 0;
      const sv_rate = parseFloat(it.service_rate) || 0;
      const sv_gst_pct = parseFloat(it.service_gst_rate) || 0;
      const taxable_s = it.taxable_supply !== undefined && it.taxable_supply !== null ? it.taxable_supply : s_qty * s_rate;
      const gst_s = it.gst_supply !== undefined && it.gst_supply !== null ? it.gst_supply : taxable_s * (s_gst_pct / 100);
      const total_s = it.total_supply !== undefined && it.total_supply !== null ? it.total_supply : taxable_s + gst_s;
      const taxable_sv = it.taxable_service !== undefined && it.taxable_service !== null ? it.taxable_service : sv_qty * sv_rate;
      const gst_sv = it.gst_service !== undefined && it.gst_service !== null ? it.gst_service : taxable_sv * (sv_gst_pct / 100);
      const total_sv = it.total_service !== undefined && it.total_service !== null ? it.total_service : taxable_sv + gst_sv;
      const total_taxable = it.total_taxable !== undefined && it.total_taxable !== null ? it.total_taxable : taxable_s + taxable_sv;
      const total_gst = it.total_gst !== undefined && it.total_gst !== null ? it.total_gst : gst_s + gst_sv;
      const total_invoice = it.total_invoice !== undefined && it.total_invoice !== null ? it.total_invoice : total_s + total_sv;
      return {
        ...it,
        taxable_supply: taxable_s,
        gst_supply: gst_s,
        total_supply: total_s,
        taxable_service: taxable_sv,
        gst_service: gst_sv,
        total_service: total_sv,
        total_taxable,
        total_gst,
        total_invoice
      };
    });
  }, [items]);

  const filteredItems = React.useMemo(() => {
    if (!globalFilter) return processedItems;
    const q = globalFilter.toLowerCase();
    return processedItems.filter(it => {
      return (
        String(it.ref_no || '').toLowerCase().includes(q) ||
        String(it.package_name || '').toLowerCase().includes(q) ||
        String(it.heading || '').toLowerCase().includes(q) ||
        String(it.sub_heading || '').toLowerCase().includes(q) ||
        String(it.item_name || '').toLowerCase().includes(q) ||
        String(it.description || '').toLowerCase().includes(q)
      );
    });
  }, [processedItems, globalFilter]);

  const summarizedPackages = React.useMemo(() => {
    const summary = filteredItems.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      if (!acc[pkg]) {
        acc[pkg] = {
          package_name: pkg,
          supply_taxable: 0,
          supply_gst: 0,
          service_taxable: 0,
          service_gst: 0,
          total_taxable: 0,
          total_gst: 0,
          total_invoice: 0
        };
      }
      acc[pkg].supply_taxable += (it.taxable_supply || 0);
      acc[pkg].supply_gst += (it.gst_supply || 0);
      acc[pkg].service_taxable += (it.taxable_service || 0);
      acc[pkg].service_gst += (it.gst_service || 0);
      acc[pkg].total_taxable += (it.total_taxable || 0);
      acc[pkg].total_gst += (it.total_gst || 0);
      acc[pkg].total_invoice += (it.total_invoice || 0);
      return acc;
    }, {});
    return Object.values(summary);
  }, [filteredItems]);

  const totalPackagesCount = React.useMemo(() => {
    const pkgs = new Set(processedItems.map(it => it.package_name || 'General'));
    return pkgs.size;
  }, [processedItems]);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    axios.get(`/api/pos/${id}`, { headers })
      .then(res => {
        setPO(res.data);
        setItems(res.data.items || []);
      })
      .catch(err => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading PO details...</div>;
  if (!po) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Sales Order not found.</div>;

  const subtotal = po.subtotal || items.reduce((s, i) => s + (i.total_taxable || 0), 0);
  const gstTotal = po.gst_total || items.reduce((s, i) => s + (i.total_gst || 0), 0);
  const grandTotal = po.grand_total || subtotal + gstTotal;

  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getStatusBadge = (status) => {
    const styles = {
      pending: { background: '#FEF3C7', color: '#92400E', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      nt_created: { background: '#FEF3C7', color: '#92400E', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      accepted: { background: '#D1FAE5', color: '#065F46', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      rejected: { background: '#FEE2E2', color: '#991B1B', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      dc_raised: { background: '#FED7AA', color: '#92400E', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 },
      invoice_raised: { background: '#EDE9FE', color: '#5B21B6', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 }
    };
    const style = styles[status] || { background: '#F3F4F6', color: '#374151', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 };
    const text = status === 'nt_created' ? 'PENDING' : status.replace('_', ' ').toUpperCase();
    return <span style={style}>{text}</span>;
  };

  const handleAccept = () => {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    setActionLoading(true);
    axios.put(`/api/pos/${id}/status`, { status: 'accepted' }, { headers })
      .then(() => {
        Swal.fire({ icon: 'success', title: 'PO Accepted', text: 'PO Accepted successfully', timer: 2000, showConfirmButton: false });
        navigate('/purchase-orders');
      })
      .catch(err => Swal.fire({ icon: 'error', title: 'Failed', text: (err.response?.data?.error || err.message) }))
      .finally(() => setActionLoading(false));
  };

  const handleReject = async () => {
    const { value: reason } = await Swal.fire({
      title: 'Reject PO',
      input: 'text',
      inputLabel: 'Reason for rejection (optional):',
      inputPlaceholder: 'Enter reason...',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Reject PO'
    });

    if (reason === undefined) return; // User cancelled

    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    setActionLoading(true);
    axios.put(`/api/pos/${id}/status`, { status: 'rejected', remarks: reason }, { headers })
      .then(() => {
        Swal.fire({ icon: 'success', title: 'PO Rejected', text: 'PO Rejected successfully', timer: 2000, showConfirmButton: false });
        navigate('/purchase-orders');
      })
      .catch(err => Swal.fire({ icon: 'error', title: 'Failed', text: (err.response?.data?.error || err.message) }))
      .finally(() => setActionLoading(false));
  };

  const showActions = (role === 'accounts' || role === 'admin') && (po.status === 'pending' || po.status === 'nt_created');

  const handleViewFile = async (path) => {
    const filename = path.split('/').pop();
    const fullUrl = `${window.location.origin}/uploads/${filename}`;
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
        /* console.error("Preview failed", err); */
        Swal.fire({ icon: 'error', title: 'Preview Failed', text: "Could not preview Excel file." });
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
    <div style={{ padding: '16px', width: '100%', maxWidth: '1200px', margin: '0 auto', textAlign: 'left', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {renderFileViewer()}

      {/* SECTION 1: Header card */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
        <button
          onClick={() => navigate(-1)}
          className="btn-ghost btn-back"
          style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
        </button>
        <h3 style={{ margin: 0, color: '#111827', fontSize: '1.2rem', fontWeight: 700 }}>Sales Order Details</h3>
        {getStatusBadge(po.status)}
      </div>

      <div style={{ background: 'white', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Sales Order Number:</strong> {po.po_number || po.order_id}</p>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Customer:</strong> {po.customer_name}</p>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Location:</strong> {po.location_name} - {po.location_city}, {po.location_state} {po.location_pincode}</p>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Address:</strong> {po.location_address || 'N/A'}</p>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Location GST:</strong> {po.location_gstin || po.customer_gst || 'N/A'}</p>
          <p style={{ margin: 0, color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>SPOC:</strong> {po.spoc_name || 'N/A'} {po.spoc_phone ? `(${po.spoc_phone})` : ''}</p>
        </div>
        <div>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Sales Order Date:</strong> {po.po_date ? new Date(po.po_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>Start Date:</strong> {po.start_date ? new Date(po.start_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <p style={{ margin: '0 0 4px', color: '#4B5563', fontSize: '0.85rem' }}><strong style={{ color: '#111827' }}>End Date:</strong> {po.end_date ? new Date(po.end_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {po.po_annex_path && (
              <button onClick={() => handleViewFile(po.po_annex_path)} style={{ fontSize: '0.7rem', color: '#10B981', background: 'none', border: '1px solid #10B981', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>View Annex</button>
            )}
            {po.other_attachment_path && (
              <button onClick={() => handleViewFile(po.other_attachment_path)} style={{ fontSize: '0.7rem', color: '#6B7280', background: 'none', border: '1px solid #6B7280', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>View Other</button>
            )}
          </div>
        </div>
        {po.remarks && (
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #F3F4F6', paddingTop: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>notes</span>
              SO Notes / Remarks
            </span>
            <div
              onClick={() => {
                if (po.remarks.length > 80) {
                  Swal.fire({
                    title: 'PO Notes',
                    html: `<div style="text-align: left; font-size: 14px; line-height: 1.5; color: #374151; white-space: pre-wrap; padding: 10px;">${po.remarks}</div>`,
                    confirmButtonText: 'Close',
                    confirmButtonColor: 'var(--primary)'
                  });
                }
              }}
              style={{
                fontSize: '12px',
                color: '#374151',
                background: '#F8FAFC',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                cursor: po.remarks.length > 80 ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: 500
              }}
              title={po.remarks.length > 80 ? "Click to view full notes" : ""}
            >
              {po.remarks}
            </div>
          </div>
        )}
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
          Showing <strong>{summarizedPackages.length}</strong> packages
          {globalFilter && ` (filtered from ${totalPackagesCount})`}
        </span>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Package-wise Financial Summary</h4>
        <SummaryTable data={filteredItems} />
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

// --- Helper Component: Summary Table ---
function SummaryTable({ data }) {
  const summarizedData = React.useMemo(() => {
    const summary = data.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      if (!acc[pkg]) {
        acc[pkg] = {
          package_name: pkg,
          supply_taxable: 0,
          supply_gst: 0,
          service_taxable: 0,
          service_gst: 0,
          total_taxable: 0,
          total_gst: 0,
          total_invoice: 0
        };
      }
      acc[pkg].supply_taxable += (it.taxable_supply || 0);
      acc[pkg].supply_gst += (it.gst_supply || 0);
      acc[pkg].service_taxable += (it.taxable_service || 0);
      acc[pkg].service_gst += (it.gst_service || 0);
      acc[pkg].total_taxable += (it.total_taxable || 0);
      acc[pkg].total_gst += (it.total_gst || 0);
      acc[pkg].total_invoice += (it.total_invoice || 0);
      return acc;
    }, {});
    return Object.values(summary);
  }, [data]);

  const columns = React.useMemo(() => [
    {
      header: 'Package Name',
      accessorKey: 'package_name',
      cell: info => <span style={{ fontWeight: 600, color: '#111827' }}>{info.getValue()}</span>,
    },
    {
      header: 'Supply Tax Value',
      accessorKey: 'supply_taxable',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Supply GST',
      accessorKey: 'supply_gst',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Service Tax Value',
      accessorKey: 'service_taxable',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Service GST',
      accessorKey: 'service_gst',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Total Tax Value',
      accessorKey: 'total_taxable',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString()}</span>,
    },
    {
      header: 'Total GST',
      accessorKey: 'total_gst',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString()}</span>,
    },
    {
      header: 'Total Invoice',
      accessorKey: 'total_invoice',
      cell: info => <span style={{ fontWeight: 700, color: '#2563EB' }}>₹{info.getValue().toLocaleString()}</span>,
    }
  ], []);

  const table = useReactTable({
    data: summarizedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const grandTotals = summarizedData.reduce((acc, row) => ({
    supply_taxable: acc.supply_taxable + row.supply_taxable,
    supply_gst: acc.supply_gst + row.supply_gst,
    service_taxable: acc.service_taxable + row.service_taxable,
    service_gst: acc.service_gst + row.service_gst,
    total_taxable: acc.total_taxable + row.total_taxable,
    total_gst: acc.total_gst + row.total_gst,
    total_invoice: acc.total_invoice + row.total_invoice
  }), { supply_taxable: 0, supply_gst: 0, service_taxable: 0, service_gst: 0, total_taxable: 0, total_gst: 0, total_invoice: 0 });

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead style={{ background: '#F8FAFC' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} style={{ height: '36px' }}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '4px 8px', textAlign: header.id === 'package_name' ? 'left' : 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', height: '36px' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ height: '32px' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '4px 8px', textAlign: cell.column.id === 'package_name' ? 'left' : 'right', border: '1px solid #E2E8F0', height: '32px' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot style={{ background: '#F8FAFC', fontWeight: 800, borderTop: '2px solid #E2E8F0' }}>
            <tr style={{ height: '32px' }}>
              <td style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #E2E8F0', height: '32px' }}>TOTAL</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.supply_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.supply_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.service_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.service_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.total_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2563EB', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.total_invoice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#F0F9FF', padding: '12px 20px', borderRadius: '8px', border: '1px solid #BAE6FD', textAlign: 'right', minWidth: '280px' }}>
          <p style={{ margin: '0 0 2px', color: '#0369A1', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revised Grand Total</p>
          <p style={{ margin: 0, color: '#0369A1', fontSize: '1.5rem', fontWeight: 900 }}>₹{grandTotals.total_invoice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>
    </div>
  );
}

