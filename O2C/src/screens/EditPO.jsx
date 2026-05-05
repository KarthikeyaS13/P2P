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

  const calculateRow = (row) => {
    // REVISED values are the EDIT values if provided, otherwise the ORIGINAL values
    const rev_s_qty = parseFloat(row.edit_supply_qty !== undefined && row.edit_supply_qty !== '' ? row.edit_supply_qty : row.supply_qty) || 0;
    const rev_s_rate = parseFloat(row.edit_supply_rate !== undefined && row.edit_supply_rate !== '' ? row.edit_supply_rate : row.supply_rate) || 0;
    const rev_s_gst_pct = parseFloat(row.edit_supply_gst_rate !== undefined && row.edit_supply_gst_rate !== '' ? row.edit_supply_gst_rate : row.supply_gst_rate) || 0;
    
    const rev_sv_qty = parseFloat(row.edit_service_qty !== undefined && row.edit_service_qty !== '' ? row.edit_service_qty : row.service_qty) || 0;
    const rev_sv_rate = parseFloat(row.edit_service_rate !== undefined && row.edit_service_rate !== '' ? row.edit_service_rate : row.service_rate) || 0;
    const rev_sv_gst_pct = parseFloat(row.edit_service_gst_rate !== undefined && row.edit_service_gst_rate !== '' ? row.edit_service_gst_rate : row.service_gst_rate) || 0;

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
        edit_supply_qty: '',
        edit_supply_rate: '',
        edit_supply_gst_rate: '',
        edit_service_qty: '',
        edit_service_rate: '',
        edit_service_gst_rate: ''
      })));
      
      // Automatic Versioning: PO-123 -> PO-123_01
      const cleanNum = (data.po_number || data.order_id).replace(/_(\d+)$/, '');
      setNewVersionLabel(`${cleanNum}_01`);
      
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
        customer_id: poDetails.customer_id,
        location_id: poDetails.location_id,
        po_number: newVersionLabel,
        po_date: poDetails.po_date,
        start_date: poDetails.start_date,
        end_date: poDetails.end_date,
        po_copy_path: poDetails.po_copy_path,
        po_annex_path: poDetails.po_annex_path,
        other_attachment_path: poDetails.other_attachment_path,
        is_nt_po: poDetails.is_nt_po,
        linked_po_id: poDetails.id,
        subtotal,
        gst_total,
        grand_total,
        items: items.map(it => ({
          ...it,
          supply_qty: it.rev_supply_qty,
          supply_rate: it.rev_supply_rate,
          supply_gst_rate: it.rev_supply_gst_rate,
          service_qty: it.rev_service_qty,
          service_rate: it.rev_service_rate,
          service_gst_rate: it.rev_service_gst_rate
        }))
      };

      await axios.post('http://localhost:3000/api/pos', payload, { headers });
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
            
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '12px', background: '#F9FAFB' }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th rowSpan="2" style={{ padding: '12px', border: '1px solid #E5E7EB', borderTopLeftRadius: '12px' }}>Sl No</th>
                    <th rowSpan="2" style={{ padding: '12px', border: '1px solid #E5E7EB' }}>Ref No</th>
                    <th rowSpan="2" style={{ padding: '12px', border: '1px solid #E5E7EB', minWidth: '220px' }}>Item Details (Read-only)</th>
                    
                    <th colSpan="6" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#E5E7EB', textAlign: 'center', color: '#4B5563' }}>Original PO Data (Fetched)</th>
                    <th colSpan="6" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center', color: '#92400E' }}>Revision Entries (Edit Yellow Columns)</th>
                    <th colSpan="4" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'center', color: '#1E40AF' }}>Revised Calculations</th>
                  </tr>
                  <tr style={{ background: '#F9FAFB' }}>
                    {/* Original Data */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '70px' }}>Supply Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '80px' }}>Supply Rate</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '70px' }}>Service Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '80px' }}>Service Rate</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '60px' }}>S-GST %</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '60px' }}>Sv-GST %</th>
                    
                    {/* Edit Entry */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FFFBEB', minWidth: '90px' }}>New Supply Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FFFBEB', minWidth: '100px' }}>New Supply Rate</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FFFBEB', minWidth: '90px' }}>New Service Qty</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FFFBEB', minWidth: '100px' }}>New Service Rate</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FFFBEB', minWidth: '70px' }}>New S-GST %</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FFFBEB', minWidth: '70px' }}>New Sv-GST %</th>
                    
                    {/* Revised Calc */}
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F0F9FF', minWidth: '110px' }}>Rev. Supply Taxable</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F0F9FF', minWidth: '110px' }}>Rev. Service Taxable</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F0F9FF', minWidth: '100px' }}>Rev. Total GST</th>
                    <th style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#FEF3C7', color: '#92400E', minWidth: '120px' }}>Rev. Grand Total</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'white' }}>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600, color: '#6B7280' }}>{idx + 1}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 500 }}>{it.ref_no || '-'}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB' }}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{it.package_name || '-'}</div>
                        <div style={{ color: '#4B5563' }}>{it.heading} | {it.sub_heading}</div>
                        <div style={{ fontWeight: 600, color: '#2563EB', marginTop: '4px' }}>{it.item_name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{it.description}</div>
                      </td>
                      
                      {/* Original Data Cells */}
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280' }}>{it.supply_qty}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280' }}>₹{it.supply_rate.toLocaleString()}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280' }}>{it.service_qty}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280' }}>₹{it.service_rate.toLocaleString()}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#6B7280' }}>{it.supply_gst_rate}%</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#6B7280' }}>{it.service_gst_rate}%</td>
                      
                      {/* Revision Input Cells */}
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="number" placeholder={it.supply_qty} value={it.edit_supply_qty} onChange={e => updateItem(idx, 'edit_supply_qty', e.target.value)} style={{ width: '100%', border: 'none', padding: '12px', textAlign: 'right', background: 'transparent', fontWeight: 700, color: '#92400E' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="number" placeholder={it.supply_rate} value={it.edit_supply_rate} onChange={e => updateItem(idx, 'edit_supply_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '12px', textAlign: 'right', background: 'transparent', fontWeight: 700, color: '#92400E' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="number" placeholder={it.service_qty} value={it.edit_service_qty} onChange={e => updateItem(idx, 'edit_service_qty', e.target.value)} style={{ width: '100%', border: 'none', padding: '12px', textAlign: 'right', background: 'transparent', fontWeight: 700, color: '#92400E' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="number" placeholder={it.service_rate} value={it.edit_service_rate} onChange={e => updateItem(idx, 'edit_service_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '12px', textAlign: 'right', background: 'transparent', fontWeight: 700, color: '#92400E' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="number" placeholder={it.supply_gst_rate} value={it.edit_supply_gst_rate} onChange={e => updateItem(idx, 'edit_supply_gst_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '12px', textAlign: 'center', background: 'transparent', fontWeight: 700, color: '#92400E' }} />
                      </td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}>
                        <input type="number" placeholder={it.service_gst_rate} value={it.edit_service_gst_rate} onChange={e => updateItem(idx, 'edit_service_gst_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '12px', textAlign: 'center', background: 'transparent', fontWeight: 700, color: '#92400E' }} />
                      </td>
                      
                      {/* Calculations Cells */}
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', background: '#F0F9FF', textAlign: 'right', fontWeight: 600 }}>₹{(it.rev_taxable_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', background: '#F0F9FF', textAlign: 'right', fontWeight: 600 }}>₹{(it.rev_taxable_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', background: '#F0F9FF', textAlign: 'right', fontWeight: 600 }}>₹{(it.rev_total_gst || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'right', fontWeight: 800, color: '#92400E' }}>₹{(it.rev_total_invoice || 0).toLocaleString()}</td>
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
