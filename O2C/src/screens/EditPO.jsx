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

  // PO Details
  const [poDetails, setPODetails] = useState(null);
  const [items, setItems] = useState([]);
  const [newVersionLabel, setNewVersionLabel] = useState('');

  // Preview State
  const [previewPath, setPreviewPath] = useState(null);
  const [previewExcelData, setPreviewExcelData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // --- Helper Functions ---

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
        const [cRes, pRes] = await Promise.all([
          axios.get('http://localhost:5000/api/customers', { headers }),
          axios.get('http://localhost:5000/api/pos', { headers })
        ]);
        setCustomers(Array.isArray(cRes.data) ? cRes.data : []);
        setAllPOs(Array.isArray(pRes.data) ? pRes.data : []);
      } catch (err) {
        console.error(err);
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
    setLocations([]);
    if (val) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`http://localhost:5000/api/locations?customer_id=${val}`, { headers });
        setLocations(Array.isArray(res.data) ? res.data : []);
      } catch (err) { console.error(err); }
    }
  };

  const handlePOSelect = async (e) => {
    const poId = e.target.value;
    if (!poId) {
      setSelectedPO(null);
      setPODetails(null);
      return;
    }

    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:5000/api/pos/${poId}`, { headers });
      const data = res.data;

      setPODetails(data);
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
      console.error(err);
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

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const subtotal = items.reduce((acc, it) => acc + (it.rev_total_taxable || 0), 0);
      const gst_total = items.reduce((acc, it) => acc + (it.rev_total_gst || 0), 0);
      const grand_total = items.reduce((acc, it) => acc + (it.rev_total_invoice || 0), 0);

      const payload = {
        items: items.map(it => ({
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

      await axios.put(`http://localhost:5000/api/pos/${poDetails.id}`, payload, { headers });

      // Clear draft after successful submission
      sessionStorage.removeItem(`edit_po_draft_${poDetails.id}`);

      Swal.fire({ icon: 'success', title: 'Revised', text: 'PO Revised successfully!', timer: 2000, showConfirmButton: false });
      navigate('/dashboard');
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
        console.error("Preview failed", err);
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

      <div style={{ background: 'white', padding: '32px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', border: '1px solid #F3F4F6' }}>

        {step === 1 && (
          <div>
            <h3 style={{ marginBottom: '24px', color: '#1F2937' }}>1. Select PO to Edit</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: '#4B5563' }}>Select Customer</label>
                <select value={selectedCustomer} onChange={handleCustomerChange} style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem' }}>
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: '#4B5563' }}>Select Location</label>
                <select value={selectedLocation} onChange={(e) => { setSelectedLocation(e.target.value); setSelectedPO(null); }} style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem' }}>
                  <option value="">-- Select Location --</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.label} ({l.city})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: '#4B5563' }}>Existing Purchase Order</label>
                <select value={selectedPO || ''} onChange={handlePOSelect} style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '1rem' }}>
                  <option value="">-- Select PO --</option>
                  {allPOs.filter(p => p.customer_id == selectedCustomer && p.location_id == selectedLocation).map(po => (
                    <option key={po.id} value={po.id}>{po.po_number || po.order_id}</option>
                  ))}
                </select>
              </div>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '40px' }}><p>Loading PO Details...</p></div>}

            {poDetails && (
              <div style={{ background: '#F9FAFB', padding: '32px', borderRadius: '16px', border: '1px solid #E5E7EB', marginBottom: '32px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px', marginBottom: '24px' }}>
                  <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>New Version PO No</p>
                    <p style={{ fontWeight: 800, margin: 0, fontSize: '1.25rem', color: '#2563EB' }}>{newVersionLabel}</p>
                  </div>
                  <div>
                    <p style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>PO Date</p>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>{poDetails.po_date}</p>
                  </div>
                  <div>
                    <p style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Start Date</p>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>{poDetails.start_date}</p>
                  </div>
                  <div>
                    <p style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>End Date</p>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>{poDetails.end_date}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '20px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
                  {['po_copy', 'po_annex', 'other'].map(type => {
                    const path = poDetails[type === 'other' ? 'other_attachment_path' : type + '_path'];
                    return (
                      <div key={type} style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px 16px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="material-symbols-outlined" style={{ color: '#6B7280' }}>description</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                        </div>
                        {path ? (
                          <button onClick={() => handleViewFile(path)} style={{ padding: '6px 14px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>View File</button>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Not Attached</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={nextStep} disabled={!selectedPO} style={{ width: '100%', padding: '16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1.1rem', cursor: !selectedPO ? 'not-allowed' : 'pointer', opacity: !selectedPO ? 0.5 : 1, transition: 'all 0.2s' }}>Proceed to Edit Items →</button>
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

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '12px', background: '#F9FAFB', maxHeight: '700px', position: 'relative' }}>
              <table style={{ width: 'max-content', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.75rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Sl no (SYS GEN)</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Ref No</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Package</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Heading</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Sub Heading (if Any)</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Item Name</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white', minWidth: '150px' }}>Item Description</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>UOM</th>
                  </tr>
                  <tr style={{ background: '#F9FAFB' }}>
                    {/* Fetched */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Supply QTY</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Supply Rate Per Unit</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Supply GST</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Service QTY</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Service Rate</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Service GST</th>

                    {/* EDIT */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E' }}>EDIT Supply Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E' }}>EDIT RPU Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E' }}>EDIT GST on Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E' }}>EDIT Service Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E' }}>EDIT RPU Service</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E' }}>EDIT GST on SERVICE</th>

                    {/* AUTO CAL */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED Supply Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED RPU Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED GST % Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED Service Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED RPU Service</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED GST % Service</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED Taxable Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED GST Value Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED Total Supply</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED Taxable Service</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED GST Value Service</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE' }}>REVISED Total Service</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE', fontWeight: 700 }}>REVISED TOTAL Taxable</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE', fontWeight: 700 }}>REVISED TOTAL GST</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#CFFAFE', fontWeight: 700 }}>REVISED TOTAL Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center', background: '#F9FAFB' }}>{idx + 1}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB' }}>{it.ref_no}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB' }}>{it.package_name}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB' }}>{it.heading}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB' }}>{it.sub_heading}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', fontWeight: 600 }}>{it.item_name}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '150px', maxWidth: '200px' }}>
                        <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '0.75rem', color: '#6B7280' }}>
                          {it.description.slice(0, 80)}
                        </div>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.uom}</td>

                      {/* Fetched Cells */}
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.supply_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.supply_rate.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.supply_gst_rate}%</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.service_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.service_rate.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.service_gst_rate}%</td>

                      {/* EDIT Cells */}
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" value={it.edit_supply_qty ?? ''} onChange={e => updateItem(idx, 'edit_supply_qty', e.target.value)} style={{ width: '80px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" value={it.edit_supply_rate ?? ''} onChange={e => updateItem(idx, 'edit_supply_rate', e.target.value)} style={{ width: '90px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <select value={it.edit_supply_gst_rate ?? ''} onChange={e => updateItem(idx, 'edit_supply_gst_rate', e.target.value)} style={{ width: '60px', border: 'none', padding: '8px', textAlign: 'center', background: 'transparent', cursor: 'pointer' }}>
                          <option value="">Select GST</option>

                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" value={it.edit_service_qty ?? ''} onChange={e => updateItem(idx, 'edit_service_qty', e.target.value)} style={{ width: '80px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" value={it.edit_service_rate ?? ''} onChange={e => updateItem(idx, 'edit_service_rate', e.target.value)} style={{ width: '90px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <select value={it.edit_service_gst_rate ?? ''} onChange={e => updateItem(idx, 'edit_service_gst_rate', e.target.value)} style={{ width: '60px', border: 'none', padding: '8px', textAlign: 'center', background: 'transparent', cursor: 'pointer' }}>
                          <option value="">Select GST</option>

                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>

                      {/* AUTO CAL Cells */}
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.rev_supply_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_supply_rate.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.rev_supply_gst_rate}%</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.rev_service_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_service_rate.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.rev_service_gst_rate}%</td>

                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_taxable_supply.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_gst_supply.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_total_supply.toLocaleString('en-IN')}</td>

                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_taxable_service.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_gst_service.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_total_service.toLocaleString('en-IN')}</td>

                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600 }}>₹{it.rev_total_taxable.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600 }}>₹{it.rev_total_gst.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>₹{it.rev_total_invoice.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ position: 'sticky', bottom: 0, marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '48px', background: 'rgba(249, 250, 251, 0.95)', backdropFilter: 'blur(8px)', padding: '20px 24px', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 -4px 10px rgba(0,0,0,0.05)', zIndex: 15 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>Revised Taxable Amount</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#374151' }}>₹{items.reduce((s, i) => s + (i.rev_total_taxable || 0), 0).toLocaleString('en-IN')}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>Revised Grand Total</p>
                <p style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: '#10B981' }}>₹{items.reduce((s, i) => s + (i.rev_total_invoice || 0), 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div style={{ marginTop: '32px', display: 'flex', gap: '16px' }}>
              <button onClick={nextStep} style={{ flex: 1, padding: '18px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '1.2rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)', transition: 'all 0.2s' }}>
                Review
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
                <p style={{ margin: '0 0 8px' }}><strong>PO Number:</strong> {newVersionLabel}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Customer:</strong> {customers.find(c => c.id == selectedCustomer)?.name}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Location:</strong> {locations.find(l => l.id == selectedLocation)?.label}</p>
                <p style={{ margin: 0 }}><strong>Dates:</strong> {poDetails?.po_date} | {poDetails?.start_date} to {poDetails?.end_date}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>Overall Revised Subtotal</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px', color: '#374151' }}>₹{items.reduce((s, i) => s + (i.rev_total_taxable || 0), 0).toLocaleString('en-IN')}</p>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>Overall Revised Grand Total</p>
                <p style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: '#10B981' }}>₹{items.reduce((s, i) => s + (i.rev_total_invoice || 0), 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            <h4 style={{ marginBottom: '16px', color: '#374151' }}>Package-wise Summary</h4>
            <SummaryTable data={items} />

            {/* <h4 style={{ marginBottom: '16px', color: '#374151', marginTop: '32px' }}>Detailed Review (All Items)</h4>
            <ReviewDetailTable data={items} /> */}

            <div style={{ marginTop: '40px', display: 'flex', gap: '16px' }}>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '20px', background: '#10B981', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '1.3rem', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)', transition: 'all 0.2s' }}>
                {submitting ? 'Processing Revision...' : '✓ Confirm & Submit Revised Purchase Order'}
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
    <div style={{ marginBottom: '40px' }}>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '12px 16px', textAlign: 'left', color: '#4B5563', fontWeight: 700, borderRight: '1px solid #F3F4F6' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '12px 16px', borderRight: '1px solid #F3F4F6' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot style={{ background: '#F9FAFB', fontWeight: 700, borderTop: '2px solid #E5E7EB' }}>
            <tr>
              <td style={{ padding: '12px 16px' }}>TOTAL</td>
              <td style={{ padding: '12px 16px' }}>₹{grandTotals.supply_taxable.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px' }}>₹{grandTotals.supply_gst.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px' }}>₹{grandTotals.service_taxable.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px' }}>₹{grandTotals.service_gst.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px' }}>₹{grandTotals.total_taxable.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px' }}>₹{grandTotals.total_gst.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', color: '#2563EB' }}>₹{grandTotals.total_invoice.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#F0F9FF', padding: '20px 32px', borderRadius: '16px', border: '1px solid #BAE6FD', textAlign: 'right', minWidth: '350px' }}>
          <p style={{ margin: '0 0 4px', color: '#0369A1', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase' }}>Revised Grand Total</p>
          <p style={{ margin: 0, color: '#0369A1', fontSize: '2.5rem', fontWeight: 900 }}>₹{grandTotals.total_invoice.toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
}

function ReviewDetailTable({ data }) {
  const columns = React.useMemo(() => [
    { header: '#', accessorFn: (_, i) => i + 1, size: 40 },
    { header: 'Ref No', accessorKey: 'ref_no' },
    { header: 'Package', accessorKey: 'package_name' },
    { header: 'Heading', accessorKey: 'heading' },
    { header: 'Sub Heading', accessorKey: 'sub_heading' },
    { header: 'Item Name', accessorKey: 'item_name', cell: info => info.getValue() === 'Item' ? '' : info.getValue() },
    { header: 'UOM', accessorKey: 'uom' },
    { header: 'S.Qty', accessorKey: 'rev_supply_qty' },
    { header: 'S.Rate', accessorKey: 'rev_supply_rate', cell: info => `₹${info.getValue().toLocaleString('en-IN')}` },
    { header: 'S.GST%', accessorKey: 'rev_supply_gst_rate', cell: info => `${info.getValue()}%` },
    { header: 'Sv.Qty', accessorKey: 'rev_service_qty' },
    { header: 'Sv.Rate', accessorKey: 'rev_service_rate', cell: info => `₹${info.getValue().toLocaleString('en-IN')}` },
    { header: 'Sv.GST%', accessorKey: 'rev_service_gst_rate', cell: info => `${info.getValue()}%` },
    { header: 'Taxable', accessorKey: 'rev_total_taxable', cell: info => `₹${info.getValue().toLocaleString('en-IN')}` },
    { header: 'GST', accessorKey: 'rev_total_gst', cell: info => `₹${info.getValue().toLocaleString('en-IN')}` },
    { header: 'Invoice', accessorKey: 'rev_total_invoice', cell: info => <span style={{ fontWeight: 700 }}>₹{info.getValue().toLocaleString('en-IN')}</span> },
  ], []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E7EB', overflow: 'auto', maxHeight: '500px' }}>
      <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} style={{ padding: '10px 12px', textAlign: 'left', color: '#4B5563', fontWeight: 700, border: '1px solid #E5E7EB' }}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} style={{ padding: '8px 12px', border: '1px solid #E5E7EB' }}>
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
