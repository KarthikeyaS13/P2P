import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function POReview() {
  const [pendingPOs, setPendingPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedPO, setSelectedPO] = useState(null);
  const [poDetails, setPoDetails] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams();

  // Local state for inline editing
  const [editableItems, setEditableItems] = useState([]);

  // CDC states
  const [activeReviewTab, setActiveReviewTab] = useState('orders'); // 'orders' or 'cdcs'
  const [pendingCDCs, setPendingCDCs] = useState([]);
  const [selectedCDC, setSelectedCDC] = useState(null);
  const [cdcDetails, setCdcDetails] = useState(null);
  const [loadingCdcDetails, setLoadingCdcDetails] = useState(false);
  const [cdcRemarks, setCdcRemarks] = useState('');
  const [isRejectingCdc, setIsRejectingCdc] = useState(false);

  useEffect(() => {
    loadPendingPOs();
    loadPendingCDCs();
  }, []);

  const loadPendingCDCs = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/dc-requests?status=pending_review', { headers });
      setPendingCDCs(res.data);
    } catch (err) {
      /* console.error('Error loading pending CDCs:', err); */
    }
  };

  const handleSelectCDC = async (cdc) => {
    setSelectedCDC(cdc);
    setCdcDetails(null);
    setLoadingCdcDetails(true);
    setCdcRemarks('');
    setIsRejectingCdc(false);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/dc-requests/${cdc.id}`, { headers });
      setCdcDetails(res.data);
    } catch (err) {
      /* console.error('Error fetching CDC details:', err); */
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load CDC details' });
    } finally {
      setLoadingCdcDetails(false);
    }
  };

  const updateCDCStatus = async (status) => {
    if (!selectedCDC) return;
    setActionLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (status === 'approved') {
        await axios.post(`/api/dc-requests/${selectedCDC.id}/approve-cdc`, {}, { headers });
        Swal.fire({ icon: 'success', title: 'CDC Approved', text: 'Quantities returned to PO outstanding successfully!', timer: 2000, showConfirmButton: false });
      } else {
        await axios.post(`/api/dc-requests/${selectedCDC.id}/reject-cdc`, { remarks: cdcRemarks }, { headers });
        Swal.fire({ icon: 'success', title: 'CDC Rejected', text: 'CDC request rejected successfully!', timer: 2000, showConfirmButton: false });
      }

      setSelectedCDC(null);
      setCdcDetails(null);
      loadPendingCDCs();
    } catch (err) {
      /* console.error('Error updating CDC status:', err); */
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to update CDC status' });
    } finally {
      setActionLoading(false);
      setIsRejectingCdc(false);
    }
  };

  useEffect(() => {
    if (id) {
      // Find PO in pending list or fetch directly
      handleSelectPO({ id });
    } else {
      setSelectedPO(null);
      setPoDetails(null);
    }
  }, [id]);

  const loadPendingPOs = async () => {
    setLoadingList(true);
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/pos', { headers });
      setPendingPOs(res.data);
    } catch (err) {
      /* console.error(err); */
    } finally {
      setLoadingList(false);
      setLoading(false);
    }
  };

  const handleSelectPO = async (po) => {
    if (typeof po === 'object' && po.id && !id) {
      navigate(`/po-review/${po.id}`);
      return;
    }

    setSelectedPO(po);
    setPoDetails(null);
    setLoadingDetails(true);
    setRemarks('');
    setIsRejecting(false);

    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/pos/${po.id}`, { headers });
      const details = res.data;
      setPoDetails(details);

      setEditableItems((details.items || []).map((it, i) => {
        return calculateRow({
          ...it,
          line_number: it.line_number || i + 1,
          package_name: it.package_name || '',
          heading: it.heading || '',
          sub_heading: it.sub_heading || '',
          item_name: it.item_name === 'Item' ? '' : (it.item_name || ''),
          description: it.description || '',
          uom: it.uom || '',
          supply_qty: it.supply_qty || 0,
          supply_rate: it.supply_rate || 0,
          supply_gst_rate: it.supply_gst_rate || 0,
          service_qty: it.service_qty || 0,
          service_rate: it.service_rate || 0,
          service_gst_rate: it.service_gst_rate || 0
        });
      }));
    } catch (err) {
      /* console.error(err); */
    } finally {
      setLoadingDetails(false);
    }
  };

  const updatePOStatus = async (status) => {
    if (!selectedPO) return;
    setActionLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`/api/pos/${selectedPO.id}/status`, {
        status, remarks
      }, { headers });

      loadPendingPOs();
      Swal.fire({ icon: 'success', title: 'Success', text: `PO successfully ${status}`, timer: 2000, showConfirmButton: false });
      navigate('/po-review');
    } catch (err) {
      /* console.error(err); */
      Swal.fire({ icon: 'error', title: 'Error', text: 'Error updating PO status' });
    } finally {
      setActionLoading(false);
      setIsRejecting(false);
    }
  };

  const calculateRow = (row) => {
    const s_qty = parseFloat(row.supply_qty) || 0;
    const s_rate = parseFloat(row.supply_rate) || 0;
    const s_gst_pct = parseFloat(row.supply_gst_rate) || 0;
    const sv_qty = parseFloat(row.service_qty) || 0;
    const sv_rate = parseFloat(row.service_rate) || 0;
    const sv_gst_pct = parseFloat(row.service_gst_rate) || 0;
    const taxable_s = s_qty * s_rate;
    const gst_s = taxable_s * (s_gst_pct / 100);
    const total_s = taxable_s + gst_s;
    const taxable_sv = sv_qty * sv_rate;
    const gst_sv = taxable_sv * (sv_gst_pct / 100);
    const total_sv = taxable_sv + gst_sv;
    const total_taxable = taxable_s + taxable_sv;
    const total_gst = gst_s + gst_sv;
    const total_invoice = total_s + total_sv;
    return {
      ...row,
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
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { background: '#FEF3C7', color: '#92400E', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      nt_created: { background: '#FEF3C7', color: '#92400E', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      accepted: { background: '#D1FAE5', color: '#065F46', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      approved: { background: '#D1FAE5', color: '#065F46', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      rejected: { background: '#FEE2E2', color: '#991B1B', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      dc_raised: { background: '#FED7AA', color: '#92400E', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      invoice_raised: { background: '#EDE9FE', color: '#5B21B6', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }
    };
    const style = styles[status] || { background: '#F3F4F6', color: '#374151', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 };
    const text = status === 'nt_created' ? 'PENDING' : (status || 'PENDING').replace('_', ' ').toUpperCase();
    return <span style={style}>{text}</span>;
  };

  const filteredData = useMemo(() => {
    return pendingPOs.filter(p => {
      const matchSearch =
        (p.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.customer_name || '').toLowerCase().includes(search.toLowerCase());
      let matchStatus = false;
      if (filterStatus === 'all') {
        matchStatus = true;
      } else if (filterStatus === 'pending') {
        matchStatus = p.status === 'pending' || p.status === 'nt_created';
      } else {
        matchStatus = p.status === filterStatus;
      }
      return matchSearch && matchStatus;
    });
  }, [pendingPOs, search, filterStatus]);

  const filteredCDCs = useMemo(() => {
    return pendingCDCs.filter(c => {
      return (
        (c.dc_request_no || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.po_no || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.customer_name || '').toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [pendingCDCs, search]);

  const columns = useMemo(() => [
    {
      accessorKey: 'po_number',
      header: 'Sales Order Number',
      cell: info => <span style={{ fontWeight: 600, color: '#111827' }}>{info.getValue() || info.row.original.order_id}</span>,
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
    },
    {
      accessorKey: 'location_city',
      header: 'Location',
      cell: info => <span>{info.getValue() || info.row.original.location_name || 'N/A'}</span>,
    },
    {
      accessorKey: 'grand_total',
      header: 'Value (Incl. GST)',
      cell: info => <span style={{ fontWeight: 500 }}>₹{Number(info.getValue() || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: info => getStatusBadge(info.getValue()),
    },
    {
      accessorKey: 'is_nt_po',
      header: 'Type',
      cell: info => (
        <span style={{
          background: info.getValue() ? '#EFF6FF' : '#F3F4F6',
          color: info.getValue() ? '#1D4ED8' : '#6B7280',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.8rem',
          fontWeight: 700
        }}>
          {info.getValue() ? 'NT' : 'REGULAR'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <button
          onClick={() => handleSelectPO(row.original)}
          className="btn btn-primary"
          style={{
            height: '32px',
            minHeight: 'auto',
            padding: '0 16px',
            fontSize: '13px',
            borderRadius: '8px'
          }}
        >
          View
        </button>
      ),
    }
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-ghost btn-back"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title" style={{ fontSize: '24px' }}>Sales Order Review</h1>
            <p className="page-header__subtitle">Review and validate new sales orders from the Sales team.</p>
          </div>
        </div>

        <div className="card" style={{ padding: '8px 16px', textAlign: 'center', minWidth: '120px', background: 'white', border: '1px solid var(--outline-variant)' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--secondary)', fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 2px' }}>
            {activeReviewTab === 'orders' ? 'Active Orders' : 'Pending Rejections'}
          </p>
          <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
            {activeReviewTab === 'orders' ? filteredData.length : filteredCDCs.length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', borderBottom: '1px solid #E5E7EB', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveReviewTab('orders')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeReviewTab === 'orders' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'transparent',
            color: activeReviewTab === 'orders' ? 'var(--primary)' : '#6B7280',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '4px 4px 0 0'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span>
          Sales Orders ({filteredData.length})
        </button>
        <button
          onClick={() => setActiveReviewTab('cdcs')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeReviewTab === 'cdcs' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'transparent',
            color: activeReviewTab === 'cdcs' ? 'var(--primary)' : '#6B7280',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '4px 4px 0 0'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>assignment_return</span>
          Delivery Rejections (CDC) ({pendingCDCs.length})
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '12px',
        background: 'white',
        padding: '8px 16px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder={activeReviewTab === 'orders' ? "Search by PO #, Customer..." : "Search by CDC #, SO #, Customer..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px 0 40px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
                background: '#F9FAFB'
              }}
            />
          </div>
          {activeReviewTab === 'orders' && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                flex: 1,
                height: '34px',
                padding: '0 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: '#F9FAFB',
                fontSize: '13px',
                cursor: 'pointer',
                color: '#374151',
                outline: 'none'
              }}
            >
              <option value="pending">Pending Orders</option>
              <option value="all">All Statuses</option>
              <option value="nt_created">NT Created</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
        </div>
        <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {activeReviewTab === 'orders' ? filteredData.length : filteredCDCs.length} Results
        </div>
      </div>

      {activeReviewTab === 'orders' ? (
        <>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            overflowX: 'auto',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
              <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th key={header.id} style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#6B7280' }}>Loading queue...</td></tr>
                ) : table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map(row => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} style={{ padding: '6px 10px', fontSize: '0.85rem', color: '#374151' }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
                      No pending sales orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination UI */}
          <div style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="btn btn-ghost"
                style={{ padding: '6px 12px', fontSize: '12px', opacity: table.getCanPreviousPage() ? 1 : 0.5 }}
              >
                Previous
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="btn btn-ghost"
                style={{ padding: '6px 12px', fontSize: '12px', opacity: table.getCanNextPage() ? 1 : 0.5 }}
              >
                Next
              </button>
            </div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              Page <span style={{ fontWeight: 600 }}>{table.getState().pagination.pageIndex + 1}</span> of <span style={{ fontWeight: 600 }}>{table.getPageCount()}</span>
            </div>
          </div>
        </>
      ) : (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #E5E7EB',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
            <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <tr>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>Sl No</th>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>CDC Request No</th>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>Sales Order No</th>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>Customer</th>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>Location</th>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>Remarks</th>
                <th style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCDCs.length > 0 ? (
                filteredCDCs.map((cdc, index) => (
                  <tr key={cdc.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '8px 10px', fontSize: '0.85rem', color: '#374151' }}>{index + 1}</td>
                    <td style={{ padding: '8px 10px', fontSize: '0.85rem', color: '#111827', fontWeight: 600 }}>{cdc.dc_request_no}</td>
                    <td style={{ padding: '8px 10px', fontSize: '0.85rem', color: '#374151' }}>{cdc.po_no}</td>
                    <td style={{ padding: '8px 10px', fontSize: '0.85rem', color: '#374151' }}>{cdc.customer_name}</td>
                    <td style={{ padding: '8px 10px', fontSize: '0.85rem', color: '#374151' }}>{cdc.location_name} - {cdc.location_city}</td>
                    <td style={{ padding: '8px 10px', fontSize: '0.85rem', color: '#6B7280', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cdc.special_instructions}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <button
                        onClick={() => handleSelectCDC(cdc)}
                        className="btn btn-primary"
                        style={{
                          height: '32px',
                          minHeight: 'auto',
                          padding: '0 16px',
                          fontSize: '13px',
                          borderRadius: '8px'
                        }}
                      >
                        View Rejection
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
                    No pending delivery rejections (CDC) found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Screen Overlay for Details - PUSHED DOWN from top */}
      {(selectedPO || loadingDetails) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="animate-scale-up" style={{ width: '100%', maxWidth: '1400px', height: '100%', maxHeight: '90vh', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>

            {/* Overlay Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn-ghost btn-back" onClick={() => navigate('/po-review')} style={{ padding: '6px', borderRadius: '50%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
                </button>
                <div>
                  <h2 className="text-h3" style={{ margin: 0, fontSize: '1.2rem' }}>Review: {selectedPO?.po_number}</h2>
                  <p style={{ fontSize: '11px', color: 'var(--secondary)' }}>{selectedPO?.customer_name}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-ghost" onClick={() => navigate('/po-review')} style={{ padding: '6px', borderRadius: '50%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>close</span>
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'var(--surface-container-lowest)' }}>
              {loadingDetails ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                  <p>Loading Sales Order Details...</p>
                </div>
              ) : poDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="grid-2" style={{ gap: '16px' }}>
                    <div className="card card--padded" style={{ background: 'white', padding: '12px' }}>
                      <h4 className="text-h4" style={{ marginBottom: '12px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined">info</span> Sales Order Details
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</p>
                          <p style={{ fontWeight: 600 }}>{poDetails.customer_name}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Delivery Location</p>
                          <p style={{ fontWeight: 600, margin: 0 }}>{poDetails.location_name} - {poDetails.location_city}, {poDetails.location_state}</p>
                          <p style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                            {[
                              poDetails.location_address,
                              poDetails.location_address2,
                              poDetails.location_address3,
                              poDetails.location_city,
                              poDetails.location_state ? `${poDetails.location_state}${poDetails.location_pincode ? ` - ${poDetails.location_pincode}` : ''}` : poDetails.location_pincode
                            ].filter(Boolean).join(', ')}
                          </p>
                          <p style={{ fontSize: '13px', color: 'var(--secondary)' }}>GSTIN: <span style={{ color: 'var(--surface-on)', fontWeight: 600 }}>{poDetails.location_gstin || poDetails.customer_gst || 'N/A'}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="card card--padded" style={{ background: 'white', border: isRejecting ? '2px solid #EF4444' : '1px solid var(--outline-variant)', padding: '12px' }}>
                      <h4 className="text-h4" style={{ marginBottom: '8px', color: isRejecting ? '#EF4444' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                        <span className="material-symbols-outlined">{isRejecting ? 'report' : 'fact_check'}</span>
                        {isRejecting ? 'Reason for Denial' : 'Decision'}
                      </h4>

                      {!isRejecting ? (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                          <button
                            className="btn btn-success"
                            style={{ flex: 1, height: '36px', fontWeight: 700, fontSize: '13px' }}
                            onClick={() => updatePOStatus('approved')}
                            disabled={actionLoading}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ flex: 1, height: '36px', fontWeight: 700, fontSize: '13px' }}
                            onClick={() => setIsRejecting(true)}
                            disabled={actionLoading}
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <div className="animate-fade-in">
                          <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>Please specify the reason for denying this Sales Order. This will be visible to the Sales team.</p>
                          <div className="form-group" style={{ marginBottom: '10px' }}>
                            <textarea
                              className="form-input"
                              rows="3"
                              placeholder="Type rejection reason here..."
                              value={remarks}
                              onChange={e => setRemarks(e.target.value)}
                              autoFocus
                              style={{
                                fontSize: '13px',
                                borderColor: '#FCA5A5',
                                background: '#FFF7F7'
                              }}
                            ></textarea>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              className="btn btn-danger"
                              style={{ flex: 2, height: '34px', fontWeight: 700, fontSize: '13px' }}
                              onClick={() => {
                                if (!remarks.trim()) return Swal.fire({ icon: 'warning', title: 'Reason Required', text: 'Please enter a reason for denial' });
                                updatePOStatus('rejected');
                              }}
                              disabled={actionLoading}
                            >
                              Confirm Rejection
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ flex: 1, height: '34px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                              onClick={() => setIsRejecting(false)}
                              disabled={actionLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {poDetails?.remarks && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '10px' }}>
                          <span style={{ fontSize: '11px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>notes</span>
                            SO Notes / Remarks
                          </span>
                          <div
                            onClick={() => {
                              if (poDetails.remarks.length > 50) {
                                Swal.fire({
                                  title: 'PO Notes',
                                  html: `<div style="text-align: left; font-size: 14px; line-height: 1.5; color: #374151; white-space: pre-wrap; padding: 10px;">${poDetails.remarks}</div>`,
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
                              cursor: poDetails.remarks.length > 50 ? 'pointer' : 'default',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              fontWeight: 500
                            }}
                            title={poDetails.remarks.length > 50 ? "Click to view full notes" : ""}
                          >
                            {poDetails.remarks}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <SummaryTable data={editableItems} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Overlay for CDC Details */}
      {(selectedCDC || loadingCdcDetails) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="animate-scale-up" style={{ width: '100%', maxWidth: '1200px', height: '100%', maxHeight: '85vh', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>

            {/* Overlay Header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--primary)' }}>assignment_return</span>
                <div>
                  <h2 className="text-h3" style={{ margin: 0, fontSize: '1.2rem' }}>Review Delivery Rejection (CDC): {selectedCDC?.dc_request_no}</h2>
                  <p style={{ fontSize: '11px', color: 'var(--secondary)' }}>Linked PO: {selectedCDC?.po_no} | Customer: {selectedCDC?.customer_name}</p>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setSelectedCDC(null)} style={{ padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>close</span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--surface-container-lowest)' }}>
              {loadingCdcDetails ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                  <p>Loading CDC Details...</p>
                </div>
              ) : cdcDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="grid-2" style={{ gap: '20px' }}>

                    {/* Rejection Details Info Card */}
                    <div className="card card--padded" style={{ background: 'white', padding: '16px', border: '1px solid var(--outline-variant)', borderRadius: '8px' }}>
                      <h4 className="text-h4" style={{ marginBottom: '16px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700 }}>
                        <span className="material-symbols-outlined">info</span> Site Verification Details
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Customer Name</p>
                          <p style={{ fontWeight: 600, fontSize: '13px' }}>{cdcDetails.customer_name}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Delivery Site Location</p>
                          <p style={{ fontWeight: 600, fontSize: '13px' }}>{cdcDetails.location_name} ({cdcDetails.location_city})</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Site Rejection Description</p>
                          <div style={{
                            padding: '12px',
                            background: '#FFFBEB',
                            border: '1px solid #FCD34D',
                            borderRadius: '6px',
                            color: '#78350F',
                            fontSize: '13px',
                            lineHeight: 1.5,
                            fontWeight: 500
                          }}>
                            {cdcDetails.special_instructions}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Decision Panel */}
                    <div className="card card--padded" style={{ background: 'white', border: isRejectingCdc ? '2px solid #EF4444' : '1px solid var(--outline-variant)', padding: '16px', borderRadius: '8px' }}>
                      <h4 className="text-h4" style={{ marginBottom: '12px', color: isRejectingCdc ? '#EF4444' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', fontWeight: 700 }}>
                        <span className="material-symbols-outlined">{isRejectingCdc ? 'report' : 'verified_user'}</span>
                        {isRejectingCdc ? 'Logistics Rejection Remarks' : 'Action Required'}
                      </h4>

                      {!isRejectingCdc ? (
                        <div style={{ marginTop: '16px' }}>
                          <p style={{ fontSize: '13px', color: '#4B5563', marginBottom: '16px', lineHeight: 1.4 }}>
                            Approving this rejection will add the short/damaged item quantities back to the Sales Order outstanding balance, allowing Stores to re-dispatch them.
                          </p>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                              className="btn btn-success"
                              style={{ flex: 1, height: '40px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                              onClick={() => updateCDCStatus('approved')}
                              disabled={actionLoading}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                              Approve Rejection
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ flex: 1, height: '40px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                              onClick={() => setIsRejectingCdc(true)}
                              disabled={actionLoading}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>cancel</span>
                              Deny/Reject
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="animate-fade-in" style={{ marginTop: '8px' }}>
                          <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>Specify the reason for denying this rejection request:</p>
                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <textarea
                              className="form-input"
                              rows="3"
                              placeholder="Enter remarks..."
                              value={cdcRemarks}
                              onChange={e => setCdcRemarks(e.target.value)}
                              autoFocus
                              style={{
                                fontSize: '13px',
                                borderColor: '#FCA5A5',
                                background: '#FFF7F7',
                                width: '100%',
                                padding: '8px',
                                borderRadius: '6px',
                                border: '1px solid #EF4444'
                              }}
                            ></textarea>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              className="btn btn-danger"
                              style={{ flex: 2, height: '36px', fontWeight: 700, fontSize: '13px' }}
                              onClick={() => {
                                if (!cdcRemarks.trim()) return Swal.fire({ icon: 'warning', title: 'Remarks Required', text: 'Please specify the denial reason' });
                                updateCDCStatus('rejected');
                              }}
                              disabled={actionLoading}
                            >
                              Confirm Denial
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ flex: 1, height: '36px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                              onClick={() => setIsRejectingCdc(false)}
                              disabled={actionLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rejected Items Table */}
                  <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#374151' }}>Rejected Items List</h4>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                      <thead style={{ background: '#F3F4F6' }}>
                        <tr>
                          <th style={{ padding: '10px 16px', fontWeight: 700, color: '#4B5563' }}>Package</th>
                          <th style={{ padding: '10px 16px', fontWeight: 700, color: '#4B5563' }}>Item Name</th>
                          <th style={{ padding: '10px 16px', fontWeight: 700, color: '#4B5563' }}>Description</th>
                          <th style={{ padding: '10px 16px', fontWeight: 700, color: '#4B5563', textAlign: 'right' }}>Rejected Qty</th>
                          <th style={{ padding: '10px 16px', fontWeight: 700, color: '#4B5563' }}>UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cdcDetails.items && cdcDetails.items.length > 0 ? (
                          cdcDetails.items.map((it, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                              <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827' }}>{it.package_name || 'General'}</td>
                              <td style={{ padding: '10px 16px' }}>{it.item_name}</td>
                              <td style={{ padding: '10px 16px', color: '#6B7280', maxWidth: '400px' }}>
                                <ClickableDescription text={it.description} />
                              </td>
                              <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#EF4444' }}>{it.qty}</td>
                              <td style={{ padding: '10px 16px', color: '#4B5563' }}>{it.uom}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>No items in this rejection request.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClickableDescription({ text }) {
  if (!text) return <span>N/A</span>;

  const isLong = text.length > 50;

  const style = {
    display: '-webkit-box',
    WebkitLineClamp: 1,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: isLong ? 'pointer' : 'default',
    color: isLong ? '#2563EB' : '#4B5563',
    fontWeight: isLong ? 500 : 'normal',
    textDecoration: isLong ? 'underline' : 'none',
    textDecorationStyle: isLong ? 'dotted' : 'none'
  };

  const handleClick = () => {
    if (!isLong) return;
    Swal.fire({
      title: 'Item Description',
      html: `<div style="text-align: left; font-size: 14px; lineHeight: 1.5; color: #374151; white-space: pre-wrap; padding: 10px;">${text}</div>`,
      confirmButtonText: 'Close',
      confirmButtonColor: 'var(--primary)'
    });
  };

  return (
    <div
      onClick={handleClick}
      style={style}
      title={isLong ? "Click to view full description" : ""}
    >
      {text}
    </div>
  );
}

// --- Helper Component: Summary Table ---
function SummaryTable({ data }) {
  // 1. Group & filter Supply items
  const supplyData = React.useMemo(() => {
    if (!data) return [];
    const summary = data.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      const taxable = it.taxable_supply || 0;
      const gst = it.gst_supply || 0;
      const invoice = it.total_supply || 0;
      
      if (taxable > 0 || invoice > 0) {
        if (!acc[pkg]) {
          acc[pkg] = {
            package_name: pkg,
            taxable: 0,
            gst: 0,
            invoice: 0
          };
        }
        acc[pkg].taxable += taxable;
        acc[pkg].gst += gst;
        acc[pkg].invoice += invoice;
      }
      return acc;
    }, {});
    return Object.values(summary);
  }, [data]);

  // 2. Group & filter Service items
  const serviceData = React.useMemo(() => {
    if (!data) return [];
    const summary = data.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      const taxable = it.taxable_service || 0;
      const gst = it.gst_service || 0;
      const invoice = it.total_service || 0;
      
      if (taxable > 0 || invoice > 0) {
        if (!acc[pkg]) {
          acc[pkg] = {
            package_name: pkg,
            taxable: 0,
            gst: 0,
            invoice: 0
          };
        }
        acc[pkg].taxable += taxable;
        acc[pkg].gst += gst;
        acc[pkg].invoice += invoice;
      }
      return acc;
    }, {});
    return Object.values(summary);
  }, [data]);

  // 3. Compute Totals
  const supplyTotals = React.useMemo(() => {
    return supplyData.reduce((acc, row) => ({
      taxable: acc.taxable + row.taxable,
      gst: acc.gst + row.gst,
      invoice: acc.invoice + row.invoice
    }), { taxable: 0, gst: 0, invoice: 0 });
  }, [supplyData]);

  const serviceTotals = React.useMemo(() => {
    return serviceData.reduce((acc, row) => ({
      taxable: acc.taxable + row.taxable,
      gst: acc.gst + row.gst,
      invoice: acc.invoice + row.invoice
    }), { taxable: 0, gst: 0, invoice: 0 });
  }, [serviceData]);

  const formatCurrency = (val) => {
    return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const overallInvoiceTotal = supplyTotals.invoice + serviceTotals.invoice;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px', width: '100%' }}>
      {/* SUPPLY SUMMARY */}
      {supplyData.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F766E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>local_shipping</span>
            Supply Summary
          </h4>
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ height: '36px' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em' }}>Package Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>Taxable Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>GST Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '25%' }}>Grand Total Invoice Value</th>
                </tr>
              </thead>
              <tbody>
                {supplyData.map((row, idx) => (
                  <tr key={idx} style={{ height: '32px' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0', fontWeight: 600, color: '#1E293B' }}>{row.package_name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.taxable)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.gst)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontWeight: 600, color: '#0F766E' }}>{formatCurrency(row.invoice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: '#F0FDFA', fontWeight: 800, borderTop: '2px solid #0F766E' }}>
                <tr style={{ height: '36px', color: '#0F766E' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0' }}>Supply Total</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(supplyTotals.taxable)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(supplyTotals.gst)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>{formatCurrency(supplyTotals.invoice)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* SERVICE SUMMARY */}
      {serviceData.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E3A8A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>engineering</span>
            Service Summary
          </h4>
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ height: '36px' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em' }}>Package Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>Taxable Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>GST Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '25%' }}>Grand Total Invoice Value</th>
                </tr>
              </thead>
              <tbody>
                {serviceData.map((row, idx) => (
                  <tr key={idx} style={{ height: '32px' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0', fontWeight: 600, color: '#1E293B' }}>{row.package_name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.taxable)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.gst)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontWeight: 600, color: '#1E3A8A' }}>{formatCurrency(row.invoice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: '#EFF6FF', fontWeight: 800, borderTop: '2px solid #1E3A8A' }}>
                <tr style={{ height: '36px', color: '#1E3A8A' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0' }}>Service Total</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(serviceTotals.taxable)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(serviceTotals.gst)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>{formatCurrency(serviceTotals.invoice)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <div style={{ background: '#F0F9FF', padding: '12px 20px', borderRadius: '8px', border: '1px solid #BAE6FD', textAlign: 'right', minWidth: '280px' }}>
          <p style={{ margin: '0 0 2px', color: '#0369A1', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revised Grand Total</p>
          <p style={{ margin: 0, color: '#0369A1', fontSize: '1.5rem', fontWeight: 900 }}>{formatCurrency(overallInvoiceTotal)}</p>
        </div>
      </div>
    </div>
  );
}
