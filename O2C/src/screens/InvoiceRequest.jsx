import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
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

  const [activeTab, setActiveTab] = useState('database');
  const [invoices, setInvoices] = useState([]);
  const [pendingDCs, setPendingDCs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');

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
        axios.get('http://localhost:3000/api/invoices', { headers }),
        axios.get('http://localhost:3000/api/dc', { headers })
      ]);
      setInvoices(invRes.data);
      setPendingDCs(dcRes.data.filter(d =>
        (d.status === 'delivery_confirmed' || d.status === 'partially_invoiced')
      ));
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoiceDetails = async (invId) => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:3000/api/invoices/${invId}`, { headers });
      setSelectedInvoice(res.data);
    } catch (err) {
      console.error('Invoice detail error:', err);
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
    { header: 'Amount', accessorKey: 'grand_total', cell: ({ getValue }) => `₹${getValue()?.toLocaleString('en-IN')}` },
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
    { header: 'PO Number', accessorKey: 'po_no' },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Delivered On', accessorKey: 'dispatch_date', cell: ({ getValue }) => new Date(getValue()).toLocaleDateString('en-IN') },
    {
      header: 'Action', id: 'action', cell: ({ row }) => (
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/new-invoice?po=${row.original.po_no}`)}>Request Invoice</button>
      )
    }
  ], [navigate]);

  const tableData = useMemo(() => {
    return activeTab === 'database' ? invoices : pendingDCs;
  }, [invoices, pendingDCs, activeTab]);

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
      <div className="screen-enter">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/invoice-request')} className="btn-ghost btn-back" style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            </button>
            <div>
              <h1 className="text-h1 page-header__title">Request Summary</h1>
              <p className="page-header__subtitle">Reviewing submission for {inv.customer_name}</p>
            </div>
          </div>
          <span style={{ background: cfg.bg, color: cfg.text, padding: '8px 16px', borderRadius: '20px', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
            {cfg.label}
          </span>
        </div>

        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div className="card shadow-md" style={{ padding: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Reference Numbers</label>
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontWeight: 700 }}>PO No: {inv.po_no}</div>
                  <div style={{ fontWeight: 700 }}>DC No: {inv.dc_no}</div>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Logistics Info</label>
                <div style={{ marginTop: '8px' }}>
                  <div>Dispatch Date: {new Date(inv.dispatch_date).toLocaleDateString()}</div>
                  <div>Place of Supply: {inv.place_of_supply}</div>
                </div>
              </div>
            </div>

            <label style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Items Requested for Billing</label>
            <table className="data-table" style={{ marginTop: '12px', marginBottom: '32px' }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  <th style={{ textAlign: 'left' }}>Item Description</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Taxable Val</th>
                </tr>
              </thead>
              <tbody>
                {inv.items?.map((it, i) => (
                  <tr key={i}>
                    <td>{it.item_name}</td>
                    <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                    <td style={{ textAlign: 'right' }}>₹{it.taxable_value?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '24px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>Estimated Total Value</div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A' }}>₹{inv.grand_total?.toLocaleString()}</div>
              </div>
            </div>
            
            <div style={{ marginTop: '32px', padding: '16px', background: '#F8FAFC', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Departmental Note:</strong> This is a billing request. Official tax invoice and payment terms will be finalized by the Accounts Department after verification.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-enter">
      <div className="page-header">
        <div>
          <h1 className="text-h1">Invoice Requests</h1>
          <p className="page-header__subtitle">Track your submissions and approval status</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/new-invoice')}>+ New Request</button>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <button className={`tab-link ${activeTab === 'database' ? 'active' : ''}`} onClick={() => setActiveTab('database')}>My Requests</button>
        <button className={`tab-link ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Pending Delivery Challans</button>
      </div>

      <div className="card data-table-wrapper">
        <table className="data-table">
          <thead>{table.getHeaderGroups().map(hg => (<tr key={hg.id}>{hg.headers.map(h => (<th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>))}</tr>))}</thead>
          <tbody>{table.getRowModel().rows.map(row => (<tr key={row.id}>{row.getVisibleCells().map(cell => (<td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>))}</tr>))}</tbody>
        </table>
      </div>
      <style>{`
        .tab-link { padding: 10px 20px; border-radius: 8px; background: #F8FAFC; border: 1px solid #E2E8F0; font-weight: 700; color: #64748B; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; font-size: 14px; }
        .tab-link.active { background: white; color: var(--primary); border-color: var(--primary); }
        .status-pill { padding: 4px 12px; border-radius: 12px; font-size: 11px; fontWeight: 800; text-transform: uppercase; white-space: nowrap; display: inline-block; letter-spacing: 0.02em; }
      `}</style>
    </div>
  );
}
