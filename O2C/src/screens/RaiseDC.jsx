import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
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
  const sigCanvas = useRef(null);

  useEffect(() => {
    if (view === 'detail' && showPreview && sigCanvas.current) {
      const canvas = sigCanvas.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
    }
  }, [view, showPreview]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (id) {
      loadDetails(id);
    } else {
      setView('list');
      setDetails(null);
    }
  }, [id, trackingDCs]);

  const fetchDetailDirectly = async (targetId) => {
    setLoadingDetails(true);
    setView('detail');
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Try fetching as a DC request first
      try {
        const res = await axios.get(`http://localhost:3000/api/dc-requests/${targetId}`, { headers });
        if (res.data) {
          setDetails(res.data);
          return;
        }
      } catch (e) { }

      // Then try as a DC
      const resDc = await axios.get(`http://localhost:3000/api/dc/${targetId}`, { headers });
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
      const reqRes = await axios.get('http://localhost:3000/api/dc-requests', { headers });
      const filtered = reqRes.data.filter(r => r.status === 'dc_requested');
      setRequests(filtered);

      // 2. Load Generated DCs for Tracking
      const dcRes = await axios.get('http://localhost:3000/api/dc', { headers });
      setTrackingDCs(dcRes.data);
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

      // Try DC Request endpoint first since we are in the "Raise" screen
      let res;
      try {
        res = await axios.get(`http://localhost:3000/api/dc-requests/${targetId}`, { headers });
      } catch (e) {
        // Fallback to DC endpoint if not found in requests
        res = await axios.get(`http://localhost:3000/api/dc/${targetId}`, { headers });
      }

      if (!res || !res.data) throw new Error('Data not found');
      setDetails(res.data);

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

    } catch (err) {
      console.error(err);
      setView('list');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleInsertSignature = () => {
    const canvas = sigCanvas.current;
    if (!canvas) return;

    // Check if canvas is empty
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const isCanvasEmpty = !pixelData.some(p => p !== 0);

    if (isCanvasEmpty) {
      Swal.fire({
        icon: 'warning',
        title: 'Signature Required',
        text: 'Please provide a signature first.'
      });
      return;
    }

    const data = canvas.toDataURL('image/png');
    setSignatureImage(data);
  };

  const [isDrawing, setIsDrawing] = useState(false);
  const startDrawing = (e) => {
    const canvas = sigCanvas.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };
  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = sigCanvas.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = sigCanvas.current.getContext('2d');
    ctx.closePath();
    setIsDrawing(false);
  };

  const handleClearSignature = () => {
    setSignatureImage(null);
    setTimeout(() => {
      if (sigCanvas.current) {
        const canvas = sigCanvas.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#0F172A'; // Match enterprise theme
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
      }
    }, 0);
  };

  const handleRaiseDC = () => {
    if (!details) return;
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

    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Multi-page or long-page support
    if (pdfHeight > 297) {
      // If it's very long, create a custom sized PDF to keep it in one piece
      const longPdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      longPdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      longPdf.save(`DC_${details.dc_number || details.requested_dc_number}.pdf`);
    } else {
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
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
        signature: signatureData
      };

      const res = await axios.post(`http://localhost:3000/api/dc-requests/${details.id}/raise`, payload, { headers });

      Swal.fire({ icon: 'success', title: 'DC Raised', text: `Delivery Challan ${res.data.dc_number} raised successfully!`, timer: 2000, showConfirmButton: false });
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
      header: 'PO NO',
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
      header: 'DC NO',
      accessorKey: 'dc_number',
      cell: info => <span style={{ fontWeight: 700, color: '#111827', fontSize: '13px' }}>{info.getValue()}</span>,
    },
    {
      header: 'PO NO',
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
        <button className="btn-ghost" onClick={() => navigate(`/raise-dc/${info.row.original.id}`)} style={{ padding: '2px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#6366F1' }}>visibility</span>
        </button>
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
    setItemHSNs(prev => ({ ...prev, [id]: val }));
  };

  if (view === 'detail') {
    return (
      <div className="page-container screen-enter">
        <div className="page-header" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/raise-dc')} className="btn-ghost btn-back" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
            </button>
            <h1 className="text-h2" style={{ fontSize: '17px' }}>Raise Delivery Challan</h1>
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
            <div className="card animate-slide-up" style={{ padding: '24px 40px', border: '1px solid #E5E7EB', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Connector Lines */}
                <div style={{ position: 'absolute', top: '15px', left: '40px', right: '40px', height: '2px', background: '#E5E7EB', zIndex: 0 }}></div>
                <div style={{
                  position: 'absolute',
                  top: '15px',
                  left: '40px',
                  width: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'calc(100% - 80px)' :
                    details.status === 'in_transit' ? 'calc(66.6% - 40px)' :
                      (details.status === 'ready_for_dispatch' || details.status === 'dc_approved') ? 'calc(33.3% - 40px)' : '0%',
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
                    id: 'approved', label: 'DC Approved', icon: (details.status === 'ready_for_dispatch' || details.status === 'in_transit' || details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'check_circle' : 'pending_actions', sub: 'Accounts Verified',
                    active: (details.status === 'ready_for_dispatch' || details.status === 'in_transit' || details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed')
                  },
                  {
                    id: 'transit', label: 'In Transit', icon: 'local_shipping', sub: 'Shipment Dispatched',
                    active: (details.status === 'in_transit' || details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed')
                  },
                  {
                    id: 'confirmed', label: 'Confirmed', icon: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed') ? 'task_alt' : 'verified_user', sub: 'Site Receipt Verified',
                    active: (details.status === 'delivery_confirmed' || details.delivery_status === 'delivery_confirmed')
                  }
                ].map((step, idx) => (
                  <div key={idx} style={{ zIndex: 1, textAlign: 'center', background: 'white', padding: '0 10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
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
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{step.active ? 'check' : step.icon}</span>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: step.active ? '#111827' : '#9CA3AF' }}>{step.label}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Logistics & Dispatch Settings (Provided by Stores) */}
            <div className="card animate-slide-up" style={{ padding: '16px 20px', border: '1px solid #E5E7EB', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Logistics & Dispatch Information</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Requested DC No:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF' }}>{details.requested_dc_number || 'Auto-Generate'}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: '20px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Vehicle No</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.vehicle_no || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Driver Name</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.driver_name || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Driver Phone</label>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{details.driver_phone || <span style={{ color: '#9CA3AF' }}>Not Provided</span>}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Delivery Location Address</label>
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
                    <a href={`http://localhost:3000${details.proof_path}`} target="_blank" rel="noreferrer" style={{ display: 'block', border: '1px solid #E2E8F0', borderRadius: '4px', overflow: 'hidden', background: 'white' }}>
                      <img src={`http://localhost:3000${details.proof_path}`} alt="Proof" style={{ width: '100%', height: '60px', objectFit: 'cover' }} />
                      <div style={{ fontSize: '10px', textAlign: 'center', padding: '2px', background: '#F1F5F9', color: '#2563EB', fontWeight: 700 }}>VIEW FULL PHOTO</div>
                    </a>
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
                <span style={{ fontSize: '14px', fontWeight: 700, color: details.status === 'delivery_confirmed' ? '#065F46' : '#1E40AF' }}>
                  {details.status === 'delivery_confirmed' ? 'Shipment Fully Delivered & Confirmed at Project Site.' :
                    details.status === 'in_transit' ? 'Shipment is currently In Transit to Destination.' : 'DC Authorized & Ready for Dispatch.'}
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
              </div>
            )}

            {/* Items Table Card */}
            <div className="card animate-slide-up" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              <div style={{ overflow: 'auto' }}>
                <table className="data-table" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#3B82F6', color: 'white' }}>
                    <tr>
                      <th style={{ padding: '6px 12px' }}>SL NO</th>
                      <th style={{ padding: '6px 12px' }}>REFERENCE FROM PO</th>
                      <th style={{ padding: '6px 12px' }}>PACKAGE</th>
                      <th style={{ padding: '6px 12px', background: '#2563EB' }}>HSN (ENTRY)</th>
                      <th style={{ padding: '6px 12px' }}>DESCRIPTION</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right' }}>QTY (STORES REQ)</th>
                      <th style={{ padding: '6px 12px' }}>UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '6px 12px', color: '#9CA3AF' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{it.ref_no || '-'}</td>
                        <td style={{ padding: '6px 12px' }}>{it.package_name || '-'}</td>
                        <td style={{ padding: '2px 12px' }}>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Optional HSN"
                            value={itemHSNs[it.line_item_id] || ''}
                            onChange={e => handleHSNChange(it.line_item_id, e.target.value)}
                            style={{ height: '22px', fontSize: '11px', width: '90px' }}
                          />
                        </td>
                        <td
                          style={{ padding: '6px 12px', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1F2937', cursor: 'pointer' }}
                          onClick={() => Swal.fire({ title: 'Item Description', text: it.description, icon: 'info' })}
                        >
                          {it.description}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 800, color: '#2563EB', fontSize: '13px' }}>{it.qty}</td>
                        <td style={{ padding: '6px 12px' }}>{it.uom}</td>
                      </tr>
                    ))}
                  </tbody>
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
                  {submitting ? 'Raising DC...' : 'Verify & Raise DC'}
                </button>
              </div>
            </div>
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
                  <button className="btn btn-ghost" onClick={downloadPDF} style={{ height: '32px', border: '1px solid #CBD5E1', opacity: signatureImage ? 1 : 0.5 }} disabled={!signatureImage}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>download</span>
                    Download PDF
                  </button>
                  <button className="btn btn-primary" onClick={finalizeRaiseDC} disabled={submitting || !signatureImage} style={{ height: '32px', background: '#10B981', fontWeight: 700 }}>
                    {submitting ? 'Processing...' : 'Confirm & Send to Site'}
                  </button>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '5px', fontSize: '14px' }}>
                        <span style={{ fontWeight: 700 }}>DC NO :</span> <span style={{ fontWeight: 800 }}>{customDCNo || details.requested_dc_number || 'AUTO'}</span>
                        <span style={{ fontWeight: 700 }}>Date :</span> <span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        <span style={{ fontWeight: 700 }}>PO Ref :</span> <span>{details.po_number}</span>
                        <span style={{ fontWeight: 700 }}>PO Date :</span> <span>{details.po_date ? new Date(details.po_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</span>
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
                        <th style={{ padding: '8px', fontSize: '13px', textAlign: 'left', borderRight: '1px solid #000' }}>Description</th>
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
                          <td style={{ padding: '8px', fontSize: '12px', borderRight: '1px solid #000', maxWidth: '300px' }}>{it.description}</td>
                          <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', borderRight: '1px solid #000', fontWeight: 700 }}>{it.qty}</td>
                          <td style={{ padding: '8px', fontSize: '13px' }}>{it.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Signature Section */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '60px' }}>
                    <div style={{ textAlign: 'center', width: '250px' }}>
                      {!signatureImage ? (
                        <div id="pdf-signature-box" style={{ border: '2px dashed #CBD5E1', borderRadius: '8px', padding: '5px', background: '#F8FAFC', marginBottom: '10px' }}>
                          <canvas
                            ref={sigCanvas}
                            width={240}
                            height={100}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseOut={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            style={{ background: 'white', cursor: 'crosshair', display: 'block', margin: '0 auto', border: '1px solid #E2E8F0' }}
                          />
                          <div id="pdf-signature-hint" style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px', marginBottom: '5px' }}>Sign above for authorization</div>
                          <button
                            className="btn btn-primary"
                            onClick={handleInsertSignature}
                            style={{ width: '100%', height: '24px', fontSize: '12px', background: '#2563EB' }}
                          >
                            Insert Signature
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginBottom: '10px', position: 'relative' }}>
                          <img src={signatureImage} alt="Authorized Signature" style={{ height: '80px', display: 'block', margin: '0 auto' }} />
                          <button
                            onClick={handleClearSignature}
                            style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '14px' }}
                            id="pdf-signature-clear"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', color: '#0F172A' }}>Authorised Signatory</div>
                    </div>
                  </div>

                  {/* Footer Terms */}

                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-container screen-enter">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="text-h2" style={{ fontSize: '18px' }}>Raise Delivery Challan</h1>
          <p className="text-p" style={{ fontSize: '14px' }}>Review and formally issue Delivery Challans for pending store requests.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="search-bar" style={{ width: '280px', background: 'white', height: '36px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder="Search by PO, Customer or DC Reg..."
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              style={{ fontSize: '14px' }}
            />
          </div>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ height: '36px', fontSize: '14px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>dashboard</span>
            Dashboard
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: 'none',
            background: activeTab === 'pending' ? '#111827' : 'white',
            color: activeTab === 'pending' ? 'white' : '#64748B',
            boxShadow: activeTab === 'pending' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
          }}
        >
          Pending Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('tracking')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: 'none',
            background: activeTab === 'tracking' ? '#111827' : 'white',
            color: activeTab === 'tracking' ? 'white' : '#64748B',
            boxShadow: activeTab === 'tracking' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
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
                  <th key={header.id} style={{ padding: '10px 16px', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em', borderBottom: '1px solid #E5E7EB' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>Loading requests...</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No pending DC requests found.</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => handleView(row.original)}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '8px 16px', color: '#374151' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

