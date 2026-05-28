import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
// Signature pad replaced with native canvas for better reliability
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function RaiseDC() {
  const [view, setView] = useState('list'); // 'list' or 'detail'
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'tracking'
  const [trackingDCs, setTrackingDCs] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const navigate = useNavigate();
  const { id } = useParams();

  // Accounts Entry States
  const [manualDC, setManualDC] = useState('');
  const [customDCNo, setCustomDCNo] = useState('');
  const [dispatchFrom, setDispatchFrom] = useState({ line1: '', line2: '', pin: '' });
  const [dispatchTo, setDispatchTo] = useState({ enabled: false, name: '', line1: '', line2: '', city: '', state: '', pin: '' });
  const [signatureImage, setSignatureImage] = useState(null);
  const [itemHSNs, setItemHSNs] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [hiddenData, setHiddenData] = useState(null); // { type: 'dc'|'invoice', data: any }
  const [isDownloadingSilent, setIsDownloadingSilent] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [projectUsers, setProjectUsers] = useState([]);
  const [selectedProjectSpocEmail, setSelectedProjectSpocEmail] = useState('');


  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (id) {
      loadDetails(id);
    } else {
      setView('list');
      setDetails(null);
      setSignatureImage(null);
    }
  }, [id, trackingDCs]);

  // Auto-download logic for tracking table
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('download') === 'true' && details && details.dc_number && signatureImage) {
      setShowPreview(true);
      const timer = setTimeout(() => {
        downloadPDF();
        // Cleanup URL
        navigate(`/raise-dc/${details.id}`, { replace: true });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [details, signatureImage]);

  const fetchDetailDirectly = async (targetId) => {
    setLoadingDetails(true);
    setView('detail');
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Try fetching as a Delivery Challan request first
      try {
        const res = await axios.get(`/api/dc-requests/${targetId}`, { headers });
        if (res.data) {
          setDetails(res.data);
          return;
        }
      } catch (e) { }

      // Then try as a DC
      const resDc = await axios.get(`/api/dc/${targetId}`, { headers });
      setDetails(resDc.data);
    } catch (err) {
      console.error(err);
      setView('list');
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Load Pending Requests
      const reqRes = await axios.get('/api/dc-requests', { headers });
      const filtered = reqRes.data.filter(r => r.status === 'dc_requested');
      setRequests(filtered);

      // 2. Load Generated DCs for Tracking
      const dcRes = await axios.get('/api/dc', { headers });
      setTrackingDCs(dcRes.data);

      // 3. Load Project Users
      try {
        const puRes = await axios.get('/api/project-users', { headers });
        setProjectUsers(Array.isArray(puRes.data) ? puRes.data : []);
      } catch (errProject) {
        console.error('Failed to fetch project users', errProject);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (request) => {
    navigate(`/raise-dc/${request.id}`);
  };

  const loadDetails = async (targetId) => {
    setLoadingDetails(true);
    setView('detail');
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Try Delivery Challan Request endpoint first since we are in the "Raise" screen
      let res;
      try {
        res = await axios.get(`/api/dc-requests/${targetId}`, { headers });
      } catch (e) {
        // Fallback to DC endpoint if not found in requests
        res = await axios.get(`/api/dc/${targetId}`, { headers });
      }

      if (!res || !res.data) throw new Error('Data not found');
      setDetails(res.data);
      setSelectedProjectSpocEmail(res.data.email_to_project || res.data.project_spoc_email || '');

      // Initialize HSNs
      const hsns = {};
      if (res.data.items) {
        res.data.items.forEach(it => {
          hsns[it.line_item_id || it.id] = '';
        });
      }
      setItemHSNs(hsns);

      // Reset entry states
      setManualDC('');
      setCustomDCNo('');
      setDispatchFrom({ line1: '', line2: '', pin: '' });

      // If already issued, set the signature. Otherwise, fetch global setting.
      if (res.data.signature_data || res.data.signature) {
        setSignatureImage(res.data.signature_data || res.data.signature);
      } else {
        try {
          const sigRes = await axios.get('/api/global-settings/authorized_signature');
          setSignatureImage(sigRes.data.value || null);
        } catch (sigErr) {
          console.error('Failed to load global signature:', sigErr);
          setSignatureImage(null);
        }
      }

    } catch (err) {
      console.error(err);
      setView('list');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSilentDownload = async (row) => {
    setIsDownloadingSilent(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      let docData;
      let docType;

      if (row.invoice_id) {
        const res = await axios.get(`/api/invoices/${row.invoice_id}`, { headers });
        docData = res.data;
        docType = 'invoice';
      } else {
        try {
          const res = await axios.get(`/api/dc-requests/${row.id}`, { headers });
          docData = res.data;
        } catch (e) {
          const res = await axios.get(`/api/dc/${row.id}`, { headers });
          docData = res.data;
        }
        docType = 'dc';
      }

      setHiddenData({ type: docType, data: docData });

      // Wait for render
      setTimeout(async () => {
        const elementId = docType === 'invoice' ? 'silent-invoice-capture' : 'silent-dc-capture';
        const element = document.getElementById(elementId);
        if (element) {
          const canvas = await html2canvas(element, { scale: 2, useCORS: true });
          const imgData = canvas.toDataURL('image/jpeg', 0.85);
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          const fileName = docType === 'invoice' ? `${docData.invoice_number}.pdf` : `${docData.dc_number || 'DC'}.pdf`;
          pdf.save(fileName);
        }
        setHiddenData(null);
        setIsDownloadingSilent(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setIsDownloadingSilent(false);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to generate PDF' });
    }
  };



  const handleRaiseDC = () => {
    if (!details) return;

    // Validate HSN codes are provided (always mandatory as invoice is auto-generated)
    const missingHSN = details.items.some(it => {
      const val = itemHSNs[it.line_item_id || it.id];
      return !val || !val.trim();
    });
    if (missingHSN) {
      Swal.fire({
        icon: 'warning',
        title: 'HSN Entry Required',
        text: 'HSN codes are mandatory for all items. Please enter HSN codes before proceeding.'
      });
      return;
    }

    // Validate HSN pattern: 4digits-2digits-2digits (e.g. 1234-56-78)
    const invalidHSNPattern = details.items.some(it => {
      const val = itemHSNs[it.line_item_id || it.id] || '';
      return !/^\d{4}-\d{2}-\d{2}$/.test(val);
    });

    if (invalidHSNPattern) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid HSN Format',
        text: 'All HSN entries must follow the 4digits-2digits-2digits pattern (e.g., 1234-56-78).'
      });
      return;
    }

    setShowPreview(true);
  };

  const downloadPDF = async () => {
    const element = document.getElementById('dc-preview-container');
    if (!element) return;

    // Show a loading state or similar if needed
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        // Hide UI elements in the PDF
        const toolbar = clonedDoc.getElementById('pdf-toolbar');
        if (toolbar) toolbar.style.display = 'none';

        const clearBtn = clonedDoc.getElementById('pdf-signature-clear');
        if (clearBtn) clearBtn.style.display = 'none';

        // Add proper padding for PDF look
        const container = clonedDoc.getElementById('dc-preview-container');
        if (container) {
          container.style.boxShadow = 'none';
          container.style.padding = '20mm'; // Standard A4 padding
        }
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Multi-page or long-page support
    if (pdfHeight > 297) {
      // If it's very long, create a custom sized PDF to keep it in one piece
      const longPdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      longPdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      longPdf.save(`DC_${details.dc_number || details.requested_dc_number}.pdf`);
    } else {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(`DC_${details.dc_number || details.requested_dc_number}.pdf`);
    }
  };

  const finalizeRaiseDC = async () => {
    if (!details) return;

    if (!signatureImage) {
      Swal.fire({
        icon: 'warning',
        title: 'Signature Required',
        text: 'Please provide and insert an authorized signature first.'
      });
      return;
    }

    // Validate HSN codes are provided (always mandatory as invoice is auto-generated)
    const missingHSN = details.items.some(it => {
      const val = itemHSNs[it.line_item_id || it.id];
      return !val || !val.trim();
    });
    if (missingHSN) {
      Swal.fire({
        icon: 'warning',
        title: 'HSN Entry Required',
        text: 'HSN codes are mandatory for all items. Please enter HSN codes before proceeding.'
      });
      return;
    }

    // Validate HSN pattern: 4digits-2digits-2digits (e.g. 1234-56-78)
    const invalidHSNPattern = details.items.some(it => {
      const val = itemHSNs[it.line_item_id || it.id] || '';
      return !/^\d{4}-\d{2}-\d{2}$/.test(val);
    });

    if (invalidHSNPattern) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid HSN Format',
        text: 'All HSN entries must follow the 4digits-2digits-2digits pattern (e.g., 1234-56-78).'
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const signatureData = signatureImage;

      const payload = {
        customDCNo,
        manualDC,
        dispatchFrom: (dispatchFrom.line1 || dispatchFrom.line2 || dispatchFrom.pin) ? dispatchFrom : null,
        dispatchTo: dispatchTo.enabled ? dispatchTo : null,
        itemHSNs,
        signature: signatureData,
        email_to_project: selectedProjectSpocEmail
      };

      const res = await axios.post(`/api/dc-requests/${details.id}/raise`, payload, { headers });

      Swal.fire({ icon: 'success', title: 'DC Request Raised', text: `Delivery Challan ${res.data.dc_number} raised successfully!`, timer: 2000, showConfirmButton: false });
      setShowPreview(false);
      navigate('/raise-dc');
      fetchData();
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to raise Delivery Challan' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    {
      header: 'Sl no',
      cell: info => <span style={{ color: '#6B7280', fontSize: '13px' }}>{info.row.index + 1}</span>,
    },
    {
      header: 'Sales Order No',
      accessorKey: 'po_no',
      cell: info => <span style={{ fontWeight: 700, color: '#111827', fontSize: '13px' }}>{info.getValue()}</span>,
    },
    {
      header: 'DC REG NO',
      accessorKey: 'dc_request_no',
      cell: info => <span style={{ color: '#2563EB', fontWeight: 600, fontSize: '12px' }}>{info.getValue()}</span>,
    },
    {
      header: 'CUSTOMER',
      accessorKey: 'customer_name',
      cell: info => <span style={{ fontSize: '13px' }}>{info.getValue()}</span>,
    },
    {
      header: 'LOCATION',
      accessorKey: 'location_name',
      cell: info => (
        <div>
          <div style={{ fontWeight: 500, fontSize: '13px' }}>{info.getValue()}</div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>{info.row.original.location_city}</div>
        </div>
      ),
    },
    {
      header: 'STATUS',
      accessorKey: 'status',
      cell: info => {
        const val = info.getValue();
        const labels = {
          pending: { label: 'MATERIAL PACKED', bg: '#D1FAE5', text: '#065F46' },
          dispatched: { label: 'DISPATCHED', bg: '#DBEAFE', text: '#1E40AF' }
        };
        const s = labels[val] || { label: val.toUpperCase(), bg: '#F3F4F6', text: '#374151' };
        return (
          <span style={{
            padding: '2px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 800,
            background: s.bg,
            color: s.text,
            letterSpacing: '0.05em'
          }}>
            {s.label}
          </span>
        );
      }
    },
    {
      header: 'Action',
      cell: info => (
        <button
          className="btn-ghost"
          onClick={() => handleView(info.row.original)}
          style={{ padding: '2px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#6366F1' }}>visibility</span>
        </button>
      )
    }
  ], []);

  const trackingColumns = useMemo(() => [
    {
      header: 'Delivery Challan No',
      accessorKey: 'dc_number',
      cell: info => <span style={{ fontWeight: 700, color: '#111827', fontSize: '13px' }}>{info.getValue()}</span>,
    },
    {
      header: 'Sales Order No',
      accessorKey: 'po_no',
      cell: info => <span style={{ color: '#4B5563', fontSize: '13px' }}>{info.getValue()}</span>,
    },
    {
      header: 'CUSTOMER',
      accessorKey: 'customer_name',
      cell: info => <span style={{ fontSize: '13px' }}>{info.getValue()}</span>,
    },
    {
      header: 'STATUS',
      accessorKey: 'status',
      cell: info => {
        const status = info.getValue();
        const delStatus = info.row.original.delivery_status;

        let label = status.replace(/_/g, ' ').toUpperCase();
        let bg = '#F3F4F6';
        let text = '#374151';

        if (status === 'ready_for_dispatch') { bg = '#FEF3C7'; text = '#92400E'; label = 'READY FOR DISPATCH'; }
        if (status === 'in_transit') { bg = '#DBEAFE'; text = '#1E40AF'; label = 'IN TRANSIT'; }
        if (delStatus === 'delivery_confirmed') { bg = '#D1FAE5'; text = '#065F46'; label = 'DELIVERED'; }

        return (
          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, background: bg, color: text }}>
            {label}
          </span>
        );
      }
    },
    {
      header: 'LOGISTICS DETAILS',
      accessorKey: 'vehicle_no',
      cell: info => {
        const d = info.row.original;
        if (!d.vehicle_no) return <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Pending Dispatch</span>;
        return (
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
            <div style={{ fontWeight: 700, color: '#065F46' }}>{d.vehicle_no}</div>
            <div style={{ color: '#4B5563' }}>{d.driver_name} | {d.driver_phone}</div>
          </div>
        );
      }
    },
    {
      header: 'Action',
      cell: info => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ghost" onClick={() => navigate(`/raise-dc/${info.row.original.id}`)} style={{ padding: '2px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#6366F1' }}>visibility</span>
          </button>
        </div>
      )
    }
  ], []);

  const table = useReactTable({
    data: activeTab === 'pending' ? requests : trackingDCs,
    columns: activeTab === 'pending' ? columns : trackingColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const handleHSNChange = (id, val) => {
    const numeric = val.replace(/\D/g, '').slice(0, 8);
    let formatted = numeric;
    if (numeric.length > 6) {
      formatted = `${numeric.slice(0, 4)}-${numeric.slice(4, 6)}-${numeric.slice(6)}`;
    } else if (numeric.length > 4) {
      formatted = `${numeric.slice(0, 4)}-${numeric.slice(4)}`;
    }
    setItemHSNs(prev => ({ ...prev, [id]: formatted }));
  };

  if (view === 'detail') {
    return (
      <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="page-header" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/raise-dc')} className="btn-ghost btn-back" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
            </button>
            <h1 className="text-h1 page-header__title" style={{ fontSize: '16px', margin: 0 }}>Raise Delivery Challan</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Request:</span>
            <span style={{ padding: '2px 8px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
              {details?.dc_request_no || '...'}
            </span>
          </div>
        </div>

        {loadingDetails ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', fontSize: '15px' }}>Loading request details...</div>
        ) : details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* AMAZON STYLE STEPPER */}
            <div className="card animate-slide-up" style={{ padding: '12px 24px', border: '1px solid #E5E7EB', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Connector Lines */}
                <div style={{ position: 'absolute', top: '13px', left: '30px', right: '30px', height: '2px', background: '#E5E7EB', zIndex: 0 }}></div>
                <div style={{
                  position: 'absolute',
                  top: '13px',
                  left: '30px',
                  width: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'calc(100% - 60px)' :
                    details.status === 'in_transit' ? 'calc(66.6% - 30px)' :
                      (details.status === 'ready_for_dispatch' || details.status === 'dc_approved') ? 'calc(33.3% - 30px)' : '0%',
                  height: '2px',
                  background: '#10B981',
                  zIndex: 0,
                  transition: 'width 0.5s ease'
                }}></div>

                {/* Steps */}
                {[
                  {
                    id: 'requested', label: 'DC Requested', icon: 'check_circle', sub: 'Requested by Stores',
                    active: true
                  },
                  {
                    id: 'approved', label: 'DC Approved', icon: (details.status === 'dispatched' || details.status === 'ready_for_dispatch' || details.status === 'in_transit' || details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'check_circle' : 'pending_actions', sub: 'Accounts Verified',
                    active: (details.status === 'dispatched' || details.status === 'ready_for_dispatch' || details.status === 'in_transit' || details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed')
                  },
                  {
                    id: 'transit', label: 'In Transit', icon: 'local_shipping', sub: 'Shipment Dispatched',
                    active: (details.status === 'dispatched' || details.status === 'in_transit' || details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed')
                  },
                  {
                    id: 'confirmed', label: 'Confirmed', icon: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'task_alt' : 'verified_user', sub: 'Site Receipt Verified',
                    active: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed')
                  }
                ].map((step, idx) => (
                  <div key={idx} style={{ zIndex: 1, textAlign: 'center', background: 'white', padding: '0 8px' }}>
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: step.active ? '#10B981' : 'white',
                      border: `2px solid ${step.active ? '#10B981' : '#E5E7EB'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      color: step.active ? 'white' : '#9CA3AF',
                      transition: 'all 0.3s ease'
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{step.active ? 'check' : step.icon}</span>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: step.active ? '#111827' : '#9CA3AF' }}>{step.label}</div>
                      <div style={{ fontSize: '9px', color: '#6B7280' }}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Logistics & Dispatch Settings (Provided by Stores) */}
            <div className="card animate-slide-up" style={{ padding: '10px 16px', border: '1px solid #E5E7EB', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Logistics & Dispatch Information</h4>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>Requested Delivery Challan No:</span>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#1E40AF' }}>{details.requested_dc_number || 'Auto-Generate'}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr', gap: '12px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Vehicle No</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.vehicle_no || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Driver Name / Agent Name</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.driver_name || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Driver Phone</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.driver_phone || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Transporter</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.transporter || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Despatch From Address</label>
                  <div style={{ fontSize: '12px', lineHeight: '1.4', color: 'var(--primary)', fontWeight: 600 }}>
                    {details.dispatch_from_address1 ? (
                      <>
                        <div style={{ fontWeight: 700 }}>{details.dispatch_from_address1}</div>
                        <div>{details.dispatch_from_address2} | {details.dispatch_from_pincode}</div>
                        {details.dispatch_from_landmark && <div style={{ fontStyle: 'italic', color: '#64748B' }}>Landmark: {details.dispatch_from_landmark}</div>}
                      </>
                    ) : (
                      [
                        details.location_name,
                        details.location_address,
                        details.location_address2,
                        details.location_address3,
                        details.location_city,
                        details.location_state ? `${details.location_state} - ${details.location_pincode || ''}` : details.location_pincode
                      ].filter(Boolean).join(', ')
                    )}
                  </div>
                </div>
              </div>

              {/* Added Proof & Remarks */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Dispatch Proof</label>
                  {details.proof_path ? (
                    <div
                      onClick={() => setPreviewImage({ url: `${API_BASE_URL}${details.proof_path}`, name: 'Dispatch Proof' })}
                      style={{ display: 'block', border: '1px solid #E2E8F0', borderRadius: '4px', overflow: 'hidden', background: 'white', cursor: 'pointer' }}
                    >
                      <img src={`${API_BASE_URL}${details.proof_path}`} alt="Proof" style={{ width: '100%', height: '60px', objectFit: 'cover' }} />
                      <div style={{ fontSize: '10px', textAlign: 'center', padding: '2px', background: '#F1F5F9', color: '#2563EB', fontWeight: 700 }}>VIEW FULL PHOTO</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '10px', border: '1px dashed #CBD5E1', borderRadius: '4px', textAlign: 'center' }}>No proof uploaded</div>
                  )}
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Stores Remarks</label>
                  <div style={{ fontSize: '13px', color: '#334155', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #E2E8F0', minHeight: '60px' }}>
                    {details.logistics_remarks || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>No remarks provided.</span>}
                  </div>
                </div>
              </div>
            </div>

            {details.status === 'dc_requested' ? (
              <div className="card" style={{ padding: '20px', textAlign: 'center', background: '#ECFDF5', border: '1px solid #10B981' }}>
                <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#10B981' }}>verified_user</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#065F46' }}>Ready for Authorization: Please verify HSN and Items before generating official DC.</span>
              </div>
            ) : (
              <div className="card" style={{
                padding: '16px',
                textAlign: 'center',
                background: details.status === 'delivery_confirmed' ? '#D1FAE5' : '#DBEAFE',
                border: `1px solid ${details.status === 'delivery_confirmed' ? '#10B981' : '#3B82F6'}`
              }}>
                <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '8px', color: details.status === 'delivery_confirmed' ? '#10B981' : '#3B82F6' }}>
                  {details.status === 'delivery_confirmed' ? 'task_alt' : 'local_shipping'}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? '#065F46' : '#1E40AF' }}>
                  {(details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'Shipment Fully Delivered & Confirmed at Project Site.' :
                    (details.status === 'in_transit' || details.status === 'dispatched') ? 'Shipment is currently In Transit to Destination.' : 'DC Authorized & Ready for Dispatch.'}
                </span>
              </div>
            )}

            {/* DISPATCH CONFIGURATION */}
            {details.status === 'dc_requested' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* <div className="card" style={{ padding: '16px', background: 'white', border: '1px solid #E5E7EB' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>Dispatch From (Origin)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input className="input-field" placeholder="Addr Line 1" style={{ gridColumn: 'span 2' }} value={dispatchFrom.line1} onChange={e => setDispatchFrom({ ...dispatchFrom, line1: e.target.value })} />
                    <input className="input-field" placeholder="Addr Line 2" value={dispatchFrom.line2} onChange={e => setDispatchFrom({ ...dispatchFrom, line2: e.target.value })} />
                    <input className="input-field" placeholder="Pincode" value={dispatchFrom.pin} onChange={e => setDispatchFrom({ ...dispatchFrom, pin: e.target.value })} />
                  </div>
                </div> */}
                <div className="card" style={{ padding: '16px', background: 'white', border: '1px solid #E5E7EB' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
                    <input type="checkbox" checked={dispatchTo.enabled} onChange={e => setDispatchTo({ ...dispatchTo, enabled: e.target.checked })} />
                    <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>Manual Site Address</span>
                  </label>
                  {dispatchTo.enabled ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input className="input-field" placeholder="Site Name" style={{ gridColumn: 'span 2' }} value={dispatchTo.name} onChange={e => setDispatchTo({ ...dispatchTo, name: e.target.value })} />
                      <input className="input-field" placeholder="Addr Line 1" value={dispatchTo.line1} onChange={e => setDispatchTo({ ...dispatchTo, line1: e.target.value })} />
                      <input className="input-field" placeholder="Addr Line 2" value={dispatchTo.line2} onChange={e => setDispatchTo({ ...dispatchTo, line2: e.target.value })} />
                      <input className="input-field" placeholder="City" value={dispatchTo.city} onChange={e => setDispatchTo({ ...dispatchTo, city: e.target.value })} />
                      <input className="input-field" placeholder="Pincode" value={dispatchTo.pin} onChange={e => setDispatchTo({ ...dispatchTo, pin: e.target.value })} />
                    </div>
                  ) : (
                    <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B' }}>
                      <div style={{ fontWeight: 700, color: '#475569' }}>Destination Site (from PO):</div>
                      <div>{details.location_name}</div>
                      <div>{details.location_address}, {details.location_city}</div>
                    </div>
                  )}
                </div>
                <div className="card" style={{ padding: '16px', background: 'white', border: '1px solid #E5E7EB' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>
                    Email to Proxy
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                      Select Project Manager / Project SPOC
                    </label>
                    <select
                      className="input-field"
                      value={selectedProjectSpocEmail}
                      onChange={e => setSelectedProjectSpocEmail(e.target.value)}
                      style={{ width: '100%', height: '38px' }}
                    >
                      <option value="">-- Select Project Manager --</option>
                      {projectUsers.map(user => (
                        <option key={user.id} value={user.email}>
                          {user.full_name} ({user.email})
                        </option>
                      ))}
                      {selectedProjectSpocEmail && !projectUsers.some(u => u.email === selectedProjectSpocEmail) && (
                        <option value={selectedProjectSpocEmail}>
                          {details?.project_spoc_name || 'Current Manager'} ({selectedProjectSpocEmail})
                        </option>
                      )}
                    </select>
                    <div style={{ marginTop: '8px', padding: '10px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', fontSize: '11px', color: '#64748B' }}>
                      <div style={{ fontWeight: 700, color: '#475569' }}>Active Proxy Email:</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px' }}>
                        {selectedProjectSpocEmail || 'None selected (No notification will be sent)'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Items Table Card */}
            {(() => {
              const totalQuantity = details.items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
              return (
                <div className="card animate-slide-up" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
                    <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                      Dispatch Item Summary
                    </h3>
                  </div>
                  <div style={{ overflow: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <thead style={{ background: '#3B82F6', color: 'white' }}>
                        <tr>
                          <th style={{ padding: '10px 12px', fontSize: '12px' }}>SL NO</th>
                          <th style={{ padding: '10px 12px', fontSize: '12px' }}>REFERENCE FROM PO</th>
                          <th style={{ padding: '10px 12px', fontSize: '12px' }}>PACKAGE</th>
                          <th style={{ padding: '10px 12px', fontSize: '12px', background: '#b8cbf4ff', color: '#D32F2F' }}>
                            HSN (ENTRY) *
                          </th>
                          <th style={{ padding: '10px 12px', fontSize: '12px' }}>DESCRIPTION <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                          <th style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right' }}>QTY (STORES REQ)</th>
                          <th style={{ padding: '10px 12px', fontSize: '12px' }}>UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.items.map((it, idx) => {
                          const isHsnMandatory = true;
                          const hsnValue = itemHSNs[it.line_item_id] || '';
                          const isMissingHsn = isHsnMandatory && !hsnValue.trim();
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '10px 12px', color: '#9CA3AF', fontSize: '13px' }}>{idx + 1}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: '13px' }}>{it.ref_no || '-'}</td>
                              <td style={{ padding: '10px 12px', fontSize: '13px' }}>{it.package_name || '-'}</td>
                              <td style={{ padding: '6px 12px' }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  maxLength={10}
                                  placeholder="XXXX-XX-XX *"
                                  value={hsnValue}
                                  onChange={e => handleHSNChange(it.line_item_id, e.target.value)}
                                  style={{
                                    height: '26px',
                                    fontSize: '9px',
                                    width: '100px',
                                    border: isMissingHsn ? '1px solid #EF4444' : undefined,
                                    background: isMissingHsn ? '#FEF2F2' : undefined
                                  }}
                                />
                              </td>
                              <td
                                style={{ padding: '10px 12px', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1F2937', cursor: 'pointer', fontSize: '13px' }}
                                onClick={() => Swal.fire({ title: 'Item Description', text: it.description, icon: 'info' })}
                              >
                                {it.description}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#2563EB', fontSize: '13px' }}>{it.qty}</td>
                              <td style={{ padding: '10px 12px', fontSize: '13px' }}>{it.uom}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot style={{ background: '#F8FAFC', borderTop: '2px solid #E5E7EB' }}>
                        <tr>
                          <td colSpan="5" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#4B5563' }}>
                            {details.items.length} ITEMS — TOTAL QUANTITY FOR DISPATCH
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: '#2563EB' }}>{totalQuantity}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div style={{ padding: '8px 20px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="btn btn-ghost" onClick={() => navigate('/raise-dc')} style={{ height: '28px', fontSize: '13px' }} disabled={submitting}>Cancel</button>
                    <button
                      className="btn btn-danger"
                      style={{
                        height: '28px',
                        fontSize: '13px',
                        padding: '0 12px',
                        opacity: details.status === 'dc_requested' ? 1 : 0.5,
                        cursor: details.status === 'dc_requested' ? 'pointer' : 'not-allowed'
                      }}
                      disabled={submitting || details.status !== 'dc_requested'}
                    >
                      Reject Request
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleRaiseDC}
                      disabled={submitting || details.status !== 'dc_requested'}
                      style={{
                        background: details.status === 'dc_requested' ? '#10B981' : '#9CA3AF',
                        height: '28px',
                        fontSize: '13px',
                        padding: '0 20px',
                        fontWeight: 700,
                        cursor: details.status === 'dc_requested' ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {submitting ? 'Raising DC...' : 'Verify & Raise Delivery Challan'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        {showPreview && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              background: 'white',
              width: '95vw',
              height: '95vh',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden'
            }}>
              {/* Toolbar */}
              <div id="pdf-toolbar" style={{ padding: '12px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Authorized DC Summary</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-ghost" onClick={() => setShowPreview(false)} style={{ height: '32px' }}>Back to Edit</button>

                  {/* Download PDF only shown AFTER confirmation (issued) */}
                  {details.dc_number && (
                    <button className="btn btn-ghost" onClick={() => downloadPDF()} style={{ height: '32px', border: '1px solid #10B981', color: '#10B981', fontWeight: 700 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>download</span>
                      Download PDF
                    </button>
                  )}

                  {/* Confirm button only shown BEFORE confirmation (pending) */}
                  {!details.dc_number && (
                    <button className="btn btn-primary" onClick={finalizeRaiseDC} disabled={submitting || !signatureImage} style={{ height: '32px', background: '#10B981', fontWeight: 700 }}>
                      {submitting ? 'Processing...' : 'Confirm & Send to Site'}
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Preview Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '40px', background: '#F1F5F9' }}>
                <div id="dc-preview-container" style={{
                  background: 'white',
                  width: '210mm', // A4 Width
                  minHeight: '297mm',
                  margin: '0 auto',
                  padding: '40px',
                  boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                  position: 'relative',
                  color: '#1E293B',
                  fontFamily: '"Inter", sans-serif'
                }}>
                  {/* Header Block */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                    <div>
                      <img src="/logo.png" alt="Sudha Analyticals" style={{ height: '60px' }} />
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 900, letterSpacing: '2px', color: '#0F172A' }}>DELIVERY CHALLAN</h1>
                      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '5px', fontSize: '14px' }}>
                        <span style={{ fontWeight: 700 }}>Delivery Challan No:</span> <span style={{ fontWeight: 800 }}>{customDCNo || details.requested_dc_number || 'AUTO'}</span>
                        <span style={{ fontWeight: 700 }}>Date:</span> <span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        <span style={{ fontWeight: 700 }}>PO Ref:</span> <span>{details.po_number}</span>
                        <span style={{ fontWeight: 700 }}>Sales Order Date:</span> <span>{details.po_date ? new Date(details.po_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2x2 Grid for Addresses */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid #000', marginBottom: '30px' }}>
                    <div style={{ padding: '15px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Billing By</h4>
                      <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                        <div style={{ fontWeight: 800 }}>Sudha Analyticals</div>
                        <div>Plot 18A, Sy No 118</div>
                        <div>IDA Balanagar, Hyderabad 500037</div>
                        <div>GSTIN: 36AGTPG0351P1ZY</div>
                      </div>
                    </div>
                    <div style={{ padding: '15px', borderBottom: '1px solid #000' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Despatch From</h4>
                      <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                        {dispatchFrom?.line1 || details.dispatch_from_address1 ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{dispatchFrom?.line1 || details.dispatch_from_address1}</div>
                            <div>{dispatchFrom?.line2 || details.dispatch_from_address2}</div>
                            <div>Pincode: {dispatchFrom?.pin || details.dispatch_from_pincode}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 700 }}>Sudha Analyticals</div>
                            <div>Plot No. 44, Shed No. 3, Phase-I</div>
                            <div>IDA Balanagar, Hyderabad - 500037</div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '15px', borderRight: '1px solid #000' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Billing To</h4>
                      <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                        <div style={{ fontWeight: 800 }}>{details.customer_name}</div>
                        <div>{details.customer_addr1}</div>
                        <div>{details.customer_addr2} | {details.customer_city}</div>
                        <div>GSTIN: {details.customer_gstin}</div>
                      </div>
                    </div>
                    <div style={{ padding: '15px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Despatch To</h4>
                      <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                        {dispatchTo.enabled ? (
                          <>
                            <div style={{ fontWeight: 800 }}>{dispatchTo.name}</div>
                            <div>{dispatchTo.line1}</div>
                            <div>{dispatchTo.line2}</div>
                            <div>{dispatchTo.city} - {dispatchTo.pin}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 800 }}>{details.location_name}</div>
                            <div>{details.location_address}</div>
                            <div>{details.location_address2}</div>
                            <div>{details.location_city}, {details.location_state} - {details.location_pincode}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', border: '1px solid #000' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #000' }}>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left', borderRight: '1px solid #000' }}>SI no</th>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left', borderRight: '1px solid #000' }}>Reference from PO</th>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left', borderRight: '1px solid #000' }}>Package</th>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left', borderRight: '1px solid #000' }}>HSN</th>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left', borderRight: '1px solid #000' }}>Item Name</th>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'right', borderRight: '1px solid #000' }}>Qty</th>
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left' }}>UoM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.items.map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #000' }}>
                          <td style={{ padding: '8px', fontSize: '13px', borderRight: '1px solid #000' }}>{idx + 1}</td>
                          <td style={{ padding: '8px', fontSize: '13px', borderRight: '1px solid #000' }}>{it.ref_no}</td>
                          <td style={{ padding: '8px', fontSize: '13px', borderRight: '1px solid #000' }}>{it.package_name}</td>
                          <td style={{ padding: '8px', fontSize: '13px', borderRight: '1px solid #000' }}>{itemHSNs[it.line_item_id] || '-'}</td>
                          <td style={{ padding: '8px', fontSize: '12px', borderRight: '1px solid #000', maxWidth: '300px', fontWeight: 600 }}>{it.item_name}</td>
                          <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', borderRight: '1px solid #000', fontWeight: 700 }}>{it.qty}</td>
                          <td style={{ padding: '8px', fontSize: '13px' }}>{it.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Signature Section */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '60px', paddingRight: '0px' }}>
                    <div style={{ textAlign: 'center', width: '240px', marginRight: '10px' }}>
                      {!signatureImage ? (
                        <div id="pdf-signature-box" style={{ border: '2px dashed #EF4444', borderRadius: '8px', padding: '12px', background: '#FEF2F2', marginBottom: '10px' }}>
                          <span className="material-symbols-outlined" style={{ color: '#EF4444', fontSize: '24px', marginBottom: '4px' }}>warning</span>
                          <div style={{ fontSize: '11px', color: '#991B1B', fontWeight: 600 }}>Signature not found in Master Address Admin settings. Please configure it to raise DC.</div>
                        </div>
                      ) : (
                        <div style={{ marginBottom: '2px', position: 'relative', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '2px solid #0F172A' }}>
                          <img src={signatureImage} alt="Authorized Signature" style={{ width: '180px', height: '75px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                        </div>
                      )}
                      <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', color: '#0F172A', textAlign: 'center' }}>Authorised Signature</div>
                    </div>
                  </div>

                  {/* Footer Terms */}

                </div>
              </div>
            </div>
          </div>
        )}

        {/* PREVIEW IMAGE OVERLAY MODAL */}
        {previewImage && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px'
          }} onClick={() => setPreviewImage(null)}>
            <div style={{
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }} onClick={e => e.stopPropagation()}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC'
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{previewImage.name}</span>
                <button
                  onClick={() => setPreviewImage(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    borderRadius: '4px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>
              <div style={{ padding: '12px', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img
                  src={previewImage.url}
                  alt={previewImage.name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '4px' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <h1 className="text-h1 page-header__title" style={{ fontSize: '24px', margin: 0 }}>Raise Delivery Challan</h1>
            <p className="page-header__subtitle" style={{ fontSize: '12px', margin: 0 }}>Review and formally issue Delivery Challans for pending store requests.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type="text"
              placeholder="Search by PO, Customer or DC Reg..."
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

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: 'none',
            background: activeTab === 'pending' ? '#111827' : 'white',
            color: activeTab === 'pending' ? 'white' : '#64748B',
            boxShadow: activeTab === 'pending' ? '0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none'
          }}
        >
          Pending Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('tracking')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: 'none',
            background: activeTab === 'tracking' ? '#111827' : 'white',
            color: activeTab === 'tracking' ? 'white' : '#64748B',
            boxShadow: activeTab === 'tracking' ? '0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none'
          }}
        >
          DC Tracking ({trackingDCs.length})
        </button>
      </div>

      <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '13px' }}>
          <thead style={{ background: '#F9FAFB' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em', borderBottom: '1px solid #E5E7EB' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF', fontSize: '13px' }}>Loading data...</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px', color: '#9CA3AF', fontSize: '13px' }}>
                  {activeTab === 'pending' ? 'No pending DC requests found.' : 'No generated Delivery Challans found.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => handleView(row.original)}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '10px 14px', fontSize: '13px', color: '#374151' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Hidden containers for silent PDF generation */}
      {hiddenData && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '210mm', zIndex: -100 }}>
          {hiddenData.type === 'invoice' ? (
            <div id="silent-invoice-capture" style={{ padding: '48px', background: 'white', color: '#1E293B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'inline-block', padding: '6px 12px', background: '#F1F5F9', borderRadius: '4px', fontSize: '10px', fontWeight: 900, color: '#475569', letterSpacing: '0.1em', marginBottom: '16px' }}>TAX INVOICE</div>
                  <h2 style={{ fontSize: '42px', fontWeight: 900, margin: 0, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{hiddenData.data.invoice_number}</h2>
                  <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Date of Issue</div>
                      <div style={{ fontSize: '15px', fontWeight: 700 }}>{new Date(hiddenData.data.invoice_date).toLocaleDateString('en-IN')}</div>
                    </div>
                    <div style={{ width: '1px', background: '#E2E8F0' }}></div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Payment Due</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#DC2626' }}>{hiddenData.data.due_date ? new Date(hiddenData.data.due_date).toLocaleDateString('en-IN') : '-'}</div>
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
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>{hiddenData.data.po_no}</div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(hiddenData.data.po_date).toLocaleDateString('en-IN')}</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '16px' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Delivery Challan</div>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>{hiddenData.data.dc_no}</div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>{new Date(hiddenData.data.dispatch_date).toLocaleDateString('en-IN')}</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '16px' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Place of Supply</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{hiddenData.data.place_of_supply || 'Telangana'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', marginBottom: '48px' }}>
                <div>
                  <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '6px' }}>Billed To</h4>
                  <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155', whiteSpace: 'pre-wrap' }}>{hiddenData.data.billing_address}</div>
                </div>
                <div>
                  <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '2px solid #F1F5F9', paddingBottom: '6px' }}>Shipped To</h4>
                  <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155', whiteSpace: 'pre-wrap' }}>{hiddenData.data.shipping_address}</div>
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
                    {(hiddenData.data.items || []).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px', fontSize: '14px', fontWeight: 700 }}>{it.item_name}</td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>{it.quantity}</td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>₹{it.rate?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800 }}>₹{it.total_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '64px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>{hiddenData.data.notes}</div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><span>Subtotal</span><span>₹{hiddenData.data.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderTop: '2px dashed #E2E8F0', marginTop: '12px' }}>
                    <span style={{ fontWeight: 900 }}>Grand Total</span>
                    <span style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '20px' }}>₹{hiddenData.data.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '80px', textAlign: 'right' }}>
                <div style={{ height: '60px', width: '200px', borderBottom: '2px solid #0F172A', marginLeft: 'auto', marginBottom: '8px' }}>
                  {hiddenData.data.signature_data && <img src={hiddenData.data.signature_data} style={{ width: '150px' }} />}
                </div>
                <div style={{ fontWeight: 900 }}>Authorised Signature</div>
              </div>
            </div>
          ) : (
            <div id="silent-dc-capture" style={{
              background: 'white',
              width: '210mm',
              minHeight: '297mm',
              padding: '40px',
              position: 'relative',
              color: '#1E293B',
              fontFamily: '"Inter", sans-serif'
            }}>
              {/* Header Block */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <div>
                  <img src="/logo.png" alt="Sudha Analyticals" style={{ height: '60px' }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 900, letterSpacing: '2px', color: '#0F172A' }}>DELIVERY CHALLAN</h1>
                  <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '5px', fontSize: '14px' }}>
                    <span style={{ fontWeight: 700 }}>Delivery Challan No:</span> <span style={{ fontWeight: 800 }}>{hiddenData.data.dc_number || 'AUTO'}</span>
                    <span style={{ fontWeight: 700 }}>Date:</span> <span>{new Date(hiddenData.data.issued_at || Date.now()).toLocaleDateString('en-GB')}</span>
                    <span style={{ fontWeight: 700 }}>PO Ref:</span> <span>{hiddenData.data.po_no || hiddenData.data.po_number}</span>
                    <span style={{ fontWeight: 700 }}>Sales Order Date:</span> <span>{hiddenData.data.po_date ? new Date(hiddenData.data.po_date).toLocaleDateString('en-GB') : '-'}</span>
                  </div>
                </div>
              </div>

              {/* 2x2 Grid for Addresses */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid #000', marginBottom: '30px' }}>
                <div style={{ padding: '15px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Billing By</h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 800 }}>Sudha Analyticals</div>
                    <div>Plot 18A, Sy No 118</div>
                    <div>IDA Balanagar, Hyderabad 500037</div>
                    <div>GSTIN: 36AGTPG0351P1ZY</div>
                  </div>
                </div>
                <div style={{ padding: '15px', borderBottom: '1px solid #000' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Despatch From</h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 700 }}>{hiddenData.data.dispatch_from_address1 || 'Sudha Analyticals'}</div>
                    <div>{hiddenData.data.dispatch_from_address2 || 'IDA Balanagar, Hyderabad'}</div>
                    {hiddenData.data.dispatch_from_pincode && <div>Pincode: {hiddenData.data.dispatch_from_pincode}</div>}
                  </div>
                </div>
                <div style={{ padding: '15px', borderRight: '1px solid #000' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Billing To</h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 800 }}>{hiddenData.data.customer_name}</div>
                    <div>{hiddenData.data.customer_addr1}</div>
                    <div>{hiddenData.data.customer_addr2} | {hiddenData.data.customer_city}</div>
                    <div>GSTIN: {hiddenData.data.customer_gstin}</div>
                  </div>
                </div>
                <div style={{ padding: '15px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#475569' }}>Despatch To</h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 800 }}>{hiddenData.data.location_name}</div>
                    <div>{hiddenData.data.location_address}</div>
                    <div>{hiddenData.data.location_city}, {hiddenData.data.location_state} - {hiddenData.data.location_pincode}</div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', border: '1px solid #000' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #000' }}>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left', borderRight: '1px solid #000' }}>SI no</th>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left', borderRight: '1px solid #000' }}>Reference from PO</th>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left', borderRight: '1px solid #000' }}>Package</th>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left', borderRight: '1px solid #000' }}>HSN</th>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left', borderRight: '1px solid #000' }}>Item Name</th>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'right', borderRight: '1px solid #000' }}>Qty</th>
                    <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left' }}>UoM</th>
                  </tr>
                </thead>
                <tbody>
                  {(hiddenData.data.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #000' }}>
                      <td style={{ padding: '8px', fontSize: '11px', borderRight: '1px solid #000' }}>{idx + 1}</td>
                      <td style={{ padding: '8px', fontSize: '11px', borderRight: '1px solid #000' }}>{it.ref_no || it.po_ref}</td>
                      <td style={{ padding: '8px', fontSize: '11px', borderRight: '1px solid #000' }}>{it.package_name}</td>
                      <td style={{ padding: '8px', fontSize: '11px', borderRight: '1px solid #000' }}>{it.hsn || '-'}</td>
                      <td style={{ padding: '8px', fontSize: '10px', borderRight: '1px solid #000', maxWidth: '300px', fontWeight: 600 }}>{it.item_name}</td>
                      <td style={{ padding: '8px', fontSize: '11px', textAlign: 'right', borderRight: '1px solid #000', fontWeight: 700 }}>{it.qty}</td>
                      <td style={{ padding: '8px', fontSize: '11px' }}>{it.uom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Signature Section */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '60px' }}>
                <div style={{ textAlign: 'center', width: '200px' }}>
                  <div style={{ height: '60px', borderBottom: '1px solid #000', marginBottom: '8px' }}>
                    {(hiddenData.data.signature_data || hiddenData.data.signature) && (
                      <img src={hiddenData.data.signature_data || hiddenData.data.signature} style={{ height: '50px' }} />
                    )}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 900 }}>Authorised Signature</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PREVIEW IMAGE OVERLAY MODAL */}
      {previewImage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }} onClick={() => setPreviewImage(null)}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxWidth: '90vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid #E2E8F0',
              background: '#F8FAFC'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{previewImage.name}</span>
              <button
                onClick={() => setPreviewImage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            </div>
            <div style={{ padding: '12px', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img
                src={previewImage.url}
                alt={previewImage.name}
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

