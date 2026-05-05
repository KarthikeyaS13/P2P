import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
    // REVISED values: Use the EDIT values if NOT NULL, otherwise fallback to ORIGINAL
    const rev_s_qty = row.edit_supply_qty !== null ? cleanParse(row.edit_supply_qty) : cleanParse(row.supply_qty);
    const rev_s_rate = row.edit_supply_rate !== null ? cleanParse(row.edit_supply_rate) : cleanParse(row.supply_rate);
    const rev_s_gst_pct = row.edit_supply_gst_rate !== null ? cleanParse(row.edit_supply_gst_rate) : cleanParse(row.supply_gst_rate);

    const rev_sv_qty = row.edit_service_qty !== null ? cleanParse(row.edit_service_qty) : cleanParse(row.service_qty);
    const rev_sv_rate = row.edit_service_rate !== null ? cleanParse(row.edit_service_rate) : cleanParse(row.service_rate);
    const rev_sv_gst_pct = row.edit_service_gst_rate !== null ? cleanParse(row.edit_service_gst_rate) : cleanParse(row.service_gst_rate);

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
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [cRes, pRes] = await Promise.all([
          axios.get('http://localhost:3000/api/customers', { headers }),
          axios.get('http://localhost:3000/api/pos', { headers })
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
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`http://localhost:3000/api/locations?customer_id=${val}`, { headers });
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
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:3000/api/pos/${poId}`, { headers });
      const data = res.data;

      setPODetails(data);
      setItems(data.items.map(it => calculateRow({
        ...it,
        edit_supply_qty: null,
        edit_supply_rate: null,
        edit_supply_gst_rate: null,
        edit_service_qty: null,
        edit_service_rate: null,
        edit_service_gst_rate: null
      })));

      // Use original PO number for overriding
      setNewVersionLabel(data.po_number || data.order_id);

      setSelectedPO(poId);
    } catch (err) {
      console.error(err);
      alert('Failed to load PO details');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx, field, val) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = calculateRow({ ...updated[idx], [field]: val });
      return updated;
    });
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
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
          total_invoice: it.rev_total_invoice
        }))
      };

      await axios.put(`http://localhost:3000/api/pos/${poDetails.id}`, payload, { headers });
      alert('PO Revised successfully!');
      navigate('/dashboard');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revise PO');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Renderers ---

  const handleViewFile = async (path) => {
    const filename = path.split('/').pop();
    const fullUrl = `http://localhost:3000/uploads/${filename}`;
    const isExcel = filename.toLowerCase().match(/\.(xlsx|xls|xlsm)$/);

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
        alert("Could not preview Excel file.");
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Edit Purchase Order / NT PO</h2>
      </div>

      <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>

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
                <button onClick={prevStep} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px', padding: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
                  <span style={{ fontWeight: 600 }}>Back to selection</span>
                </button>
                <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>2. Edit Line Items: {newVersionLabel}</h3>
              </div>
              <div style={{ background: '#FFFBEB', padding: '10px 16px', borderRadius: '8px', border: '1px solid #FEF3C7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: '#D97706', fontSize: '20px' }}>info</span>
                <span style={{ fontSize: '0.9rem', color: '#92400E', fontWeight: 500 }}>Only yellow columns are editable. Others are fetched or auto-calculated.</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '12px', background: '#F9FAFB', maxHeight: '600px' }}>
              <table style={{ width: 'max-content', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.65rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Sl no (SYS GEN)</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Ref No</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Package</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Heading</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Sub Heading (if Any)</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>Item Name</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white', minWidth: '150px' }}>Item Description</th>
                    <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white' }}>UOM</th>

                    <th colSpan="6" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E3A8A', color: 'white', textAlign: 'center' }}>Fetched (Original PO Data)</th>
                    <th colSpan="6" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FCD34D', color: '#111827', textAlign: 'center' }}>EDIT Entry (Only Yellow Columns)</th>
                    <th colSpan="15" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#A5F3FC', color: '#0E7490', textAlign: 'center' }}>AUTO CAL (Revised Values)</th>
                  </tr>
                  <tr style={{ background: '#F9FAFB' }}>
                    {/* Fetched */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Supply QTY</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#1E40AF', color: 'white' }}>Supply Rate</th>
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
                        <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '0.6rem', color: '#6B7280' }}>
                          {it.description}
                        </div>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.uom}</td>

                      {/* Fetched Cells */}
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.supply_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.supply_rate.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.supply_gst_rate}%</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.service_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.service_rate.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.service_gst_rate}%</td>

                      {/* EDIT Cells */}
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" placeholder={it.supply_qty} value={it.edit_supply_qty === null ? 0 : it.edit_supply_qty} onChange={e => updateItem(idx, 'edit_supply_qty', e.target.value)} style={{ width: '80px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" placeholder={it.supply_rate} value={it.edit_supply_rate === null ? 0 : it.edit_supply_rate} onChange={e => updateItem(idx, 'edit_supply_rate', e.target.value)} style={{ width: '90px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <select value={it.edit_supply_gst_rate === null ? '' : it.edit_supply_gst_rate} onChange={e => updateItem(idx, 'edit_supply_gst_rate', e.target.value)} style={{ width: '60px', border: 'none', padding: '8px', textAlign: 'center', background: 'transparent', cursor: 'pointer' }}>
                          <option value="18">18%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>

                        </select>
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" placeholder={it.service_qty} value={it.edit_service_qty === null ? 0 : it.edit_service_qty} onChange={e => updateItem(idx, 'edit_service_qty', e.target.value)} style={{ width: '80px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="text" placeholder={it.service_rate} value={it.edit_service_rate === null ? 0 : it.edit_service_rate} onChange={e => updateItem(idx, 'edit_service_rate', e.target.value)} style={{ width: '90px', border: 'none', padding: '8px', textAlign: 'right', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <select value={it.edit_service_gst_rate === null ? '' : it.edit_service_gst_rate} onChange={e => updateItem(idx, 'edit_service_gst_rate', e.target.value)} style={{ width: '60px', border: 'none', padding: '8px', textAlign: 'center', background: 'transparent', cursor: 'pointer' }}>
                          <option value="18">18%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>

                        </select>
                      </td>

                      {/* AUTO CAL Cells */}
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.rev_supply_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_supply_rate.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.rev_supply_gst_rate}%</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>{it.rev_service_qty}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_service_rate.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.rev_service_gst_rate}%</td>

                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_taxable_supply.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_gst_supply.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_total_supply.toLocaleString()}</td>

                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_taxable_service.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_gst_service.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right' }}>₹{it.rev_total_service.toLocaleString()}</td>

                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600 }}>₹{it.rev_total_taxable.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600 }}>₹{it.rev_total_gst.toLocaleString()}</td>
                      <td style={{ padding: '8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>₹{it.rev_total_invoice.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end', gap: '48px', background: '#F9FAFB', padding: '24px', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>Revised Taxable Amount</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#374151' }}>₹{items.reduce((s, i) => s + (i.rev_total_taxable || 0), 0).toLocaleString()}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>Revised Grand Total</p>
                <p style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: '#10B981' }}>₹{items.reduce((s, i) => s + (i.rev_total_invoice || 0), 0).toLocaleString()}</p>
              </div>
            </div>

            <div style={{ marginTop: '32px', display: 'flex', gap: '16px' }}>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '18px', background: '#10B981', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '1.2rem', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)', transition: 'all 0.2s' }}>
                {submitting ? 'Processing Revision...' : '✓ Submit Revised Purchase Order'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
