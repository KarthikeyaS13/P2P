import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getUser } from '../auth';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function InvoiceApproval() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = getUser();
  const isAccounts = user?.role === 'accounts' || user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('database');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'NEFT',
    transaction_ref: ''
  });
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

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
      const res = await axios.get('http://localhost:3000/api/invoices', { headers });
      setInvoices(res.data);
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
      navigate('/invoice-approval');
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('tax-invoice-printable');
    if (!element) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${selectedInvoice.invoice_number}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`http://localhost:3000/api/invoices/${selectedInvoice.id}/payment`, paymentForm, { headers });
      setShowPaymentModal(false);
      fetchInvoiceDetails(selectedInvoice.id);
      fetchData();
      alert("Payment recorded successfully!");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to record payment");
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'requested': { bg: '#EEF2FF', text: '#4338CA', label: 'Pending Approval' },
      'raised': { bg: '#E0F2FE', text: '#0369A1', label: 'Generated' },
      'sent': { bg: '#FEF3C7', text: '#92400E', label: 'Sent' },
      'partially_paid': { bg: '#FDF2F8', text: '#9D174D', label: 'Partially Paid' },
      'paid': { bg: '#DCFCE7', text: '#166534', label: 'Paid' },
      'overdue': { bg: '#FEE2E2', text: '#991B1B', label: 'Overdue' },
      'cancelled': { bg: '#F3F4F6', text: '#374151', label: 'Cancelled' }
    };
    return colors[status] || { bg: '#F3F4F6', text: '#374151', label: status };
  };

  const handleApprove = async () => {
    if (!window.confirm("Are you sure you want to approve this invoice and generate an official invoice number?")) return;
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`http://localhost:3000/api/invoices/${selectedInvoice.id}/approve`, {}, { headers });
      fetchInvoiceDetails(selectedInvoice.id);
      fetchData();
      alert("Invoice Approved Successfully!");
    } catch (err) {
      alert(err.response?.data?.error || "Approval Failed");
    }
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => { setIsDrawing(false); };
  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL('image/png');
    try {
      const token = sessionStorage.getItem('token');
      await axios.post(`http://localhost:3000/api/invoices/${selectedInvoice.id}/signature`,
        { signature_data: signatureData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedInvoice({ ...selectedInvoice, signature_data: signatureData });
      setShowSignatureModal(false);
    } catch (err) {
      alert("Failed to save signature");
    }
  };

  const invoiceColumns = useMemo(() => [
    {
      header: 'Invoice No', accessorKey: 'invoice_number', cell: ({ getValue, row }) => (
        <span style={{ fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate(`/invoice-approval/${row.original.id}`)}>
          {getValue()}
        </span>
      )
    },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Date', accessorKey: 'invoice_date', cell: ({ getValue }) => new Date(getValue()).toLocaleDateString('en-IN') },
    { header: 'Amount', accessorKey: 'grand_total', cell: ({ getValue }) => `₹${getValue()?.toLocaleString('en-IN')}` },
    {
      header: 'Balance Due', accessorKey: 'balance', cell: ({ getValue }) => (
        <span style={{ color: (getValue() || 0) > 0 ? '#B91C1C' : '#059669', fontWeight: 600 }}>
          ₹{(getValue() || 0).toLocaleString('en-IN')}
        </span>
      )
    },
    {
      header: 'Status', accessorKey: 'status', cell: ({ getValue }) => {
        const cfg = getStatusColor(getValue());
        return <span className="status-pill" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>;
      }
    },
    {
      header: 'Actions', id: 'actions', cell: ({ row }) => (
        <button className="btn-ghost btn-sm" onClick={() => navigate(`/invoice-approval/${row.original.id}`)} title="View Preview">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
        </button>
      )
    }
  ], [navigate]);

  const tableData = useMemo(() => {
    if (activeTab === 'database') {
      return invoices.filter(i => i.status !== 'requested');
    }
    return invoices.filter(i => i.status === 'requested');
  }, [invoices, activeTab]);

  const table = useReactTable({
    data: tableData,
    columns: invoiceColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const [detailsTab, setDetailsTab] = useState('preview');

  if (loading && !selectedInvoice) return <div className="screen-enter"><p>Loading Approval Module...</p></div>;

  if (selectedInvoice) {
    const inv = selectedInvoice;
    return (
      <div className="screen-enter">
        <div className="page-header no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/invoice-approval')} className="btn-ghost" style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid #E5E7EB' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            </button>
            <div>
              <h1 className="text-h1 page-header__title">Accounts Billing & Approval</h1>
              <p className="page-header__subtitle">{inv.invoice_number} • {inv.customer_name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline no-print" onClick={handleDownloadPDF}>
              <span className="material-symbols-outlined">download</span> Download PDF
            </button>
            {inv.status === 'requested' && (
              <button className="btn btn-primary no-print" onClick={handleApprove} style={{ background: 'var(--success)' }}>
                <span className="material-symbols-outlined">verified</span> Approve & Generate Invoice
              </button>
            )}
            {inv.status !== 'requested' && !selectedInvoice.signature_data && (
              <button className="btn btn-primary no-print" onClick={() => setShowSignatureModal(true)}>
                <span className="material-symbols-outlined">edit_square</span> Sign Invoice
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', padding: '4px' }}>
          <button className={`tab-link ${detailsTab === 'preview' ? 'active' : ''}`} onClick={() => setDetailsTab('preview')}>
            <span className="material-symbols-outlined">description</span> Tax Invoice Preview
          </button>
          <button className={`tab-link ${detailsTab === 'timeline' ? 'active' : ''}`} onClick={() => setDetailsTab('timeline')}>
            <span className="material-symbols-outlined">account_tree</span> Timeline & Payments
          </button>
        </div>

        {detailsTab === 'preview' ? (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div className="card shadow-lg animate-fade" style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
              <div id="tax-invoice-printable" style={{ padding: '48px', background: 'white', color: '#1E293B' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'inline-block', padding: '6px 12px', background: '#F1F5F9', borderRadius: '4px', fontSize: '10px', fontWeight: 900, color: '#475569', letterSpacing: '0.1em', marginBottom: '16px' }}>TAX INVOICE</div>
                    <h2 style={{ fontSize: '42px', fontWeight: 900, margin: 0, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{inv.invoice_number}</h2>
                    <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Date of Issue</div>
                        <div style={{ fontSize: '15px', fontWeight: 700 }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</div>
                      </div>
                      <div style={{ width: '1px', background: '#E2E8F0' }}></div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Payment Due</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#DC2626' }}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN') : '-'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', maxWidth: '280px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)', lineHeight: 1.1 }}>FINNOVO TECH</div>
                    <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.6', marginTop: '12px' }}>
                      Plot 18A, Sy No 118, Madhapur<br />Hyderabad, Telangana 500037<br />
                      <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', fontWeight: 700, color: '#1E293B' }}>GSTIN: 36AGTPG0351P1ZY</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#E2E8F0', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '40px' }}>
                  <div style={{ background: '#F8FAFC', padding: '16px' }}>
                    <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Purchase Order</div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{inv.po_no}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(inv.po_date).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ background: '#F8FAFC', padding: '16px' }}>
                    <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Delivery Challan</div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{inv.dc_no}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(inv.dispatch_date).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ background: '#F8FAFC', padding: '16px' }}>
                    <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Place of Supply</div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{inv.place_of_supply || 'Telangana'} State Code: 36</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', marginBottom: '48px' }}>
                  <div>
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '6px' }}>Billed To</h4>
                    <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155', whiteSpace: 'pre-wrap' }}>{inv.billing_address}</div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '6px' }}>Shipped To</h4>
                    <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155', whiteSpace: 'pre-wrap' }}>{inv.shipping_address}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '40px' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate' }}>
                    <thead style={{ background: '#0F172A', color: 'white' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '14px', fontSize: '10px', textTransform: 'uppercase' }}>Description</th>
                        <th style={{ textAlign: 'right', padding: '14px', fontSize: '10px' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '14px', fontSize: '10px' }}>Rate</th>
                        <th style={{ textAlign: 'right', padding: '14px', fontSize: '10px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.items || []).map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '16px', fontSize: '14px', fontWeight: 700 }}>{it.item_name}</td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>{it.quantity}</td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>₹{it.rate?.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800 }}>₹{it.total_value?.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '64px' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>{inv.notes}</div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><span>Subtotal</span><span>₹{inv.subtotal?.toLocaleString('en-IN')}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderTop: '2px dashed #E2E8F0', marginTop: '12px' }}>
                      <span style={{ fontWeight: 900 }}>Grand Total</span>
                      <span style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '20px' }}>₹{inv.grand_total?.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '80px', textAlign: 'right' }}>
                  <div style={{ height: '60px', width: '200px', borderBottom: '2px solid #0F172A', marginLeft: 'auto', marginBottom: '8px' }}>
                    {inv.signature_data && <img src={inv.signature_data} style={{ width: '150px' }} />}
                  </div>
                  <div style={{ fontWeight: 900 }}>Authorised Signatory</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '32px', maxWidth: '1280px', margin: '0 auto' }}>
            <div className="card card--padded shadow-md" style={{ background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h3 className="text-h3" style={{ margin: 0 }}>O2C Lifecycle Timeline</h3>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>REF: {inv.invoice_number}</span>
              </div>
              
              <div style={{ position: 'relative', paddingLeft: '32px' }}>
                <div style={{ position: 'absolute', left: '11px', top: '10px', bottom: '10px', width: '2px', background: '#F1F5F9' }}></div>

                {[
                  { label: 'PO Received & Logged', date: inv.po_date, desc: 'Sales order confirmed', active: true },
                  { label: 'Delivery Challan Dispatched', date: inv.dispatch_date, desc: 'Material moved from stores', active: true },
                  { label: 'Invoice Generated & Approved', date: inv.invoice_date, desc: 'Official tax document issued', active: true },
                  { label: 'Payment Reconciliation', date: inv.balance <= 0 ? 'Recently' : null, desc: 'Ledger zeroed', active: inv.balance <= 0 }
                ].map((step, idx) => (
                  <div key={idx} style={{ marginBottom: '40px', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: '-27px', top: '2px', width: '14px', height: '14px', borderRadius: '50%',
                      background: step.active ? '#0EA5E9' : '#F1F5F9',
                      border: '3px solid white', boxShadow: '0 0 0 2px ' + (step.active ? '#0EA5E9' : '#F1F5F9')
                    }}></div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: step.active ? '#0F172A' : '#94A3B8' }}>{step.label}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{step.desc}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: step.active ? '#0EA5E9' : '#CBD5E1', marginTop: '4px', textTransform: 'uppercase' }}>
                      {step.date ? new Date(step.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Waiting...'}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-h3" style={{ margin: '48px 0 24px 0', borderTop: '1px solid #F1F5F9', paddingTop: '32px' }}>Payment Ledger</h3>
              {inv.payments?.length > 0 ? (
                <div style={{ background: '#F8FAFC', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F1F5F9' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 900 }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 900 }}>Transaction Ref / Mode</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 900 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.payments.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 600 }}>{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{p.transaction_ref || 'N/A'}</div>
                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>{p.payment_mode}</div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: 900, color: '#059669' }}>₹{p.amount.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#CBD5E1' }}>payments</span>
                  <p style={{ color: '#64748B', fontSize: '14px', marginTop: '8px' }}>No payments recorded for this invoice yet.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card card--padded shadow-sm" style={{ background: '#0F172A', color: 'white' }}>
                <h4 style={{ fontWeight: 800, color: '#94A3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Balance</h4>
                <div style={{ fontSize: '32px', fontWeight: 900, marginTop: '8px' }}>₹{inv.balance?.toLocaleString('en-IN')}</div>
                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                     <span style={{ color: '#94A3B8' }}>Total Billed</span>
                     <span style={{ fontWeight: 700 }}>₹{inv.grand_total?.toLocaleString('en-IN')}</span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                     <span style={{ color: '#94A3B8' }}>Total Received</span>
                     <span style={{ fontWeight: 700, color: '#4ADE80' }}>₹{(inv.grand_total - inv.balance).toLocaleString('en-IN')}</span>
                   </div>
                </div>
              </div>

              {inv.balance > 0 && (
                <div className="card card--padded shadow-md" style={{ background: 'white' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '13px', marginBottom: '20px' }}>Record New Payment</h4>
                  <form onSubmit={handleRecordPayment}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>Payment Date</label>
                      <input className="form-input" type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>UTR / Transaction Reference</label>
                      <input className="form-input" value={paymentForm.transaction_ref} onChange={e => setPaymentForm({ ...paymentForm, transaction_ref: e.target.value })} placeholder="Enter UTR No." required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '11px' }}>Mode</label>
                        <select className="form-select" value={paymentForm.payment_mode} onChange={e => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })}>
                          <option value="NEFT">NEFT</option>
                          <option value="RTGS">RTGS</option>
                          <option value="UPI">UPI</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Cash">Cash</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '11px' }}>Amount (₹)</label>
                        <input className="form-input" type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} required max={inv.balance} />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                      <span className="material-symbols-outlined">add_card</span> Post Payment to Ledger
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {showSignatureModal && (
          <div className="modal-overlay"><div className="card card--padded shadow-xl animate-scale-up" style={{ width: '500px', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 className="text-h3">Authorized Signature</h3>
              <button className="btn-ghost" onClick={() => setShowSignatureModal(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>Please draw your signature in the box below to authorize this tax invoice.</p>
            <div style={{ border: '2px dashed #E2E8F0', borderRadius: '12px', background: '#F8FAFC', marginBottom: '20px', cursor: 'crosshair', touchAction: 'none' }}>
              <canvas ref={canvasRef} width={436} height={180} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} style={{ display: 'block' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <button type="button" className="btn btn-outline" onClick={clearSignature}>Clear Canvas</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowSignatureModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveSignature}>Save & Apply</button>
              </div>
            </div>
          </div></div>
        )}
      </div>
    );
  }

  return (
    <div className="screen-enter">
      <div className="page-header">
        <div>
          <h1 className="text-h1">Invoice Approval Hub</h1>
          <p className="page-header__subtitle">Review and authorize Sales requests</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <button className={`tab-link ${activeTab === 'database' ? 'active' : ''}`} onClick={() => setActiveTab('database')}>Issued Invoices <span className="badge">{invoices.filter(i => i.status !== 'requested').length}</span></button>
        <button className={`tab-link ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Requests from Sales <span className="badge badge--warn">{invoices.filter(i => i.status === 'requested').length}</span></button>
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
        .badge { background: #E2E8F0; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
        .badge--warn { background: #FEF3C7; color: #92400E; }
        .status-pill { padding: 4px 12px; border-radius: 12px; font-size: 11px; fontWeight: 800; text-transform: uppercase; white-space: nowrap; display: inline-block; letter-spacing: 0.02em; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .data-table th { white-space: nowrap; }
        .data-table td { vertical-align: middle; }
      `}</style>
    </div>
  );
}
