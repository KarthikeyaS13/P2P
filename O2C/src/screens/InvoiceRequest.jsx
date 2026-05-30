import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { getUser } from '../auth';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function InvoiceRequest() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = getUser();

  const [activeTab, setActiveTab] = useState('pending');
  const [invoices, setInvoices] = useState([]);
  const [pendingDCs, setPendingDCs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setGlobalFilter('');
    setStatusFilter('all');
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (id) {
      fetchInvoiceDetails(id);
    } else {
      setSelectedInvoice(null);
    }
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [invRes, dcRes] = await Promise.all([
        axios.get('/api/invoices', { headers }),
        axios.get('/api/dc', { headers })
      ]);
      setInvoices(invRes.data);
      setPendingDCs(dcRes.data.filter(d =>
        (d.status === 'delivery_confirmed' || d.status === 'partially_invoiced') &&
        d.invoicing_status !== 'fully_invoiced'
      ));
    } catch (err) {
      /* console.error('Fetch error:', err); */
    } finally {
      setLoading(false);
    }
  };

  const showFullDescription = (desc, name) => {
    Swal.fire({
      title: name,
      text: desc,
      icon: 'info',
      confirmButtonColor: 'var(--primary)',
    });
  };

  const fetchInvoiceDetails = async (invId) => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/invoices/${invId}`, { headers });
      setSelectedInvoice(res.data);
    } catch (err) {
      /* console.error('Invoice detail error:', err); */
      navigate('/invoice-request');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'requested': { bg: '#EEF2FF', text: '#4338CA', label: 'Pending Approval' },
      'raised': { bg: '#E0F2FE', text: '#0369A1', label: 'Approved & Issued' },
      'sent': { bg: '#FEF3C7', text: '#92400E', label: 'Dispatched' },
      'paid': { bg: '#DCFCE7', text: '#166534', label: 'Payment Received' }
    };
    return colors[status] || { bg: '#F3F4F6', text: '#374151', label: status };
  };

  const invoiceColumns = useMemo(() => [
    {
      header: 'Request No', accessorKey: 'invoice_number', cell: ({ getValue, row }) => (
        <span style={{ fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate(`/invoice-request/${row.original.id}`)}>
          {getValue()}
        </span>
      )
    },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Amount', accessorKey: 'grand_total', cell: ({ getValue }) => `₹${getValue()?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    {
      header: 'Status', accessorKey: 'status', cell: ({ getValue }) => {
        const cfg = getStatusColor(getValue());
        return <span className="status-pill" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>;
      }
    },
    {
      header: 'Actions', id: 'actions', cell: ({ row }) => (
        <button className="btn-ghost btn-sm" onClick={() => navigate(`/invoice-request/${row.original.id}`)} title="View Summary">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
        </button>
      )
    }
  ], [navigate]);

  const pendingColumns = useMemo(() => [
    { header: 'Sales Order Number', accessorKey: 'po_no' },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Delivered On', accessorKey: 'dispatch_date', cell: ({ getValue }) => new Date(getValue()).toLocaleDateString('en-IN') },
    {
      header: 'Action', id: 'action', cell: ({ row }) => (
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/new-invoice?po=${row.original.po_no}`)}>Request Invoice</button>
      )
    }
  ], [navigate]);

  const tableData = useMemo(() => {
    if (activeTab === 'pending') return pendingDCs;
    if (statusFilter === 'all') return invoices;
    return invoices.filter(inv => inv.status === statusFilter);
  }, [invoices, pendingDCs, activeTab, statusFilter]);

  const table = useReactTable({
    data: tableData,
    columns: activeTab === 'database' ? invoiceColumns : pendingColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (loading && !selectedInvoice) return <div className="screen-enter"><p>Loading Requests...</p></div>;

  if (selectedInvoice) {
    const inv = selectedInvoice;
    const cfg = getStatusColor(inv.status);

    return (
      <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 16px' }}>
        <div className="page-header" style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate(-1)} className="btn-ghost btn-back" style={{ width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            </button>
            <div>
              <h1 className="text-h1 page-header__title" style={{ fontSize: '16px', fontWeight: 700 }}>Request Summary</h1>
              <p className="page-header__subtitle" style={{ fontSize: '11px', color: '#64748B' }}>Reviewing submission for {inv.customer_name}</p>
            </div>
          </div>
          <span style={{ background: cfg.bg, color: cfg.text, padding: '4px 12px', borderRadius: '12px', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase' }}>
            {cfg.label}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="card shadow-sm" style={{ padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Sales Order Number</span>
                  <span style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>{inv.po_no}</span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Delivery Challan Number</span>
                  <span style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>{inv.dc_no}</span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Dispatch Date</span>
                  <span style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>{new Date(inv.dispatch_date).toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Place of Supply</span>
                  <span style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>{inv.place_of_supply}</span>
                </div>
              </div>

              <div style={{ background: '#F0F9FF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: '2px' }}>
                <span style={{ fontSize: '10px', color: '#0369A1', fontWeight: 600, textTransform: 'uppercase' }}>Estimated Grand Total</span>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#0369A1' }}>₹{inv.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <label style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Items Requested for Billing</label>
            <div style={{ overflowX: 'auto', marginBottom: '10px' }}>
              <table className="data-table invoice-items-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>Package</th>
                    <th style={{ textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>Item Name</th>
                    <th style={{ textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>Description <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                    <th style={{ textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap' }}>Qty</th>
                    <th style={{ textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap' }}>Rate</th>
                    <th style={{ textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap' }}>Taxable Val</th>
                    <th style={{ textAlign: 'center', fontSize: '14px' }}>GST Rate</th>
                    <th style={{ textAlign: 'right', fontSize: '14px' }}>GST Amt</th>
                    <th style={{ textAlign: 'right', fontSize: '14px' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items?.map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: '#475569', fontSize: '12px' }}>{it.package_name || '-'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '12px' }}>{it.item_name || '-'}</td>
                      <td style={{ cursor: 'pointer' }} onClick={() => showFullDescription(it.description, it.item_name)}>
                        <div style={{
                          fontSize: '12px',
                          color: '#64748B',
                          maxWidth: '140px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {it.description}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>₹{it.rate?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>₹{it.taxable_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px' }}>{it.gst_percent}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px' }}>₹{it.gst_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: '12px' }}>₹{it.total_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px', borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.5' }}>
                <strong>Departmental Note:</strong> This is a billing request. Official tax invoice and payment terms will be finalized by the Accounts Department after verification.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '12px', paddingBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="btn-ghost btn-back" 
            style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              border: '1px solid #E2E8F0',
              background: 'white',
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1" style={{ fontSize: '1.5rem', marginBottom: '2px' }}>Invoice Requests</h1>
            <p className="page-header__subtitle" style={{ fontSize: '11px', color: '#64748B' }}>Track your submissions and approval status</p>
          </div>
        </div>
        <button className="btn btn-primary" style={{ height: '30px', padding: '0 14px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => navigate('/new-invoice')}>+ New Request</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button className={`tab-link ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          Pending Delivery Challans
          <span style={{ background: activeTab === 'pending' ? '#1186d4ff' : '#E2E8F0', color: activeTab === 'pending' ? '#ffffff' : '#475569', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, marginLeft: '6px' }}>
            {pendingDCs.length}
          </span>
        </button>
        <button className={`tab-link ${activeTab === 'database' ? 'active' : ''}`} onClick={() => setActiveTab('database')}>
          My Requests
          <span style={{ background: activeTab === 'database' ? '#1186d4ff' : '#E2E8F0', color: activeTab === 'database' ? '#ffffff' : '#475569', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, marginLeft: '6px' }}>
            {invoices.length}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        marginBottom: '12px',
        background: 'white',
        padding: '6px 12px',
        borderRadius: '6px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '16px' }}>search</span>
            <input
              type="text"
              placeholder={activeTab === 'database' ? "Search requests..." : "Search pending DCs..."}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              style={{
                width: '100%',
                height: '28px',
                padding: '0 8px 0 28px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '11px',
                outline: 'none',
                background: '#F8FAFC'
              }}
            />
          </div>
          {activeTab === 'database' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                flex: '0 0 160px',
                height: '28px',
                padding: '0 8px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                background: '#F8FAFC',
                fontSize: '11px',
                cursor: 'pointer',
                color: '#334155',
                outline: 'none'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="requested">Pending Approval</option>
              <option value="raised">Approved & Issued</option>
              <option value="sent">Dispatched</option>
              <option value="paid">Payment Received</option>
            </select>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {table.getRowModel().rows.length} Results
        </div>
      </div>

      <div className="card data-table-wrapper" style={{ padding: '0px', borderRadius: '6px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => {
                  const isRightAligned = h.column.id === 'grand_total' || h.column.id === 'action' || h.column.id === 'actions';
                  return (
                    <th key={h.id} style={{ textAlign: isRightAligned ? 'right' : 'left', padding: '0 14px', fontSize: '13px' }}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => {
                  const isRightAligned = cell.column.id === 'grand_total' || cell.column.id === 'action' || cell.column.id === 'actions';
                  return (
                    <td key={cell.id} style={{ textAlign: isRightAligned ? 'right' : 'left', padding: '8px 14px', fontSize: '13px' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`
        .tab-link { padding: 4px 10px; border-radius: 6px; background: #F1F5F9; border: 1px solid #E2E8F0; font-weight: 700; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; font-size: 11px; }
        .tab-link.active { background: white; color: var(--primary); border-color: var(--primary); }
        .status-pill { padding: 2px 8px; border-radius: 4px; font-size: 10px; fontWeight: 800; text-transform: uppercase; white-space: nowrap; display: inline-block; letter-spacing: 0.02em; }
        
        /* Compact card wrapper override */
        .data-table-wrapper {
          padding: 0 !important;
        }

        /* High density table overrides - padded up slightly */
        .data-table th {
          height: 44px !important;
          padding: 0 14px !important;
          font-size: 12px !important;
          vertical-align: middle !important;
          box-sizing: border-box;
          background: #F8FAFC !important;
          color: #475569 !important;
          border-bottom: 1px solid #E2E8F0 !important;
        }
        .data-table td {
          height: 40px !important;
          padding: 8px 14px !important;
          font-size: 13px !important;
          vertical-align: middle !important;
          box-sizing: border-box;
          border-bottom: 1px solid #F1F5F9 !important;
        }
        .data-table tr {
          height: 40px !important;
        }
        .data-table .btn-sm {
          height: 28px !important;
          padding: 0 12px !important;
          font-size: 12px !important;
          line-height: 26px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          margin: 0 !important;
          border-radius: 4px !important;
        }
      `}</style>
    </div>
  );
}
