import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
  const [allPOs, setAllPOs] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  
  // PO Details
  const [poDetails, setPODetails] = useState(null);
  const [items, setItems] = useState([]);
  const [newVersionLabel, setNewVersionLabel] = useState('');

  // Attachments State
  const [attachments, setAttachments] = useState({
    po_copy: null,
    po_annex: null,
    other: null
  });
  const [attachmentPaths, setAttachmentPaths] = useState({
    po_copy: '',
    po_annex: '',
    other: ''
  });

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
    const fetchPOs = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/pos', { headers });
        setAllPOs(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPOs();
  }, []);

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

  const uploadAttachments = async () => {
    const formData = new FormData();
    if (attachments.po_copy) formData.append('po_copy', attachments.po_copy);
    if (attachments.po_annex) formData.append('po_annex', attachments.po_annex);
    if (attachments.other) formData.append('other', attachments.other);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' };
      const res = await axios.post('http://localhost:3000/api/upload-multi', formData, { headers });
      setAttachmentPaths(res.data);
      return res.data;
    } catch (err) {
      console.error('Upload failed', err);
      return {};
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
      
      const paths = await uploadAttachments();

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
        po_copy_path: paths.po_copy || poDetails.po_copy_path,
        po_annex_path: paths.po_annex || poDetails.po_annex_path,
        other_attachment_path: paths.other_attachment_path || poDetails.other_attachment_path,
        is_nt_po: poDetails.is_nt_po,
        linked_po_id: poDetails.id, // Link to original for version history
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

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Edit Purchase Order / NT PO</h2>
      </div>

      <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        
        {step === 1 && (
          <div style={{ maxWidth: '600px' }}>
            <h3>1. Select PO to Edit</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Existing Purchase Order</label>
                <select value={selectedPO || ''} onChange={handlePOSelect} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}>
                  <option value="">-- Select PO --</option>
                  {allPOs.map(po => <option key={po.id} value={po.id}>{po.po_number || po.order_id} - {po.customer_name}</option>)}
                </select>
              </div>
              
              {loading && <p>Loading details...</p>}

              {poDetails && (
                <div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                  <p><strong>Customer:</strong> {poDetails.customer_name}</p>
                  <p><strong>Location:</strong> {poDetails.location_name}</p>
                  <p><strong>Original Date:</strong> {poDetails.po_date}</p>
                  <div style={{ marginTop: '15px' }}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '5px' }}>New Version PO Number</label>
                    <input type="text" value={newVersionLabel} onChange={e => setNewVersionLabel(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#FFFBEB' }} />
                  </div>
                </div>
              )}

              <button onClick={nextStep} disabled={!selectedPO} style={{ padding: '12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: !selectedPO ? 'not-allowed' : 'pointer', opacity: !selectedPO ? 0.5 : 1 }}>Next: Attachments & Dates →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3>2. Attachments & Non-Editable Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div style={{ background: '#F3F4F6', padding: '20px', borderRadius: '8px' }}>
                <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '15px' }}>Note: These dates are fetched from the database and cannot be modified here.</p>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <p><strong>PO Date:</strong> {poDetails.po_date}</p>
                  <p><strong>Start Date:</strong> {poDetails.start_date}</p>
                  <p><strong>End Date:</strong> {poDetails.end_date}</p>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '15px' }}>
                {['po_copy', 'po_annex', 'other'].map(type => (
                  <div key={type} style={{ border: '1px solid #E5E7EB', padding: '12px', borderRadius: '8px' }}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'capitalize' }}>{type === 'po_copy' ? 'Revised PO Copy' : type === 'po_annex' ? 'Revised PO Annex' : 'Other Attachment'}</label>
                    <input type="file" onChange={(e) => setAttachments(prev => ({ ...prev, [type]: e.target.files[0] }))} style={{ width: '100%' }} />
                    <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '4px' }}>Existing: {poDetails[type + '_path'] ? 'File Attached' : 'None'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
              <button onClick={prevStep} style={{ padding: '12px 24px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px' }}>Back</button>
              <button onClick={nextStep} style={{ flex: 1, padding: '12px 24px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600 }}>Next: Edit Line Items →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>3. Edit Line Items</h3>
              <p style={{ background: '#FFFBEB', padding: '4px 12px', borderRadius: '4px', border: '1px solid #FEF3C7', fontSize: '0.85rem' }}>Yellow columns are editable. Blue columns show revised results.</p>
            </div>
            
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.65rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                  <tr style={{ whiteSpace: 'nowrap' }}>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>SI no</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Ref No</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Item Details (Read-only)</th>
                    
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center' }}>Fetched Original</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center' }}>EDIT ENTRY</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'center' }}>REVISED AUTO CAL</th>
                    
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7' }}>REV. TOTAL</th>
                  </tr>
                  <tr style={{ whiteSpace: 'nowrap' }}>
                    <th style={{ background: '#F3F4F6' }}>S-Qty / Rate</th>
                    <th style={{ background: '#F3F4F6' }}>Sv-Qty / Rate</th>
                    <th style={{ background: '#F3F4F6' }}>GST S/Sv</th>
                    
                    <th style={{ background: '#FEF3C7' }}>Edit S-Qty</th>
                    <th style={{ background: '#FEF3C7' }}>Edit S-Rate</th>
                    <th style={{ background: '#FEF3C7' }}>Edit Sv-Qty</th>
                    
                    <th style={{ background: '#EFF6FF' }}>Rev S-Taxable</th>
                    <th style={{ background: '#EFF6FF' }}>Rev Sv-Taxable</th>
                    <th style={{ background: '#EFF6FF' }}>Rev Grand</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.ref_no || '-'}</td>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', maxWidth: '200px', whiteSpace: 'normal' }}>
                        <strong>{it.package_name || '-'}</strong> | {it.item_name}<br/>
                        <span style={{ fontSize: '0.6rem', color: '#6B7280' }}>{it.description}</span>
                      </td>
                      
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#F9FAFB', textAlign: 'right' }}>{it.supply_qty} @ {it.supply_rate}</td>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#F9FAFB', textAlign: 'right' }}>{it.service_qty} @ {it.service_rate}</td>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#F9FAFB', textAlign: 'center' }}>{it.supply_gst_rate}% / {it.service_gst_rate}%</td>
                      
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}><input type="number" placeholder={it.supply_qty} value={it.edit_supply_qty} onChange={e => updateItem(idx, 'edit_supply_qty', e.target.value)} style={{ width: '100%', border: 'none', padding: '6px', textAlign: 'right', background: 'transparent' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}><input type="number" placeholder={it.supply_rate} value={it.edit_supply_rate} onChange={e => updateItem(idx, 'edit_supply_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '6px', textAlign: 'right', background: 'transparent' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FFFBEB' }}><input type="number" placeholder={it.service_qty} value={it.edit_service_qty} onChange={e => updateItem(idx, 'edit_service_qty', e.target.value)} style={{ width: '100%', border: 'none', padding: '6px', textAlign: 'right', background: 'transparent' }} /></td>
                      
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'right' }}>₹{(it.rev_taxable_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'right' }}>₹{(it.rev_taxable_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'right', fontWeight: 600 }}>₹{(it.rev_total_invoice || 0).toLocaleString()}</td>
                      
                      <td style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'right', fontWeight: 700 }}>₹{(it.rev_total_invoice || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '32px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: 0 }}>Revised Subtotal</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>₹{items.reduce((s, i) => s + (i.rev_total_taxable || 0), 0).toLocaleString()}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6B7280', margin: 0 }}>Revised Grand Total</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981' }}>₹{items.reduce((s, i) => s + (i.rev_total_invoice || 0), 0).toLocaleString()}</p>
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
              <button onClick={prevStep} style={{ padding: '12px 24px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px' }}>Back</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '12px 24px', background: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Submitting Revision...' : '✓ Submit Revised PO'}</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
