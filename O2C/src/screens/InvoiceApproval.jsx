import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getUser } from '../auth';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import AuditTrailModal from '../components/AuditTrailModal';
const capitalizeRole = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const formatSigningDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
};

const formatIndianCommas = (val) => {
  if (val === null || val === undefined) return '';
  const str = val.toString();
  if (!str) return '';
  const parts = str.split('.');
  let integerPart = parts[0].replace(/,/g, '');
  const decimalPart = parts[1];

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherParts = integerPart.substring(0, integerPart.length - 3);
  if (otherParts !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherParts.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

  if (parts.length > 1) {
    return formattedInteger + '.' + decimalPart;
  }
  return formattedInteger;
};

export default function InvoiceApproval() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = getUser();
  const isAccounts = user?.role === 'accounts' || user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('pending');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hiddenInvoice, setHiddenInvoice] = useState(null);
  const [isDownloadingSilent, setIsDownloadingSilent] = useState(false);

  const [verificationState, setVerificationState] = useState({
    gstin: false, address: false, dc: false, po: false,
    taxable: false, gst: false, total: false, qty: false
  });
  const [draftNotes, setDraftNotes] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'NEFT',
    transaction_ref: ''
  });
  const [globalSig, setGlobalSig] = useState(null);

  const fetchGlobalSignature = async () => {
    try {
      console.log('Fetching global signature from /api/global-settings/authorized_signature...');
      const res = await axios.get('/api/global-settings/authorized_signature');
      console.log('Global signature fetch response:', res.data);
      if (res.data && res.data.value) {
        setGlobalSig(res.data.value);
      } else {
        setGlobalSig(null);
      }
    } catch (err) {
      console.error('Failed to fetch signature:', err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchGlobalSignature();
  }, []);

  useEffect(() => {
    if (id) {
      fetchInvoiceDetails(id);
    } else {
      setSelectedInvoice(null);
    }
  }, [id]);

  // Auto-download logic
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('download') === 'true' && selectedInvoice && selectedInvoice.status !== 'requested') {
      const timer = setTimeout(() => {
        handleDownloadPDF();
        // Cleanup URL
        navigate(`/invoice-approval/${selectedInvoice.id}`, { replace: true });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [selectedInvoice]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/invoices', { headers });
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
      const res = await axios.get(`/api/invoices/${invId}`, { headers });
      setSelectedInvoice(res.data);
      if (res.data.verification_state) {
        try {
          setVerificationState(JSON.parse(res.data.verification_state));
        } catch (e) { }
      } else {
        setVerificationState({
          gstin: false, address: false, dc: false, po: false,
          taxable: false, gst: false, total: false, qty: false
        });
      }
      setDraftNotes(res.data.notes || '');
    } catch (err) {
      console.error('Invoice detail error:', err);
      navigate('/invoice-approval');
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

  const numberToIndianWords = (num) => {
    if (isNaN(num) || num === '') return '';
    let n = parseFloat(num);
    if (n <= 0) return '';

    const single = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const double = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const formatThreeDigit = (val) => {
      let str = "";
      if (val >= 100) {
        str += single[Math.floor(val / 100)] + " Hundred ";
        val %= 100;
      }
      if (val >= 10 && val < 20) {
        str += double[val - 10] + " ";
      } else if (val >= 20) {
        str += tens[Math.floor(val / 10)] + " " + single[val % 10] + " ";
      } else if (val > 0) {
        str += single[val] + " ";
      }
      return str;
    };

    let rupee = Math.floor(n);
    let paise = Math.round((n - rupee) * 100);

    let res = "";

    if (rupee === 0) {
      res = "Zero Rupees";
    } else {
      if (rupee >= 10000000) {
        let cr = Math.floor(rupee / 10000000);
        res += formatThreeDigit(cr) + "Crore ";
        rupee %= 10000000;
      }
      if (rupee >= 100000) {
        let lk = Math.floor(rupee / 100000);
        res += formatThreeDigit(lk) + "Lakh ";
        rupee %= 100000;
      }
      if (rupee >= 1000) {
        let th = Math.floor(rupee / 1000);
        res += formatThreeDigit(th) + "Thousand ";
        rupee %= 1000;
      }
      if (rupee > 0) {
        res += formatThreeDigit(rupee);
      }
      res += "Rupees";
    }

    if (paise > 0) {
      res += " and " + formatThreeDigit(paise) + "Paise";
    }

    return res.replace(/\s+/g, ' ').trim() + " Only";
  };

  const handleDownloadPDF = async (targetInv = null) => {
    const inv = targetInv || selectedInvoice;
    if (!inv) return;

    try {
      const token = sessionStorage.getItem('token');
      const response = await axios.get(`/api/invoices/${inv.id}/pdf?regenerate=true`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = inv.invoice_number
        ? `${inv.invoice_number.replace(/\//g, '_')}.pdf`
        : `Invoice_Draft_${inv.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Server PDF Generation/Download failed, falling back to client-side canvas rendering:', err);

      const elementId = targetInv ? 'silent-invoice-printable' : 'tax-invoice-printable';
      const element = document.getElementById(elementId);
      if (!element) return;

      try {
        const { default: html2canvas } = await import('html2canvas');
        const { default: jsPDF } = await import('jspdf');
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const pdf = new jsPDF('p', 'mm', 'a4');
        if (inv.signature_hash) {
          pdf.setProperties({
            title: `Invoice ${inv.invoice_number}`,
            subject: inv.signature_hash,
            keywords: 'O2C-Secured-Invoice'
          });
          pdf.setFontSize(1);
          pdf.setTextColor(255, 255, 255);
          pdf.text(`O2C_SIGNATURE_HASH:${inv.signature_hash}`, 1, 1);
        }
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        pdf.save(inv.invoice_number ? `${inv.invoice_number.replace(/\//g, '_')}.pdf` : `Invoice_Draft_${inv.id}.pdf`);
      } catch (clientErr) {
        console.error('Client PDF Generation Error:', clientErr);
      }
    }
  };

  const handleSilentDownload = async (invId) => {
    setIsDownloadingSilent(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/invoices/${invId}`, { headers });

      setHiddenInvoice(res.data);
      // Wait for React to render the hidden container in the DOM
      setTimeout(async () => {
        await handleDownloadPDF(res.data);
        setHiddenInvoice(null);
        setIsDownloadingSilent(false);
      }, 100);
    } catch (err) {
      console.error(err);
      setIsDownloadingSilent(false);
      Swal.fire({ icon: 'error', title: 'Download Failed', text: 'Could not retrieve PDF from server' });
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/invoices/${selectedInvoice.id}/payment`, paymentForm, { headers });

      // Reset form fields after successful post
      setPaymentForm({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_mode: 'NEFT',
        transaction_ref: ''
      });

      setShowPaymentModal(false);
      fetchInvoiceDetails(selectedInvoice.id);
      fetchData();
      Swal.fire({ icon: 'success', title: 'Payment Recorded', text: "Payment recorded successfully!", timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || "Failed to record payment" });
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
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "Do you want to approve this invoice and generate an official invoice number?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#64748B',
      confirmButtonText: 'Yes, Approve!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post(`/api/invoices/${selectedInvoice.id}/approve`, {}, { headers });
        fetchInvoiceDetails(selectedInvoice.id);
        fetchData();
        Swal.fire({ icon: 'success', title: 'Invoice Approved', text: "Invoice Approved Successfully!", timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Approval Failed', text: err.response?.data?.error || "Approval Failed" });
      }
    }
  };

  const handleReject = async () => {
    const result = await Swal.fire({
      title: 'Reject Request?',
      text: "Are you sure you want to reject this request?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#64748B',
      confirmButtonText: 'Yes, Reject!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post(`/api/invoices/${selectedInvoice.id}/reject`, {}, { headers });
        fetchInvoiceDetails(selectedInvoice.id);
        fetchData();
        Swal.fire({ icon: 'success', title: 'Rejected', text: "Request Rejected.", timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Rejection Failed', text: err.response?.data?.error || "Rejection Failed" });
      }
    }
  };

  const handleSaveDraft = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`/api/invoices/${selectedInvoice.id}/draft`, {
        verification_state: verificationState,
        notes: draftNotes
      }, { headers });
      fetchInvoiceDetails(selectedInvoice.id);
      fetchData();
      Swal.fire({ icon: 'success', title: 'Draft Saved', text: "Draft saved successfully!", timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || "Failed to save draft" });
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
    { header: 'Amount', accessorKey: 'grand_total', cell: ({ getValue }) => `₹${getValue()?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    {
      header: 'Balance Due', accessorKey: 'balance', cell: ({ getValue, row }) => {
        const bal = row.original.status === 'requested' ? row.original.grand_total : (getValue() || 0);
        return (
          <span style={{ color: bal > 0 ? '#B91C1C' : '#059669', fontWeight: 600 }}>
            ₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      }
    },
    {
      header: 'Status', accessorKey: 'status', cell: ({ getValue }) => {
        const cfg = getStatusColor(getValue());
        return <span className="status-pill" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>;
      }
    },
    {
      header: () => <div style={{ textAlign: 'center' }}>{activeTab === 'database' ? 'Update Receipt' : 'Actions'}</div>,
      id: 'actions',
      cell: ({ row }) => (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="btn-ghost btn-sm"
            onClick={() => navigate(`/invoice-approval/${row.original.id}`)}
            title={activeTab === 'database' ? 'Update Receipt' : 'View Preview'}
            style={activeTab === 'database' ? { width: 'auto', padding: '0 8px' } : { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            {activeTab === 'database' ? (
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>Update Receipt</span>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
            )}
          </button>
        </div>
      )
    }
  ], [navigate, activeTab]);

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
    const visibleGstSummary = [];
    const visibleIsStateMatch = !inv.place_of_supply || inv.place_of_supply.toLowerCase().includes('telangana');
    const visibleGroupedGst = {};
    (inv.items || []).forEach(it => {
      const rate = it.gst_percent || 0;
      if (!visibleGroupedGst[rate]) {
        visibleGroupedGst[rate] = { rate, taxable: 0, gst: 0 };
      }
      visibleGroupedGst[rate].taxable += it.taxable_value || 0;
      visibleGroupedGst[rate].gst += it.gst_amount || 0;
    });
    Object.values(visibleGroupedGst).forEach(group => {
      let cgst = '-';
      let sgst = '-';
      let igst = '-';
      if (visibleIsStateMatch) {
        cgst = `₹${(group.gst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        sgst = `₹${(group.gst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        igst = `₹${group.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      visibleGstSummary.push({
        rate: `${group.rate}%`,
        igst,
        cgst,
        sgst
      });
    });

    const hiddenGstSummary = [];
    if (hiddenInvoice) {
      const hiddenIsStateMatch = !hiddenInvoice.place_of_supply || hiddenInvoice.place_of_supply.toLowerCase().includes('telangana');
      const hiddenGroupedGst = {};
      (hiddenInvoice.items || []).forEach(it => {
        const rate = it.gst_percent || 0;
        if (!hiddenGroupedGst[rate]) {
          hiddenGroupedGst[rate] = { rate, taxable: 0, gst: 0 };
        }
        hiddenGroupedGst[rate].taxable += it.taxable_value || 0;
        hiddenGroupedGst[rate].gst += it.gst_amount || 0;
      });
      Object.values(hiddenGroupedGst).forEach(group => {
        let cgst = '-';
        let sgst = '-';
        let igst = '-';
        if (hiddenIsStateMatch) {
          cgst = `₹${(group.gst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          sgst = `₹${(group.gst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
          igst = `₹${group.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        hiddenGstSummary.push({
          rate: `${group.rate}%`,
          igst,
          cgst,
          sgst
        });
      });
    }

    return (
      <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="page-header no-print" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate(-1)} className="btn-ghost btn-back" style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            </button>
            <div>
              <h1 className="text-h1 page-header__title" style={{ fontSize: '16px', margin: 0 }}>
                {inv.status === 'requested' ? 'Accounts Billing & Approval' : 'Official Tax Invoice'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <p className="page-header__subtitle" style={{ margin: 0, fontSize: '12px' }}>{inv.invoice_number} • {inv.customer_name}</p>
                {inv.status !== 'requested' && <span className="status-pill" style={{ background: '#DCFCE7', color: '#166534', fontSize: '10px' }}>APPROVED & LOCKED</span>}
                {inv.signature_hash && (
                  <span className="status-pill" style={{
                    background: inv.is_tampered ? '#FEE2E2' : '#F0F9FF',
                    color: inv.is_tampered ? '#991B1B' : '#0EA5E9',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                      {inv.is_tampered ? 'warning' : 'verified_user'}
                    </span>
                    {inv.is_tampered ? 'INTEGRITY COMPROMISED' : 'INTEGRITY VERIFIED'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline no-print" onClick={() => setShowAuditModal(true)} style={{ height: '34px', fontSize: '13px', padding: '0 12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>history</span> View Audit Trail
            </button>
            {inv.status !== 'requested' && (
              <button className="btn btn-outline no-print" onClick={() => handleDownloadPDF()} style={{ height: '34px', fontSize: '13px', padding: '0 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span> Download PDF
              </button>
            )}
            {inv.status !== 'requested' && (
              <>
                <button className="btn btn-outline no-print" onClick={() => setDetailsTab('timeline')} style={{ height: '34px', fontSize: '13px', padding: '0 12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>payments</span> Record Receipt
                </button>
                <button className="btn btn-primary no-print" onClick={() => Swal.fire({ icon: 'success', title: 'Invoice Sent', text: "Invoice Sent to Customer successfully!", timer: 2000, showConfirmButton: false })} style={{ height: '34px', fontSize: '13px', padding: '0 16px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span> Send to Customer
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', padding: '2px' }}>
          <button className={`tab-link ${detailsTab === 'preview' ? 'active' : ''}`} onClick={() => setDetailsTab('preview')} style={{ padding: '6px 12px', fontSize: '13px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span> Tax Invoice Preview
          </button>
          <button className={`tab-link ${detailsTab === 'timeline' ? 'active' : ''}`} onClick={() => setDetailsTab('timeline')} style={{ padding: '6px 12px', fontSize: '13px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>account_tree</span> Timeline & Payments
          </button>
        </div>

        {detailsTab === 'preview' ? (
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {inv.status === 'requested' && (
              <div className="card shadow-sm animate-fade" style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <button
                  className="btn"
                  onClick={handleApprove}
                  style={{
                    background: '#10B981',
                    color: 'white',
                    border: 'none',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 16px',
                    borderRadius: '6px',
                    transition: 'all 0.2s',
                    fontSize: '13px',
                    height: '34px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>verified</span>
                  Approve & Generate Invoice
                </button>
                <button className="btn btn-outline" style={{ borderColor: '#EF4444', color: '#EF4444', fontWeight: 700, height: '34px', padding: '0 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleReject}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>cancel</span> Reject Request
                </button>
              </div>
            )}
            <div className="card shadow-lg animate-fade" style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
              <div id="tax-invoice-printable" style={{ padding: '24px 32px', background: 'white', color: '#1E293B', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', position: 'relative', zIndex: 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'inline-block', padding: '6px 12px', background: '#F1F5F9', borderRadius: '4px', fontSize: '10px', fontWeight: 900, color: '#475569', letterSpacing: '0.1em', marginBottom: '16px' }}>TAX INVOICE</div>
                    <h2 style={{ fontSize: '32px', fontWeight: 900, margin: 0, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{inv.invoice_number}</h2>
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
                    <img src="/logo.png" alt="Sudha Analyticals" style={{ height: '60px', marginBottom: '8px' }} />
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', lineHeight: 1.1 }}>SUDHA ANALYTICALS</div>
                    <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.6', marginTop: '12px' }}>
                      Plot 18A, Sy No 118, Madhapur<br />Hyderabad, Telangana 500037<br />
                      <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', fontWeight: 700, color: '#1E293B' }}>GSTIN: 36AGTPG0351P1ZY</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#E2E8F0', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ background: '#F8FAFC', padding: '10px' }}>
                    <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Sales Order</div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{inv.po_no}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(inv.po_date).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ background: '#F8FAFC', padding: '10px' }}>
                    <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Delivery Challan</div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{inv.dc_no}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(inv.dispatch_date).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ background: '#F8FAFC', padding: '10px' }}>
                    <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Place of Supply</div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{inv.place_of_supply || 'Telangana'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '24px' }}>
                  <div>
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '4px' }}>Billed To</h4>
                    <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#334155', whiteSpace: 'pre-wrap' }}>{inv.billing_address}</div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '4px' }}>Shipped To</h4>
                    <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#334155', whiteSpace: 'pre-wrap' }}>{inv.shipping_address}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>Package</th>
                        <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>HSN</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>Item Name</th>
                        <th data-html2canvas-ignore="true" style={{ textAlign: 'left', padding: '6px 10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>Description <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '10px', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '10px', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>Rate</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '10px', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>GST %</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '10px', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>Taxable Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '5px 8px', fontSize: '13px', border: '1px solid #E2E8F0' }}>{it.package_name || '-'}</td>
                          <td style={{ padding: '5px 8px', fontSize: '13px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{it.hsn || '-'}</td>
                          <td style={{ padding: '5px 8px', fontSize: '14px', fontWeight: 700, color: 'var(--primary)', border: '1px solid #E2E8F0' }}>{it.item_name}</td>
                          <td data-html2canvas-ignore="true" style={{ padding: '5px 8px', cursor: 'pointer', border: '1px solid #E2E8F0' }} onClick={() => showFullDescription(it.description, it.item_name)}>
                            <div style={{
                              fontSize: '11px',
                              color: '#64748B',
                              maxWidth: '140px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {it.description}
                            </div>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{it.quantity}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #E2E8F0' }}>₹{it.rate?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{it.gst_percent}%</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', border: '1px solid #E2E8F0' }}>₹{it.taxable_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start', marginTop: '20px' }}>
                  {/* Left Column: GST Details Table & Words */}
                  <div>
                    {visibleGstSummary.length > 0 && (
                      <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden', background: '#F8FAFC', marginBottom: '16px' }}>
                        <div style={{ background: '#0F172A', color: '#FFFFFF', padding: '10px 4px', writingMode: 'vertical-rl', transform: 'rotate(180deg)', textTransform: 'uppercase', fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px' }}>
                          GST Details
                        </div>
                        <table style={{ flex: 1, borderCollapse: 'collapse', fontSize: '11px', color: '#1E293B' }}>
                          <thead>
                            <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', color: '#475569' }}>Rate of GST</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', color: '#475569' }}>IGST</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', color: '#475569' }}>CGST</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>SGST</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleGstSummary.map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: idx < visibleGstSummary.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                                <td style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', fontWeight: 'bold' }}>{row.rate}</td>
                                <td style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', textAlign: 'right' }}>{row.igst}</td>
                                <td style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', textAlign: 'right' }}>{row.cgst}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{row.sgst}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#475569', lineHeight: '1.4' }}>
                      <strong>Inv Value in Words:</strong> {numberToIndianWords(inv.grand_total)}
                    </div>
                    {inv.notes && (
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px', borderTop: '1px dashed #E2E8F0', paddingTop: '4px' }}>
                        <strong>Notes:</strong> {inv.notes}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Grand Totals */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', background: '#F8FAFC' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px', fontSize: '13px', textAlign: 'right', color: '#1E293B' }}>
                      <span style={{ color: '#64748B' }}>Total Taxable Value</span>
                      <span style={{ fontWeight: 700 }}>₹{inv.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style={{ color: '#64748B' }}>GST (Total)</span>
                      <span style={{ fontWeight: 700 }}>₹{inv.gst_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style={{ fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', color: '#0F172A' }}>Invoice Value</span>
                      <span style={{ fontWeight: 900, fontSize: '18px', color: 'var(--primary)', paddingTop: '8px', borderTop: '1px dashed #E2E8F0' }}>₹{inv.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '30px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: '20px' }}>
                  <div style={{ minHeight: '60px', width: '200px', borderBottom: '2px solid #0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                    {(inv.signature_data || globalSig) ? (
                      <img src={inv.signature_data || globalSig} style={{ width: '160px', height: '55px', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 600 }}>No Signature Saved</span>
                    )}
                  </div>
                  <div style={{ fontWeight: '900', fontSize: '11px', width: '200px', textAlign: 'center', textTransform: 'uppercase', color: '#0F172A' }}>Authorised Signatory</div>
                </div>

                {inv.signature_hash && (
                  <div style={{
                    marginTop: '40px',
                    paddingTop: '20px',
                    borderTop: '1px solid #E2E8F0',
                    fontSize: '9px',
                    color: '#64748B',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'monospace'
                  }}>
                    <div>
                      <strong>DIGITALLY VERIFIED INVOICE</strong><br />
                      APPROVED BY: {capitalizeRole(inv.signed_by || 'Accounts')}<br />
                      APPROVED AT: {formatSigningDate(inv.signed_at)}
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <span>SECURE SYSTEM ID: {inv.id}</span>
                      <span style={{ fontWeight: 700, color: inv.is_tampered ? '#EF4444' : '#10B981' }}>
                        STATUS: {inv.is_tampered ? 'COMPROMISED' : 'VERIFIED'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '16px', maxWidth: '1280px', margin: '0 auto' }}>
            <div className="card shadow-md" style={{ background: 'white', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="text-h3" style={{ margin: 0, fontSize: '14px' }}>O2C Lifecycle Timeline</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>REF: {inv.invoice_number}</span>
              </div>

              <div style={{ position: 'relative', paddingLeft: '32px' }}>
                <div style={{ position: 'absolute', left: '11px', top: '10px', bottom: '10px', width: '2px', background: '#F1F5F9' }}></div>

                {[
                  { label: 'PO Received & Logged', date: inv.po_date, desc: 'Sales order confirmed', active: true },
                  { label: 'Delivery Challan Dispatched', date: inv.dispatch_date, desc: 'Material moved from stores', active: true },
                  { label: 'Invoice Generated & Approved', date: inv.status !== 'requested' ? inv.invoice_date : null, desc: 'Official tax document issued', active: inv.status !== 'requested' },
                  { label: 'Payment Reconciliation', date: (inv.balance <= 0 && inv.status !== 'requested') ? new Date().toISOString() : null, desc: 'Ledger zeroed', active: (inv.balance <= 0 && inv.status !== 'requested') }
                ].map((step, idx) => (
                  <div key={idx} style={{ marginBottom: '20px', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: '-27px', top: '2px', width: '14px', height: '14px', borderRadius: '50%',
                      background: step.active ? '#0EA5E9' : '#F1F5F9',
                      border: '3px solid white', boxShadow: '0 0 0 2px ' + (step.active ? '#0EA5E9' : '#F1F5F9')
                    }}></div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: step.active ? '#0F172A' : '#94A3B8' }}>{step.label}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{step.desc}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: step.active ? '#0EA5E9' : '#CBD5E1', marginTop: '4px', textTransform: 'uppercase' }}>
                      {step.date ? new Date(step.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Waiting...'}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-h3" style={{ margin: '20px 0 12px 0', borderTop: '1px solid #F1F5F9', paddingTop: '16px', fontSize: '14px' }}>Payment Ledger</h3>
              {inv.payments?.length > 0 ? (
                <div style={{ background: '#F8FAFC', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F1F5F9' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 900 }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 900 }}>Transaction Ref / Mode</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 900 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.payments.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{p.transaction_ref || 'N/A'}</div>
                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>{p.payment_mode}</div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '14px', fontWeight: 900, color: '#059669' }}>₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card shadow-sm" style={{ background: '#0F172A', color: 'white', padding: '16px' }}>
                <h4 style={{ fontWeight: 800, color: '#94A3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Balance</h4>
                <div style={{ fontSize: '24px', fontWeight: 900, marginTop: '4px' }}>
                  ₹{(inv.status === 'requested' ? inv.grand_total : (inv.balance || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                    <span style={{ color: '#94A3B8' }}>Total Billed</span>
                    <span style={{ fontWeight: 700 }}>₹{inv.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#94A3B8' }}>Total Received</span>
                    <span style={{ fontWeight: 700, color: '#4ADE80' }}>
                      ₹{(inv.status === 'requested' ? 0 : Math.max(0, inv.grand_total - (inv.balance || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {inv.balance > 0 && (
                <div className="card shadow-md" style={{ background: 'white', padding: '16px' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '13px', marginBottom: '12px' }}>Record New Payment</h4>
                  <form onSubmit={handleRecordPayment} autoComplete="off">
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label className="form-label" style={{ fontSize: '11px', marginBottom: '2px' }}>Payment Date</label>
                      <div className="date-picker-container" style={{ height: '34px' }}>
                        <DatePicker
                          selected={paymentForm.payment_date ? new Date(paymentForm.payment_date) : null}
                          onChange={(date) => setPaymentForm({ ...paymentForm, payment_date: date ? date.toISOString().split('T')[0] : '' })}
                          dateFormat="dd/MM/yyyy"
                          className="form-input"
                          placeholderText="DD/MM/YYYY"
                          required
                        />
                        <span className="material-symbols-outlined calendar-icon" style={{ fontSize: '16px', right: '10px' }}>calendar_today</span>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label className="form-label" style={{ fontSize: '11px', marginBottom: '2px' }}>UTR / Transaction Reference</label>
                      <input className="form-input" value={paymentForm.transaction_ref} onChange={e => setPaymentForm({ ...paymentForm, transaction_ref: e.target.value })} placeholder="Enter UTR No." required autoComplete="off" style={{ height: '34px', fontSize: '13px', padding: '0 10px', borderRadius: '6px' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: '10px' }}>
                        <label className="form-label" style={{ fontSize: '11px', marginBottom: '2px' }}>Mode</label>
                        <select className="form-select" value={paymentForm.payment_mode} onChange={e => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })} style={{ height: '34px', fontSize: '13px', padding: '0 10px', borderRadius: '6px' }}>
                          <option value="NEFT">NEFT</option>
                          <option value="RTGS">RTGS</option>
                          <option value="UPI">UPI</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Cash">Cash</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: '10px' }}>
                        <label className="form-label" style={{ fontSize: '11px', marginBottom: '2px' }}>Amount (₹)</label>
                        <input
                          className="form-input"
                          type="text"
                          name="p_amount"
                          id="p_amount"
                          value={formatIndianCommas(paymentForm.amount)}
                          onChange={e => {
                            let val = e.target.value.replace(/,/g, '');
                            // Allow only digits and up to one decimal point
                            val = val.replace(/[^0-9.]/g, '');
                            const parts = val.split('.');
                            if (parts.length > 2) {
                              val = parts[0] + '.' + parts.slice(1).join('');
                            }
                            if (parts[1] && parts[1].length > 2) {
                              val = parts[0] + '.' + parts[1].substring(0, 2);
                            }
                            // Enforce max balance limit
                            const maxVal = inv.balance || 0;
                            const num = parseFloat(val);
                            if (!isNaN(num) && num > maxVal) {
                              val = maxVal.toFixed(2);
                            }
                            setPaymentForm({ ...paymentForm, amount: val });
                          }}
                          required
                          autoComplete="new-password"
                          placeholder="0.00"
                          style={{ height: '34px', fontSize: '13px', padding: '0 10px', borderRadius: '6px' }}
                        />
                        {paymentForm.amount && !isNaN(parseFloat(paymentForm.amount)) && (
                          <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px', fontWeight: 700, lineHeight: '1.4' }}>
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(parseFloat(paymentForm.amount))}
                            <span style={{ display: 'block', color: '#475569', fontWeight: 500, fontSize: '10px', marginTop: '2px' }}>
                              ({numberToIndianWords(parseFloat(paymentForm.amount))})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px', height: '34px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_card</span> Post Payment to Ledger
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}


        <AuditTrailModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          moduleName="Invoice"
          referenceId={selectedInvoice?.id}
          isTampered={selectedInvoice?.is_tampered}
        />
      </div>
    );
  }

  return (
    <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 className="text-h1 page-header__title" style={{ fontSize: '24px', margin: 0 }}>Invoice Approval Hub</h1>
          <p className="page-header__subtitle" style={{ fontSize: '12px', margin: 0 }}>Review and authorize Sales requests</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type="text"
              placeholder="Search invoices..."
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '12px',
                paddingRight: '12px',
                borderRadius: '6px',
                border: '1.5px solid #d1d5db',
                background: 'white',
                fontSize: '13px',
                color: 'var(--text-primary)',
                transition: 'all 0.18s ease',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary)';
                e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button className={`tab-link ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')} style={{ padding: '6px 12px', fontSize: '13px' }}>Requests from Sales <span className="badge badge--warn">{invoices.filter(i => i.status === 'requested').length}</span></button>
        <button className={`tab-link ${activeTab === 'database' ? 'active' : ''}`} onClick={() => setActiveTab('database')} style={{ padding: '6px 12px', fontSize: '13px' }}>Issued Invoices <span className="badge">{invoices.filter(i => i.status !== 'requested').length}</span></button>
      </div>

      <div className="card data-table-wrapper">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
      {/* Hidden container for silent PDF generation */}
      {hiddenInvoice && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '210mm', zIndex: -100 }}>
          <div id="silent-invoice-printable" style={{ padding: '48px', background: 'white', color: '#1E293B' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'inline-block', padding: '6px 12px', background: '#F1F5F9', borderRadius: '4px', fontSize: '10px', fontWeight: 900, color: '#475569', letterSpacing: '0.1em', marginBottom: '16px' }}>TAX INVOICE</div>
                <h2 style={{ fontSize: '42px', fontWeight: 900, margin: 0, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{hiddenInvoice.invoice_number}</h2>
                <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Date of Issue</div>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>{new Date(hiddenInvoice.invoice_date).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ width: '1px', background: '#E2E8F0' }}></div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Payment Due</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#DC2626' }}>{hiddenInvoice.due_date ? new Date(hiddenInvoice.due_date).toLocaleDateString('en-IN') : '-'}</div>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', maxWidth: '280px' }}>
                <img src="/logo.png" alt="Sudha Analyticals" style={{ height: '60px', marginBottom: '8px' }} />
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', lineHeight: 1.1 }}>SUDHA ANALYTICALS</div>
                <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.6', marginTop: '12px' }}>
                  Plot 18A, Sy No 118, Madhapur<br />Hyderabad, Telangana 500037<br />
                  <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', fontWeight: 700, color: '#1E293B' }}>GSTIN: 36AGTPG0351P1ZY</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#E2E8F0', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '40px' }}>
              <div style={{ background: '#F8FAFC', padding: '16px' }}>
                <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Sales Order</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{hiddenInvoice.po_no}</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(hiddenInvoice.po_date).toLocaleDateString('en-IN')}</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '16px' }}>
                <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Delivery Challan</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{hiddenInvoice.dc_no}</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(hiddenInvoice.dispatch_date).toLocaleDateString('en-IN')}</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '16px' }}>
                <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Place of Supply</div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>{hiddenInvoice.place_of_supply || 'Telangana'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', marginBottom: '48px' }}>
              <div>
                <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '6px' }}>Billed To</h4>
                <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155', whiteSpace: 'pre-wrap' }}>{hiddenInvoice.billing_address}</div>
              </div>
              <div>
                <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '6px' }}>Shipped To</h4>
                <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155', whiteSpace: 'pre-wrap' }}>{hiddenInvoice.shipping_address}</div>
              </div>
            </div>

            <div style={{ marginBottom: '40px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E2E8F0' }}>
                <thead style={{ background: '#0F172A', color: 'white' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>Package</th>
                    <th style={{ textAlign: 'center', padding: '10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>HSN</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>Item Name</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>GST %</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #E2E8F0' }}>Taxable Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(hiddenInvoice.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '10px', fontSize: '13px', border: '1px solid #E2E8F0' }}>{it.package_name || '-'}</td>
                      <td style={{ padding: '10px', fontSize: '13px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{it.hsn || '-'}</td>
                      <td style={{ padding: '10px', fontSize: '14px', border: '1px solid #E2E8F0', fontWeight: 'bold' }}>{it.item_name}</td>
                      <td style={{ padding: '10px', fontSize: '13px', border: '1px solid #E2E8F0', textAlign: 'right' }}>{it.quantity}</td>
                      <td style={{ padding: '10px', fontSize: '13px', border: '1px solid #E2E8F0', textAlign: 'right' }}>₹{it.rate?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px', fontSize: '13px', border: '1px solid #E2E8F0', textAlign: 'right' }}>{it.gst_percent}%</td>
                      <td style={{ padding: '10px', fontSize: '13px', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 'bold' }}>₹{it.taxable_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start', marginTop: '20px' }}>
              {/* Left Column: GST Details Table & Words */}
              <div>
                {hiddenGstSummary.length > 0 && (
                  <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden', background: '#F8FAFC', marginBottom: '16px' }}>
                    <div style={{ background: '#0F172A', color: '#FFFFFF', padding: '10px 4px', writingMode: 'vertical-rl', transform: 'rotate(180deg)', textTransform: 'uppercase', fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px' }}>
                      GST Details
                    </div>
                    <table style={{ flex: 1, borderCollapse: 'collapse', fontSize: '11px', color: '#1E293B' }}>
                      <thead>
                        <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', color: '#475569' }}>Rate of GST</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', color: '#475569' }}>IGST</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', color: '#475569' }}>CGST</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>SGST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hiddenGstSummary.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < hiddenGstSummary.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                            <td style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', fontWeight: 'bold' }}>{row.rate}</td>
                            <td style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', textAlign: 'right' }}>{row.igst}</td>
                            <td style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', textAlign: 'right' }}>{row.cgst}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{row.sgst}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#475569', lineHeight: '1.4' }}>
                  <strong>Inv Value in Words:</strong> {numberToIndianWords(hiddenInvoice.grand_total)}
                </div>
                {hiddenInvoice.notes && (
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px', borderTop: '1px dashed #E2E8F0', paddingTop: '4px' }}>
                    <strong>Notes:</strong> {hiddenInvoice.notes}
                  </div>
                )}
              </div>

              {/* Right Column: Grand Totals */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', background: '#F8FAFC' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px', fontSize: '13px', textAlign: 'right', color: '#1E293B' }}>
                  <span style={{ color: '#64748B' }}>Total Taxable Value</span>
                  <span style={{ fontWeight: 700 }}>₹{hiddenInvoice.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ color: '#64748B' }}>GST (Total)</span>
                  <span style={{ fontWeight: 700 }}>₹{hiddenInvoice.gst_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', color: '#0F172A' }}>Invoice Value</span>
                  <span style={{ fontWeight: 900, fontSize: '18px', color: 'var(--primary)', paddingTop: '8px', borderTop: '1px dashed #E2E8F0' }}>₹{hiddenInvoice.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '30px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: '20px' }}>
              <div style={{ minHeight: '60px', width: '200px', borderBottom: '2px solid #0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                {(hiddenInvoice.signature_data || globalSig) ? (
                  <img src={hiddenInvoice.signature_data || globalSig} style={{ width: '160px', height: '55px', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 600 }}>No Signature Saved</span>
                )}
              </div>
              <div style={{ fontWeight: '900', fontSize: '11px', width: '200px', textAlign: 'center', textTransform: 'uppercase', color: '#0F172A' }}>Authorised Signatory</div>
            </div>

            {hiddenInvoice.signature_hash && (
              <div style={{
                marginTop: '30px',
                paddingTop: '16px',
                borderTop: '1px solid #E2E8F0',
                fontSize: '9px',
                color: '#64748B',
                fontFamily: 'monospace'
              }}>
                <strong>DIGITALLY VERIFIED INVOICE</strong><br />
                APPROVED BY: {capitalizeRole(hiddenInvoice.signed_by || 'Accounts')}<br />
                APPROVED AT: {formatSigningDate(hiddenInvoice.signed_at)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
