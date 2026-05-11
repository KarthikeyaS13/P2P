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

  useEffect(() => {
    loadPendingPOs();
  }, []);

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
      const res = await axios.get('http://localhost:3000/api/pos', { headers });
      setPendingPOs(res.data);
    } catch (err) {
      console.error(err);
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
      const res = await axios.get(`http://localhost:3000/api/pos/${po.id}`, { headers });
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
      console.error(err);
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
      await axios.put(`http://localhost:3000/api/pos/${selectedPO.id}/status`, {
        status, remarks
      }, { headers });

      loadPendingPOs();
      Swal.fire({ icon: 'success', title: 'Success', text: `PO successfully ${status}`, timer: 2000, showConfirmButton: false });
      navigate('/po-review');
    } catch (err) {
      console.error(err);
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
      nt_created: { background: '#DBEAFE', color: '#1E40AF', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      accepted: { background: '#D1FAE5', color: '#065F46', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      rejected: { background: '#FEE2E2', color: '#991B1B', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      dc_raised: { background: '#FED7AA', color: '#92400E', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
      invoice_raised: { background: '#EDE9FE', color: '#5B21B6', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }
    };
    const style = styles[status] || { background: '#F3F4F6', color: '#374151', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 };
    return <span style={style}>{(status || 'PENDING').replace('_', ' ').toUpperCase()}</span>;
  };

  const filteredData = useMemo(() => {
    return pendingPOs.filter(p => {
      const matchSearch =
        (p.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.customer_name || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [pendingPOs, search, filterStatus]);

  const columns = useMemo(() => [
    {
      accessorKey: 'po_number',
      header: 'PO Number',
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
    <div className="screen-enter">
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
            <h1 className="text-h1 page-header__title">PO Review</h1>
            <p className="page-header__subtitle">Review and validate new purchase orders from the Sales team.</p>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 24px', textAlign: 'center', minWidth: '150px', background: 'white', border: '1px solid var(--outline-variant)' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--secondary)', fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 4px' }}>Active Orders</p>
          <p style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>{filteredData.length}</p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        marginBottom: '24px',
        background: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder="Search by PO #, Customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 12px 0 40px',
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                background: '#F9FAFB'
              }}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              flex: 1,
              height: '42px',
              padding: '0 16px',
              border: '1px solid #D1D5DB',
              borderRadius: '8px',
              background: '#F9FAFB',
              fontSize: '14px',
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
        </div>
        <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {filteredData.length} Results
        </div>
      </div>

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
                  <th key={header.id} style={{ padding: '10px 16px', fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading queue...</td></tr>
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '8px 16px', fontSize: '0.85rem', color: '#374151' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
                  No pending purchase orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination UI */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'white',
        borderRadius: '8px',
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

      {/* Full Screen Overlay for Details - PUSHED DOWN from top */}
      {(selectedPO || loadingDetails) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="animate-scale-up" style={{ width: '100%', maxWidth: '1400px', height: '100%', maxHeight: '90vh', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>

            {/* Overlay Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button className="btn-ghost btn-back" onClick={() => navigate('/po-review')} style={{ padding: '8px', borderRadius: '50%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>arrow_back</span>
                </button>
                <div>
                  <h2 className="text-h3" style={{ margin: 0 }}>Review: {selectedPO?.po_number}</h2>
                  <p style={{ fontSize: '12px', color: 'var(--secondary)' }}>{selectedPO?.customer_name}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-ghost" onClick={() => navigate('/po-review')} style={{ padding: '8px', borderRadius: '50%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>close</span>
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--surface-container-lowest)' }}>
              {loadingDetails ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 0' }}>
                  <p>Loading PO Details...</p>
                </div>
              ) : poDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="grid-2" style={{ gap: '24px' }}>
                    <div className="card card--padded" style={{ background: 'white' }}>
                      <h4 className="text-h4" style={{ marginBottom: '12px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined">info</span> PO Details
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</p>
                          <p style={{ fontWeight: 600 }}>{poDetails.customer_name}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Delivery Location</p>
                          <p style={{ fontWeight: 600, margin: 0 }}>{poDetails.location_name} - {poDetails.location_city}, {poDetails.location_state}</p>
                          <p style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: '4px' }}>{poDetails.location_address}</p>
                          <p style={{ fontSize: '13px', color: 'var(--secondary)' }}>GSTIN: <span style={{ color: 'var(--surface-on)', fontWeight: 500 }}>{poDetails.location_gstin || 'N/A'}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="card card--padded" style={{ background: 'white', border: isRejecting ? '2px solid #EF4444' : '1px solid var(--outline-variant)' }}>
                      <h4 className="text-h4" style={{ marginBottom: '12px', color: isRejecting ? '#EF4444' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined">{isRejecting ? 'report' : 'fact_check'}</span>
                        {isRejecting ? 'Reason for Denial' : 'Decision'}
                      </h4>

                      {!isRejecting ? (
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                          <button
                            className="btn btn-success"
                            style={{ flex: 1, height: '48px', fontWeight: 700, fontSize: '15px' }}
                            onClick={() => updatePOStatus('accepted')}
                            disabled={actionLoading}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ flex: 1, height: '48px', fontWeight: 700, fontSize: '15px' }}
                            onClick={() => setIsRejecting(true)}
                            disabled={actionLoading}
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <div className="animate-fade-in">
                          <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>Please specify the reason for denying this Purchase Order. This will be visible to the Sales team.</p>
                          <div className="form-group" style={{ marginBottom: '16px' }}>
                            <textarea
                              className="form-input"
                              rows="4"
                              placeholder="Type rejection reason here..."
                              value={remarks}
                              onChange={e => setRemarks(e.target.value)}
                              autoFocus
                              style={{
                                fontSize: '14px',
                                borderColor: '#FCA5A5',
                                background: '#FFF7F7'
                              }}
                            ></textarea>
                          </div>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                              className="btn btn-danger"
                              style={{ flex: 2, height: '42px', fontWeight: 700 }}
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
                              style={{ flex: 1, height: '42px', border: '1px solid #D1D5DB' }}
                              onClick={() => setIsRejecting(false)}
                              disabled={actionLoading}
                            >
                              Cancel
                            </button>
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
      cell: info => `₹${info.getValue().toLocaleString('en-IN')}`,
    },
    {
      header: 'Supply GST',
      accessorKey: 'supply_gst',
      cell: info => `₹${info.getValue().toLocaleString('en-IN')}`,
    },
    {
      header: 'Service Tax Value',
      accessorKey: 'service_taxable',
      cell: info => `₹${info.getValue().toLocaleString('en-IN')}`,
    },
    {
      header: 'Service GST',
      accessorKey: 'service_gst',
      cell: info => `₹${info.getValue().toLocaleString('en-IN')}`,
    },
    {
      header: 'Total Tax Value',
      accessorKey: 'total_taxable',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString('en-IN')}</span>,
    },
    {
      header: 'Total GST',
      accessorKey: 'total_gst',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString('en-IN')}</span>,
    },
    {
      header: 'Total Invoice',
      accessorKey: 'total_invoice',
      cell: info => <span style={{ fontWeight: 700, color: '#2563EB' }}>₹{info.getValue().toLocaleString('en-IN')}</span>,
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
    <div style={{ marginBottom: '16px' }}>
      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', overflowX: 'auto', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px' }}>
          <thead style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em', borderRight: '1px solid #F3F4F6' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '6px 16px', fontSize: '0.8rem', color: '#374151', borderRight: '1px solid #F3F4F6' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot style={{ background: '#F9FAFB', fontWeight: 800, borderTop: '2px solid #E5E7EB', color: '#111827' }}>
            <tr>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>TOTAL</td>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>₹{grandTotals.supply_taxable.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>₹{grandTotals.supply_gst.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>₹{grandTotals.service_taxable.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>₹{grandTotals.service_gst.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>₹{grandTotals.total_taxable.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>₹{grandTotals.total_gst.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#2563EB' }}>₹{grandTotals.total_invoice.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#F0F9FF', padding: '16px 24px', borderRadius: '12px', border: '1px solid #BAE6FD', textAlign: 'right', minWidth: '300px' }}>
          <p style={{ margin: '0 0 4px', color: '#0369A1', fontSize: '0.85rem', fontWeight: 600 }}>Grand Total Value</p>
          <p style={{ margin: 0, color: '#0369A1', fontSize: '2rem', fontWeight: 900 }}>₹{grandTotals.total_invoice.toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
}
