import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function EditPO() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // STATE
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Selection State
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [allPOs, setAllPOs] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);

  // Sales Order Details
  const [poDetails, setPODetails] = useState(null);
  const [items, setItems] = useState([]);
  const [newVersionLabel, setNewVersionLabel] = useState('');

  // Project SPOC details state
  const [projectSpocName, setProjectSpocName] = useState('');
  const [projectSpocEmail, setProjectSpocEmail] = useState('');
  const [projectSpocPhone, setProjectSpocPhone] = useState('');
  const [needSalesInvoiceApproval, setNeedSalesInvoiceApproval] = useState('yes');
  const [projectUsers, setProjectUsers] = useState([]);

  const isProjectPhoneInvalid = projectSpocName ? (!projectSpocPhone || !/^[0-9]{10}$/.test(projectSpocPhone.trim())) : false;

  const filteredProjectUsers = projectUsers.filter(
    user => user.assigned_role === "Projects" || 
            user.role === "Projects" || 
            user.role?.toLowerCase() === "projects" || 
            user.assigned_role?.toLowerCase() === "projects"
  );

  // Preview State
  const [previewPath, setPreviewPath] = useState(null);
  const [previewExcelData, setPreviewExcelData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // --- Helper Functions ---

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    if (dateStr instanceof Date) {
      const dd = String(dateStr.getDate()).padStart(2, '0');
      const mm = String(dateStr.getMonth() + 1).padStart(2, '0');
      const yyyy = dateStr.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
    const cleanStr = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : String(dateStr);

    if (cleanStr.includes('-')) {
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const dd = parts[2].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[0];
          return `${dd}-${mm}-${yyyy}`;
        }
        if (parts[2].length === 4) {
          const dd = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[2];
          return `${dd}-${mm}-${yyyy}`;
        }
      }
    }

    if (cleanStr.includes('/')) {
      const parts = cleanStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          const dd = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[2];
          return `${dd}-${mm}-${yyyy}`;
        }
        if (parts[0].length === 4) {
          const dd = parts[2].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[0];
          return `${dd}-${mm}-${yyyy}`;
        }
      }
    }

    try {
      const d = new Date(cleanStr);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      }
    } catch (e) { }

    return cleanStr;
  };

  const cleanParse = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    // Remove currency symbols, commas, and other non-numeric chars except decimal point
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const calculateRow = (row) => {
    // REVISED values: Use the EDIT values if provided (not null/empty), otherwise fallback to the ORIGINAL values
    // REVISED values: Use the EDIT values if provided (not null/empty), otherwise fallback to the ORIGINAL values
    const rev_s_qty = (row.edit_supply_qty !== null && row.edit_supply_qty !== '') ? cleanParse(row.edit_supply_qty) : cleanParse(row.supply_qty);
    const rev_s_rate = (row.edit_supply_rate !== null && row.edit_supply_rate !== '') ? cleanParse(row.edit_supply_rate) : cleanParse(row.supply_rate);
    const rev_s_gst_pct = (row.edit_supply_gst_rate !== null && row.edit_supply_gst_rate !== '') ? cleanParse(row.edit_supply_gst_rate) : cleanParse(row.supply_gst_rate);

    const rev_sv_qty = (row.edit_service_qty !== null && row.edit_service_qty !== '') ? cleanParse(row.edit_service_qty) : cleanParse(row.service_qty);
    const rev_sv_rate = (row.edit_service_rate !== null && row.edit_service_rate !== '') ? cleanParse(row.edit_service_rate) : cleanParse(row.service_rate);
    const rev_sv_gst_pct = (row.edit_service_gst_rate !== null && row.edit_service_gst_rate !== '') ? cleanParse(row.edit_service_gst_rate) : cleanParse(row.service_gst_rate);

    // Intermediate Calculations
    const taxable_s = rev_s_qty * rev_s_rate;
    const gst_s = taxable_s * (rev_s_gst_pct / 100);
    const total_s = taxable_s + gst_s;

    const taxable_sv = rev_sv_qty * rev_sv_rate;
    const gst_sv = taxable_sv * (rev_sv_gst_pct / 100);
    const total_sv = taxable_sv + gst_sv;

    const total_taxable = taxable_s + taxable_sv;
    const total_gst = gst_s + gst_sv;
    const total_invoice = total_s + total_sv;

    return {
      ...row,
      // Values for display in AUTO CAL section
      rev_supply_qty: rev_s_qty,
      rev_supply_rate: rev_s_rate,
      rev_supply_gst_rate: rev_s_gst_pct,
      rev_service_qty: rev_sv_qty,
      rev_service_rate: rev_sv_rate,
      rev_service_gst_rate: rev_sv_gst_pct,

      rev_taxable_supply: taxable_s,
      rev_gst_supply: gst_s,
      rev_total_supply: total_s,

      rev_taxable_service: taxable_sv,
      rev_gst_service: gst_sv,
      rev_total_service: total_sv,

      rev_total_taxable: total_taxable,
      rev_total_gst: total_gst,
      rev_total_invoice: total_invoice
    };
  };

  // --- API Calls ---

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [cRes, pRes, uRes] = await Promise.all([
          axios.get('/api/customers', { headers }),
          axios.get('/api/pos', { headers }),
          axios.get('/api/project-users', { headers })
        ]);
        setCustomers(Array.isArray(cRes.data) ? cRes.data : []);
        setAllPOs(Array.isArray(pRes.data) ? pRes.data : []);
        setProjectUsers(Array.isArray(uRes.data) ? uRes.data : []);
      } catch (err) {
        /* console.error(err); */
      }
    };
    fetchInitial();
  }, []);

  const handleCustomerChange = async (e) => {
    const val = e.target.value;
    setSelectedCustomer(val);
    setSelectedLocation('');
    setSelectedPO(null);
    setPODetails(null);
    setProjectSpocName('');
    setProjectSpocEmail('');
    setProjectSpocPhone('');
    setLocations([]);
    if (val) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`/api/locations?customer_id=${val}`, { headers });
        setLocations(Array.isArray(res.data) ? res.data : []);
      } catch (err) { /* console.error(err); */ }
    }
  };

  const handlePOSelect = async (e) => {
    const poId = e.target.value;
    if (!poId) {
      setSelectedPO(null);
      setPODetails(null);
      setProjectSpocName('');
      setProjectSpocEmail('');
      setProjectSpocPhone('');
      return;
    }

    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/pos/${poId}`, { headers });
      const data = res.data;

      setPODetails(data);
      setProjectSpocName(data.project_spoc_name || '');
      setProjectSpocEmail(data.project_spoc_email || '');
      setProjectSpocPhone(data.project_spoc_phone || '');
      setNeedSalesInvoiceApproval(data.need_sales_invoice_approval || 'yes');
      setItems(data.items.map(it => calculateRow({
        ...it,
        edit_supply_qty: it.edit_supply_qty,
        edit_supply_rate: it.edit_supply_rate,
        edit_supply_gst_rate: it.edit_supply_gst_rate,
        edit_service_qty: it.edit_service_qty,
        edit_service_rate: it.edit_service_rate,
        edit_service_gst_rate: it.edit_service_gst_rate
      })));

      // Use original PO number for overriding
      setNewVersionLabel(data.po_number || data.order_id);

      setSelectedPO(poId);

      // Restore from local storage if exists
      const savedDraft = sessionStorage.getItem(`edit_po_draft_${poId}`);
      if (savedDraft) {
        setItems(JSON.parse(savedDraft));
      }
    } catch (err) {
      /* console.error(err); */
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load PO details' });
    } finally {
      setLoading(false);
    }
  };

  // Save draft to local storage on change
  useEffect(() => {
    if (selectedPO && items.length > 0) {
      sessionStorage.setItem(`edit_po_draft_${selectedPO}`, JSON.stringify(items));
    }
  }, [items, selectedPO]);

  const updateItem = (idx, field, val) => {
    // If it's a numeric edit field, restrict to numbers, decimals, and minus signs
    if (['edit_supply_qty', 'edit_supply_rate', 'edit_service_qty', 'edit_service_rate'].includes(field)) {
      // Allow only digits, one dot, and one minus sign at the start
      val = val.replace(/[^0-9.-]/g, '');
      // Ensure only one decimal point
      const parts = val.split('.');
      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
      // Ensure minus sign only at the start
      if (val.lastIndexOf('-') > 0) val = val.replace(/(?!^)-/g, '');
    }

    setItems(prev => {
      const updated = [...prev];
      updated[idx] = calculateRow({ ...updated[idx], [field]: val === '' ? null : val });
      return updated;
    });
  };

  const deleteRow = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const nextStep = () => {
    if (step === 1) {
      if (!selectedPO) return;
      if (!projectSpocName.trim() || !projectSpocEmail.trim() || !projectSpocPhone.trim()) {
        return Swal.fire({ icon: 'warning', title: 'Incomplete Details', text: 'Please fill all Project SPOC details.' });
      }

      if (!needSalesInvoiceApproval) {
        return Swal.fire({ icon: 'warning', title: 'Incomplete Details', text: 'Please select whether Sales approval is needed for the invoice.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(projectSpocEmail.trim())) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Email', text: 'Please enter a valid Project SPOC email address.' });
      }

      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(projectSpocPhone.trim())) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Project SPOC Phone', text: 'Project SPOC Contact Number must be exactly 10 digits. Please update it in Project User Master.' });
      }
    }
    setStep(s => s + 1);
  };
  const prevStep = () => {
    if (step === 1) navigate('/dashboard');
    else setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    if (isProjectPhoneInvalid) {
      return Swal.fire({ icon: 'warning', title: 'Invalid Project SPOC Phone', text: 'Project SPOC Contact Number must be exactly 10 digits.' });
    }
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const subtotal = items.reduce((acc, it) => acc + (it.rev_total_taxable || 0), 0);
      const gst_total = items.reduce((acc, it) => acc + (it.rev_total_gst || 0), 0);
      const grand_total = items.reduce((acc, it) => acc + (it.rev_total_invoice || 0), 0);

      const newStatus = poDetails.is_nt_po ? 'nt_created' : 'pending';

      const payload = {
        status: newStatus,
        project_spoc_name: projectSpocName.trim(),
        project_spoc_email: projectSpocEmail.trim(),
        project_spoc_phone: projectSpocPhone.trim(),
        need_sales_invoice_approval: needSalesInvoiceApproval,
        items: items.map(it => ({
          id: it.id,
          ref_no: it.ref_no,
          package_name: it.package_name,
          heading: it.heading,
          sub_heading: it.sub_heading,
          item_name: it.item_name,
          description: it.description,
          uom: it.uom,
          supply_qty: it.rev_supply_qty,
          supply_rate: it.rev_supply_rate,
          supply_gst_rate: it.rev_supply_gst_rate,
          service_qty: it.rev_service_qty,
          service_rate: it.rev_service_rate,
          service_gst_rate: it.rev_service_gst_rate,
          taxable_supply: it.rev_taxable_supply,
          gst_supply: it.rev_gst_supply,
          total_supply: it.rev_total_supply,
          taxable_service: it.rev_taxable_service,
          gst_service: it.rev_gst_service,
          total_service: it.rev_total_service,
          total_taxable: it.rev_total_taxable,
          total_gst: it.rev_total_gst,
          total_invoice: it.rev_total_invoice,
          edit_supply_qty: it.edit_supply_qty,
          edit_supply_rate: it.edit_supply_rate,
          edit_supply_gst_rate: it.edit_supply_gst_rate,
          edit_service_qty: it.edit_service_qty,
          edit_service_rate: it.edit_service_rate,
          edit_service_gst_rate: it.edit_service_gst_rate
        }))
      };

      const response = await axios.put(`/api/pos/${poDetails.id}`, payload, { headers });

      // Clear draft after successful submission
      sessionStorage.removeItem(`edit_po_draft_${poDetails.id}`);

      Swal.fire({
        icon: 'success',
        title: 'PO Revised Successfully',
        html: `The Purchase Order has been revised to <strong>${response.data.po_number}</strong>.`,
        confirmButtonColor: '#10B981',
        confirmButtonText: 'Great!'
      }).then(() => {
        navigate('/dashboard');
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to revise PO' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Renderers ---

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
        Swal.fire({ icon: 'error', title: 'Preview Failed', text: 'Could not preview Excel file.' });
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
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {renderFileViewer()}

      {/* Step Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', background: 'white', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #E5E7EB' }}>
        {[
          { id: 1, title: 'Select PO' },
          { id: 2, title: 'Edit Items' },
          { id: 3, title: 'Review Summary' }
        ].map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: s.id < 3 ? 1 : 'none' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: step === s.id ? '#3B82F6' : step > s.id ? '#10B981' : '#F3F4F6',
              color: step >= s.id ? 'white' : '#6B7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem',
              border: step === s.id ? 'none' : '1px solid #E5E7EB',
              transition: 'all 0.3s'
            }}>{step > s.id ? '✓' : s.id}</div>
            <span style={{ marginLeft: '12px', fontWeight: step === s.id ? 700 : 500, color: step >= s.id ? '#1F2937' : '#9CA3AF', fontSize: '0.95rem' }}>{s.title}</span>
            {s.id < 3 && <div style={{ flex: 1, height: '2px', background: step > s.id ? '#10B981' : '#E5E7EB', margin: '0 24px' }} />}
          </div>
        ))}
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>

        {step === 1 && (
          <div>
            <button onClick={prevStep} className="btn-back" style={{ marginBottom: '12px', height: '28px', padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: '6px', background: 'white', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
              Back
            </button>
            <h3 style={{ marginBottom: '16px', color: '#1F2937', fontSize: '1rem', fontWeight: 700 }}>1. Select PO to Edit</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Customer</label>
                <select value={selectedCustomer} onChange={handleCustomerChange} style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Location</label>
                <select value={selectedLocation} onChange={(e) => { setSelectedLocation(e.target.value); setSelectedPO(null); }} style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                  <option value="">-- Select Location --</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.label} ({l.city})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Existing Sales Order</label>
                <select value={selectedPO || ''} onChange={handlePOSelect} style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                  <option value="">-- Select PO --</option>
                  {allPOs.filter(p => p.customer_id == selectedCustomer && p.location_id == selectedLocation).map(po => (
                    <option key={po.id} value={po.id}>
                      {po.po_number || po.order_id} {po.status ? `(${po.status.toUpperCase().replace('_', ' ')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '20px' }}><p style={{ fontSize: '13px' }}>Loading Sales Order Details...</p></div>}

            {poDetails && (
              <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '20px', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)' }}>
                {poDetails.status === 'rejected' && poDetails.remarks && (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <span className="material-symbols-outlined" style={{ color: '#EF4444', fontSize: '24px', marginTop: '2px' }}>report</span>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', color: '#991B1B', fontWeight: 700, fontSize: '0.9rem' }}>Sales Order Rejected / Denied</h4>
                      <p style={{ margin: 0, color: '#7F1D1D', fontSize: '0.85rem', lineHeight: '1.4' }}>
                        <strong>Reason for Denial:</strong> {poDetails.remarks}
                      </p>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#6B7280', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>New Version Sales Order No</p>
                    <p style={{ fontWeight: 800, margin: 0, fontSize: '1rem', color: '#2563EB' }}>{newVersionLabel}</p>
                  </div>
                  <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#6B7280', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Sales Order Date</p>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '0.9rem' }}>{formatDate(poDetails.po_date)}</p>
                  </div>
                  <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#6B7280', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Start Date</p>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '0.9rem' }}>{formatDate(poDetails.start_date)}</p>
                  </div>
                  <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#6B7280', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>End Date</p>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '0.9rem' }}>{formatDate(poDetails.end_date)}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                  {['po_copy', 'po_annex', 'other'].map(type => {
                    const path = poDetails[type === 'other' ? 'other_attachment_path' : type + '_path'];
                    return (
                      <div key={type} style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="material-symbols-outlined" style={{ color: '#6B7280', fontSize: '18px' }}>description</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                        </div>
                        {path ? (
                          <button onClick={() => handleViewFile(path)} style={{ padding: '4px 10px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>View File</button>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#9CA3AF' }}>Not Attached</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '16px', borderTop: '1px solid #E5E7EB', paddingTop: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Project SPOC Details</span>
                  <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(From Master or Customer Address — Edit under Master or Customer Address)</span>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project SPOC Name <span style={{ color: 'red' }}>*</span></label>
                    <select 
                      value={projectSpocName || ''} 
                      onChange={(e) => {
                        const val = e.target.value;
                        const user = filteredProjectUsers.find(u => u.full_name === val);
                        setProjectSpocName(val);
                        setProjectSpocEmail(user ? (user.email || '') : '');
                        setProjectSpocPhone(user ? (user.phone || '') : '');
                      }} 
                      style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px', background: 'white', boxSizing: 'border-box' }}
                    >
                      {filteredProjectUsers.length === 0 ? (
                        <option value="">No Project SPOC Available</option>
                      ) : (
                        <>
                          <option value="">Select Project SPOC</option>
                          {filteredProjectUsers.map(user => (
                            <option key={user.id} value={user.full_name}>{user.full_name}</option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project SPOC Email ID <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        type="email" 
                        value={projectSpocEmail || ''} 
                        readOnly
                        placeholder="Project SPOC Email ID" 
                        style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#E2E8F0', color: '#64748B', cursor: 'not-allowed', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: isProjectPhoneInvalid ? '#EF4444' : '#475569', marginBottom: '4px' }}>Project SPOC Contact Number <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        value={projectSpocPhone || ''} 
                        readOnly
                        placeholder="Project SPOC Contact Number" 
                        style={{ 
                          width: '100%', 
                          height: '30px', 
                          padding: '0 10px', 
                          borderRadius: '6px', 
                          border: isProjectPhoneInvalid ? '1px solid #EF4444' : '1px solid #D1D5DB', 
                          fontSize: '12px', 
                          background: isProjectPhoneInvalid ? '#FEF2F2' : '#E2E8F0', 
                          color: isProjectPhoneInvalid ? '#DC2626' : '#64748B', 
                          cursor: 'not-allowed', 
                          boxSizing: 'border-box' 
                        }} 
                      />
                      {isProjectPhoneInvalid && (
                        <p style={{ color: '#EF4444', fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>
                          Must be exactly 10 digits. Update under Project User Master.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                  <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#3B82F6' }}>settings_suggest</span>
                      <span>Need Approval by Sales for invoice ? <span style={{ color: 'red' }}>*</span></span>
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="needSalesInvoiceApproval" 
                          value="yes" 
                          checked={needSalesInvoiceApproval === 'yes'} 
                          onChange={(e) => setNeedSalesInvoiceApproval(e.target.value)}
                          style={{ cursor: 'pointer' }}
                        />
                        Yes
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="needSalesInvoiceApproval" 
                          value="no" 
                          checked={needSalesInvoiceApproval === 'no'} 
                          onChange={(e) => setNeedSalesInvoiceApproval(e.target.value)}
                          style={{ cursor: 'pointer' }}
                        />
                        No
                      </label>
                    </div>
                  </div>

              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                onClick={nextStep} 
                disabled={!selectedPO || isProjectPhoneInvalid} 
                style={{ 
                  padding: '8px 20px', 
                  background: (!selectedPO || isProjectPhoneInvalid) ? '#9CA3AF' : '#2563EB', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  fontWeight: 700, 
                  fontSize: '12px', 
                  cursor: (!selectedPO || isProjectPhoneInvalid) ? 'not-allowed' : 'pointer', 
                  opacity: (!selectedPO || isProjectPhoneInvalid) ? 0.5 : 1, 
                  transition: 'all 0.2s', 
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)' 
                }}
              >
                Proceed to Edit Items →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
              <div>
                <button onClick={prevStep} className="btn-back" style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px', padding: '8px 16px', borderRadius: '4px', fontWeight: 600 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
                  Back to selection
                </button>
                <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>2. Edit Line Items: {newVersionLabel}</h3>
              </div>
              <div style={{ background: '#FFFBEB', padding: '10px 16px', borderRadius: '8px', border: '1px solid #FEF3C7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: '#D97706', fontSize: '20px' }}>info</span>
                <span style={{ fontSize: '0.9rem', color: '#92400E', fontWeight: 500 }}>Only yellow columns are editable. Others are fetched or auto-calculated.</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '12px', background: 'white', maxHeight: '520px', position: 'relative' }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 40, background: '#F9FAFB' }}>
                  <tr style={{ height: '36px', whiteSpace: 'nowrap' }}>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white', fontSize: '11px', fontWeight: 800, height: '36px', position: 'sticky', left: 0, zIndex: 50 }}>Sl no</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px' }}>Type</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px' }}>Ref No</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px' }}>Package</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px' }}>Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px' }}>Sub Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 800, height: '36px' }}>Item Name</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px', minWidth: '150px' }}>Description <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#111827', fontSize: '11px', fontWeight: 700, height: '36px' }}>UOM</th>

                    {/* Original Headers (Blue) */}
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#3B82F6', color: 'white', fontSize: '11px', fontWeight: 700, height: '36px', minWidth: '110px' }}>Original Qty</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#3B82F6', color: 'white', fontSize: '11px', fontWeight: 700, height: '36px', minWidth: '120px' }}>Original Rate</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#3B82F6', color: 'white', fontSize: '11px', fontWeight: 700, height: '36px', minWidth: '110px' }}>Original GST</th>

                    {/* Edit Headers (Yellow) */}
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E', fontSize: '11px', fontWeight: 800, height: '36px', minWidth: '110px' }}>New Qty</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E', fontSize: '11px', fontWeight: 800, height: '36px', minWidth: '120px' }}>New Rate</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E', fontSize: '11px', fontWeight: 800, height: '36px', minWidth: '110px' }}>New GST Rate</th>

                    {/* Revised Headers (Cyan) */}
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFEFF', fontSize: '11px', height: '36px', minWidth: '130px' }}>Revised Taxable Value</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFEFF', fontSize: '11px', height: '36px', minWidth: '120px' }}>Revised GST</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#CFFAFE', fontSize: '11px', fontWeight: 900, height: '36px', minWidth: '110px' }}>Revised Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const rowType = it.item_type || ((parseFloat(it.supply_qty) || 0) > 0 || (parseFloat(it.supply_rate) || 0) > 0 ? 'supply' : 'service');
                    const origQty = rowType === 'service' ? (it.service_qty || 0) : (it.supply_qty || 0);
                    const origRate = rowType === 'service' ? (it.service_rate || 0) : (it.supply_rate || 0);
                    const origGstRate = rowType === 'service' ? (it.service_gst_rate || 0) : (it.supply_gst_rate || 0);

                    const editQty = rowType === 'service' ? (it.edit_service_qty ?? '') : (it.edit_supply_qty ?? '');
                    const editRate = rowType === 'service' ? (it.edit_service_rate ?? '') : (it.edit_supply_rate ?? '');
                    const editGstRate = rowType === 'service' ? (it.edit_service_gst_rate ?? '') : (it.edit_supply_gst_rate ?? '');

                    return (
                      <tr key={it.id || idx} style={{ height: '32px', whiteSpace: 'nowrap' }}>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'center', background: '#F1F5F9', fontWeight: 800, position: 'sticky', left: 0, zIndex: 10, height: '32px', fontSize: '0.75rem' }}>{idx + 1}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem', textTransform: 'capitalize', fontWeight: 600 }}>{rowType}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.ref_no}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.package_name}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.heading}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.sub_heading}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 600, height: '32px', fontSize: '0.75rem' }}>{it.item_name}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', minWidth: '150px', maxWidth: '200px', height: '32px', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} onClick={() => Swal.fire({ title: 'Item Description', text: it.description, icon: 'info' })}>{it.description}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'center', height: '32px', fontSize: '0.75rem' }}>{it.uom}</td>

                        {/* Original Values */}
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>{origQty}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>₹{origRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'center', height: '32px', fontSize: '0.75rem' }}>{origGstRate}%</td>

                        {/* Edit Values */}
                        <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                          <input
                            type="text"
                            value={editQty}
                            onChange={e => updateItem(idx, rowType === 'service' ? 'edit_service_qty' : 'edit_supply_qty', e.target.value)}
                            style={{ width: '80px', border: 'none', padding: '0 8px', textAlign: 'right', background: 'transparent', height: '32px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                          <input
                            type="text"
                            value={editRate}
                            onChange={e => updateItem(idx, rowType === 'service' ? 'edit_service_rate' : 'edit_supply_rate', e.target.value)}
                            style={{ width: '90px', border: 'none', padding: '0 8px', textAlign: 'right', background: 'transparent', height: '32px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                          <select
                            value={editGstRate}
                            onChange={e => updateItem(idx, rowType === 'service' ? 'edit_service_gst_rate' : 'edit_supply_gst_rate', e.target.value)}
                            style={{ width: '80px', border: 'none', padding: '0 8px', fontSize: '0.75rem', background: 'transparent', cursor: 'pointer', height: '32px' }}
                          >
                            <option value="">GST</option>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                          </select>
                        </td>

                        {/* Revised Values */}
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>₹{it.rev_total_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>₹{it.rev_total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, color: '#1E40AF', background: '#F0F9FF', height: '32px', fontSize: '0.75rem' }}>₹{it.rev_total_invoice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ position: 'sticky', bottom: 0, marginTop: '12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '32px', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)', padding: '10px 24px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', zIndex: 100 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: 0, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.025em' }}>Revised Taxable</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#374151' }}>₹{items.reduce((s, i) => s + (i.rev_total_taxable || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: 0, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.025em' }}>Revised Grand Total</p>
                <p style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, color: '#10B981' }}>₹{items.reduce((s, i) => s + (i.rev_total_invoice || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <button onClick={nextStep} style={{ marginLeft: '12px', padding: '10px 28px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)', transition: 'all 0.2s' }}>
                Review Changes
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
              <div>
                <button onClick={prevStep} className="btn-back" style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px', padding: '8px 16px', borderRadius: '4px', fontWeight: 600 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
                  Back to edit items
                </button>
                <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>3. Final Review: {newVersionLabel}</h3>
              </div>
            </div>

            <div style={{ background: '#F9FAFB', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
              <div>
                <p style={{ margin: '0 0 8px' }}><strong>Sales Order Number:</strong> {newVersionLabel}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Customer:</strong> {customers.find(c => c.id == selectedCustomer)?.name}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Location:</strong> {locations.find(l => l.id == selectedLocation)?.label}</p>
                <p style={{ margin: 0 }}><strong>Sales Order Date:</strong> {formatDate(poDetails?.po_date)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>Overall Revised Subtotal</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px', color: '#374151' }}>₹{items.reduce((s, i) => s + (i.rev_total_taxable || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>Overall Revised Grand Total</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: '#10B981' }}>₹{items.reduce((s, i) => s + (i.rev_total_invoice || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            <h4 style={{ marginBottom: '16px', color: '#374151' }}>Package-wise Summary</h4>
            <SummaryTable data={items} />

            {/* <h4 style={{ marginBottom: '16px', color: '#374151', marginTop: '32px' }}>Detailed Review (All Items)</h4>
            <ReviewDetailTable data={items} /> */}

            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleSubmit} disabled={submitting} style={{ width: '15%', padding: '10px', background: '#10B981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '1.1rem', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', transition: 'all 0.2s' }}>
                {submitting ? 'Processing...' : 'Confirm Edit ✓'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// --- Helper Components: Summary Tables using TanStack ---

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
      acc[pkg].supply_taxable += (it.rev_taxable_supply || 0);
      acc[pkg].supply_gst += (it.rev_gst_supply || 0);
      acc[pkg].service_taxable += (it.rev_taxable_service || 0);
      acc[pkg].service_gst += (it.rev_gst_service || 0);
      acc[pkg].total_taxable += (it.rev_total_taxable || 0);
      acc[pkg].total_gst += (it.rev_total_gst || 0);
      acc[pkg].total_invoice += (it.rev_total_invoice || 0);
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
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'Supply GST',
      accessorKey: 'supply_gst',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'Service Tax Value',
      accessorKey: 'service_taxable',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'Service GST',
      accessorKey: 'service_gst',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'Total Tax Value',
      accessorKey: 'total_taxable',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    },
    {
      header: 'Total GST',
      accessorKey: 'total_gst',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    },
    {
      header: 'Total Invoice',
      accessorKey: 'total_invoice',
      cell: info => <span style={{ fontWeight: 700, color: '#2563EB' }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
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

function ReviewDetailTable({ data }) {
  const columns = React.useMemo(() => [
    { header: 'Sl No', accessorFn: (_, i) => i + 1, size: 40 },
    { header: 'Ref No', accessorKey: 'ref_no' },
    { header: 'Package', accessorKey: 'package_name' },
    { header: 'Heading', accessorKey: 'heading' },
    { header: 'Sub Heading', accessorKey: 'sub_heading' },
    { header: 'Item Name', accessorKey: 'item_name', cell: info => info.getValue() === 'Item' ? '' : info.getValue() },
    { header: 'UOM', accessorKey: 'uom' },
    { header: 'Supply Qty', accessorKey: 'rev_supply_qty' },
    { header: 'Supply Rate', accessorKey: 'rev_supply_rate', cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { header: 'Supply GST %', accessorKey: 'rev_supply_gst_rate', cell: info => `${info.getValue()}%` },
    { header: 'Service Qty', accessorKey: 'rev_service_qty' },
    { header: 'Service Rate', accessorKey: 'rev_service_rate', cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { header: 'Service GST %', accessorKey: 'rev_service_gst_rate', cell: info => `${info.getValue()}%` },
    { header: 'Taxable Total', accessorKey: 'rev_total_taxable', cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { header: 'Total GST', accessorKey: 'rev_total_gst', cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { header: 'Grand Total', accessorKey: 'rev_total_invoice', cell: info => <span style={{ fontWeight: 700 }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> },
  ], []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E7EB', overflow: 'auto', maxHeight: '500px' }}>
      <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.75rem' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} style={{ height: '36px' }}>
              {headerGroup.headers.map(header => (
                <th key={header.id} style={{ padding: '0 8px', textAlign: 'left', color: '#4B5563', fontWeight: 700, border: '1px solid #E5E7EB', fontSize: '11px', height: '36px' }}>
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
                <td key={cell.id} style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px' }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
