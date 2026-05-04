import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';

export default function NewNTPO() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // STATE
  const [step, setStep] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [hasOriginalPO, setHasOriginalPO] = useState(null);
  const [originalPOs, setOriginalPOs] = useState([]);
  const [selectedOriginalPO, setSelectedOriginalPO] = useState(null);
  const [linkedPoId, setLinkedPoId] = useState(null);
  const [poNumber, setPONumber] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const [poDate, setPODate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [entryMethod, setEntryMethod] = useState(null);
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // STEP 1: Load customers on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios.get('http://localhost:3000/api/customers', { headers })
      .then(r => setCustomers(Array.isArray(r.data) ? r.data : []))
      .catch(err => console.error(err));
  }, []);

  // STEP 1: Handle customer change
  const handleCustomerChange = (e) => {
    const val = e.target.value;
    setSelectedCustomer(val);
    setSelectedLocation('');
    setLocations([]);
    
    if (val) {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      axios.get(`http://localhost:3000/api/locations?customer_id=${val}`, { headers })
        .then(r => {
          const locs = Array.isArray(r.data) ? r.data : [];
          setLocations(locs);
          if (locs.length === 0) {
            alert('This customer has no locations. Please add locations first.');
          }
        })
        .catch(err => console.error(err));
    }
  };

  // STEP 2: Fetch original POs if user selects "Yes"
  const handleOriginalPoOption = (hasIt) => {
    setHasOriginalPO(hasIt);
    if (hasIt) {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      axios.get('http://localhost:3000/api/pos?type=original', { headers })
        .then(r => setOriginalPOs(Array.isArray(r.data) ? r.data : []))
        .catch(err => console.error(err));
    } else {
      setPONumber('');
      setIsTemporary(false);
      setLinkedPoId(null);
    }
  };

  const handleOriginalPOSelect = (e) => {
    const poId = e.target.value;
    const po = originalPOs.find(p => p.id.toString() === poId);
    if (po) {
      setSelectedOriginalPO(po);
      setLinkedPoId(po.id);
      setPODate(po.po_date || '');
      setStartDate(po.start_date || '');
      setEndDate(po.end_date || '');
      const tempNum = (po.po_number || po.order_id) + '-NT';
      setPONumber(tempNum);
      setIsTemporary(true);
    } else {
      setSelectedOriginalPO(null);
      setLinkedPoId(null);
      setPONumber('');
      setIsTemporary(false);
    }
  };

  // STEP 4: Excel Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (data.length === 0) return;
        
        // Intelligent heuristic to find the header row
        let headerIdx = 0;
        let maxScore = -1;
        for (let i = 0; i < Math.min(data.length, 20); i++) {
          const row = data[i] || [];
          const s = Array.from(row).map(c => String(c || '').toLowerCase()).join(' ');
          let sc = 0;
          if (s.includes('s.no') || s.includes('sl') || s.includes('serial')) sc += 2;
          if (s.includes('description') || s.includes('item') || s.includes('particulars')) sc += 2;
          if (s.includes('qty') || s.includes('quantity')) sc += 2;
          if (s.includes('rate') || s.includes('price') || s.includes('unit cost')) sc += 2;
          if (s.includes('amount') || s.includes('value') || s.includes('total')) sc += 2;
          if (s.includes('gst') || s.includes('tax')) sc += 2;
          if (s.includes('package')) sc += 2;
          sc += row.filter(c => c !== undefined && c !== '').length * 0.5;
          if (sc > maxScore) { maxScore = sc; headerIdx = i; }
        }

        const headers = Array.from(data[headerIdx] || []).map(h => String(h || '').toLowerCase());
        const pkgCol = headers.findIndex(h => h && h.includes('package'));
        const descCol = headers.findIndex(h => h && (h.includes('desc') || h.includes('item') || h.includes('particulars')));
        const uomCol = headers.findIndex(h => h && (h.includes('uom') || h.includes('unit')));
        const qtyCol = headers.findIndex(h => h && (h.includes('qty') || h.includes('quantity')));
        const rateCol = headers.findIndex(h => h && (h.includes('rate') || h.includes('price') || h.includes('unit cost')));
        const gstCol = headers.findIndex(h => h && (h.includes('gst') || h.includes('tax')));

        const parsedItems = [];
        let current = null;
        
        for (let i = headerIdx + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0) continue;
          
          const qty = parseFloat(row[qtyCol]) || 0;
          const rate = parseFloat(row[rateCol]) || 0;
          const text = String(row[descCol] || '').trim();
          
          if (qty > 0 || rate > 0) {
            if (current) parsedItems.push(current);
            current = {
              package_name: pkgCol >= 0 ? row[pkgCol] || '' : '',
              item_name: text || 'Item',
              description: '',
              uom: uomCol >= 0 ? row[uomCol] || '' : '',
              quantity: qty,
              rate: rate,
              gst_percent: gstCol >= 0 ? parseFloat(row[gstCol]) || 18 : 18,
              taxable: qty * rate,
              gst_amt: (qty * rate) * ((gstCol >= 0 ? parseFloat(row[gstCol]) || 18 : 18) / 100),
              total: (qty * rate) * (1 + (gstCol >= 0 ? parseFloat(row[gstCol]) || 18 : 18) / 100)
            };
          } else if (text && current) {
            current.description += (current.description ? '\n' : '') + text;
          }
        }
        if (current) parsedItems.push(current);
        setItems(parsedItems);
        setEntryMethod('upload');
        setStep(5);
      } catch (err) {
        console.error(err);
        alert('Failed to parse Excel file');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleManualEntry = () => {
    setItems([{
      package_name: '', item_name: '', description: '',
      uom: '', quantity: 0, rate: 0, gst_percent: 18,
      taxable: 0, gst_amt: 0, total: 0
    }]);
    setEntryMethod('manual');
    setStep(5);
  };

  // STEP 5: Edit Items
  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    
    // Auto calculate if numeric fields change
    if (['quantity', 'rate', 'gst_percent'].includes(field)) {
      const qty = parseFloat(updated[index].quantity) || 0;
      const rate = parseFloat(updated[index].rate) || 0;
      const gst = parseFloat(updated[index].gst_percent) || 0;
      
      updated[index].taxable = qty * rate;
      updated[index].gst_amt = updated[index].taxable * (gst / 100);
      updated[index].total = updated[index].taxable + updated[index].gst_amt;
    }
    
    setItems(updated);
  };

  const addRow = () => {
    setItems([...items, {
      package_name: '', item_name: '', description: '',
      uom: '', quantity: 0, rate: 0, gst_percent: 18,
      taxable: 0, gst_amt: 0, total: 0
    }]);
  };

  const deleteRow = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // STEP 6: Submit
  const subtotal = items.reduce((s, i) => s + (i.taxable || 0), 0);
  const gstTotal = items.reduce((s, i) => s + (i.gst_amt || 0), 0);
  const grandTotal = subtotal + gstTotal;

  const handleSubmit = () => {
    if (!poNumber) { alert('PO Number required'); return; }
    if (items.length === 0) { alert('Add at least one item'); return; }
    
    const validItems = items.filter(i => i.item_name && (parseFloat(i.quantity) > 0 || parseFloat(i.rate) > 0));
    if (validItems.length === 0) { 
      alert('Add valid items with quantity and rate'); return; 
    }

    setSubmitting(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const payload = {
      customer_id: parseInt(selectedCustomer),
      location_id: parseInt(selectedLocation),
      po_number: poNumber,
      po_date: poDate || new Date().toISOString().split('T')[0],
      start_date: startDate || null,
      end_date: endDate || null,
      is_nt_po: 1,
      is_temporary: isTemporary ? 1 : 0,
      linked_po_id: linkedPoId || null,
      subtotal: subtotal,
      gst_total: gstTotal,
      grand_total: grandTotal,
      items: validItems.map((i, idx) => ({
        package_name: i.package_name || '',
        item_name: i.item_name || 'Item ' + (idx + 1),
        description: i.description || '',
        uom: i.uom || '',
        quantity: parseFloat(i.quantity) || 0,
        rate_per_unit: parseFloat(i.rate) || 0,
        gst_percent: parseFloat(i.gst_percent) || 0,
        taxable_value: parseFloat(i.taxable) || 0,
        gst_amount: parseFloat(i.gst_amt) || 0,
        total_value: parseFloat(i.total) || 0
      }))
    };

    axios.post('http://localhost:3000/api/pos', payload, { headers })
      .then(res => {
        alert('NT PO created: ' + res.data.order_id);
        navigate('/dashboard');
      })
      .catch(err => {
        alert(err.response?.data?.error || 'Failed to create NT PO');
      })
      .finally(() => setSubmitting(false));
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => {
    if (step === 1) navigate('/dashboard');
    else setStep(s => s - 1);
  };

  const steps = [
    { id: 1, title: 'Customer' },
    { id: 2, title: 'Original PO' },
    { id: 3, title: 'Dates' },
    { id: 4, title: 'Upload' },
    { id: 5, title: 'Items' },
    { id: 6, title: 'Confirm' }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Step Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'white', padding: '15px 20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {steps.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', opacity: step >= s.id ? 1 : 0.4 }}>
            <div style={{ 
              width: '30px', height: '30px', borderRadius: '50%', 
              background: step === s.id ? '#3B82F6' : step > s.id ? '#10B981' : '#E5E7EB',
              color: step >= s.id ? 'white' : '#6B7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold',
              marginRight: '8px'
            }}>
              {step > s.id ? '✓' : s.id}
            </div>
            <span style={{ fontWeight: step === s.id ? 600 : 400 }}>{s.title}</span>
            {s.id < 6 && <div style={{ height: '2px', width: '40px', background: '#E5E7EB', margin: '0 15px' }} />}
          </div>
        ))}
      </div>

      <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        
        {/* Navigation Buttons top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <button onClick={prevStep} style={{ padding: '8px 16px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer' }}>
            ← Back
          </button>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <h3>Select Customer & Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px' }}>
              <label>Customer</label>
              <select value={selectedCustomer} onChange={handleCustomerChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }}>
                <option value="">-- Select Customer --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <label>Location</label>
              <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} disabled={!selectedCustomer}>
                <option value="">{locations.length === 0 ? '-- No locations found --' : '-- Select Location --'}</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label} - {loc.city}, {loc.state} - {loc.pincode}
                  </option>
                ))}
              </select>

              <button 
                onClick={nextStep} 
                disabled={!selectedCustomer || !selectedLocation}
                style={{ marginTop: '20px', padding: '10px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: (!selectedCustomer || !selectedLocation) ? 'not-allowed' : 'pointer', opacity: (!selectedCustomer || !selectedLocation) ? 0.5 : 1 }}
              >
                Next Step →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h3>Original PO Details</h3>
            <p>Do you have the original PO from the customer?</p>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <button 
                onClick={() => handleOriginalPoOption(true)}
                style={{ flex: 1, padding: '20px', background: hasOriginalPO === true ? '#EFF6FF' : 'white', border: `2px solid ${hasOriginalPO === true ? '#3B82F6' : '#E5E7EB'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 500 }}
              >
                Yes, I have original PO
              </button>
              <button 
                onClick={() => handleOriginalPoOption(false)}
                style={{ flex: 1, padding: '20px', background: hasOriginalPO === false ? '#EFF6FF' : 'white', border: `2px solid ${hasOriginalPO === false ? '#3B82F6' : '#E5E7EB'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 500 }}
              >
                No, create internal PO
              </button>
            </div>

            {hasOriginalPO === true && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '500px', marginTop: '20px' }}>
                <label>Select Original PO</label>
                <select value={linkedPoId || ''} onChange={handleOriginalPOSelect} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }}>
                  <option value="">-- Select Original PO --</option>
                  {originalPOs.map(po => (
                    <option key={po.id} value={po.id}>{po.po_number || po.order_id} - {po.customer_name}</option>
                  ))}
                </select>

                {linkedPoId && (
                  <div style={{ background: '#D1FAE5', padding: '12px 16px', borderRadius: '6px', border: '1px solid #6EE7B7', marginTop: '10px' }}>
                    <strong>Generated NT PO:</strong> {poNumber}
                  </div>
                )}
              </div>
            )}

            {hasOriginalPO === false && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px', marginTop: '20px' }}>
                <label>Enter Internal NT PO Number</label>
                <input 
                  type="text" 
                  value={poNumber} 
                  onChange={(e) => setPONumber(e.target.value)} 
                  placeholder="e.g. INT-PO-001"
                  style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                />
              </div>
            )}

            <button 
              onClick={nextStep} 
              disabled={hasOriginalPO === null || (hasOriginalPO === true && !linkedPoId) || (hasOriginalPO === false && !poNumber)}
              style={{ marginTop: '30px', padding: '10px 20px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Next Step →
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <h3>Dates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px' }}>
              <label>PO Date</label>
              <input type="date" value={poDate} onChange={(e) => setPODate(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
              
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
              
              <label>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />

              <button onClick={nextStep} style={{ marginTop: '20px', padding: '10px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Next Step →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div>
            <h3>Data Entry Method</h3>
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <div style={{ flex: 1, padding: '30px', border: '2px dashed #D1D5DB', borderRadius: '8px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 15px' }}>Upload Excel</h4>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ padding: '10px' }} />
                <p style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '10px' }}>Auto-extracts items based on column names (Qty, Rate, Description, etc.)</p>
              </div>
              <div style={{ flex: 1, padding: '30px', border: '2px solid #E5E7EB', borderRadius: '8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <h4 style={{ margin: '0 0 15px' }}>Enter Manually</h4>
                <button onClick={handleManualEntry} style={{ padding: '10px 20px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Start Manual Entry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Line Items</h3>
              <button onClick={addRow} style={{ padding: '8px 16px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
                + Add Row
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                <thead style={{ background: '#F9FAFB' }}>
                  <tr>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB' }}>#</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB' }}>Package</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB' }}>Item Name</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB' }}>Description</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>UOM</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>GST%</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>GST</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid #E5E7EB' }}>Del</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '8px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px' }}>
                        <input type="text" value={it.package_name} onChange={(e) => updateItem(idx, 'package_name', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="text" value={it.item_name} onChange={(e) => updateItem(idx, 'item_name', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="text" value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="text" value={it.uom} onChange={(e) => updateItem(idx, 'uom', e.target.value)} style={{ width: '60px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="number" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} style={{ width: '80px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="number" value={it.rate} onChange={(e) => updateItem(idx, 'rate', e.target.value)} style={{ width: '100px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="number" value={it.gst_percent} onChange={(e) => updateItem(idx, 'gst_percent', e.target.value)} style={{ width: '60px', padding: '6px', border: '1px solid #D1D5DB', borderRadius: '4px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', minWidth: '100px' }}>{it.taxable?.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', minWidth: '80px' }}>{it.gst_amt?.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', minWidth: '100px', fontWeight: 600 }}>{it.total?.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button onClick={() => deleteRow(idx)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px' }}>X</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={nextStep} style={{ marginTop: '20px', padding: '10px 20px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Review & Submit →
            </button>
          </div>
        )}

        {/* STEP 6 */}
        {step === 6 && (
          <div>
            <h3>Summary</h3>
            <div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: '0 0 5px' }}><strong>PO Number:</strong> {poNumber}</p>
                <p style={{ margin: '0 0 5px' }}><strong>Customer ID:</strong> {selectedCustomer}</p>
                <p style={{ margin: 0 }}><strong>Items Count:</strong> {items.length}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 5px' }}><strong>Subtotal (Taxable):</strong> ₹{subtotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
                <p style={{ margin: '0 0 5px' }}><strong>GST Total:</strong> ₹{gstTotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
                <p style={{ margin: 0, fontSize: '1.2rem', color: '#111827' }}><strong>Grand Total:</strong> ₹{grandTotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => setStep(5)} style={{ padding: '12px 24px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                ← Edit Items
              </button>
              <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 24px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, flex: 1, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Creating PO...' : '✓ Confirm & Create NT PO'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
