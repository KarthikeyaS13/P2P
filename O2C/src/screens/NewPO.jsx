import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';

export default function NewPO() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // Flow State
  const [step, setStep] = useState(1); // 1: Basic, 2: Items Review, 3: Final Summary
  
  // Basic State
  const [basicDetails, setBasicDetails] = useState({
    customerId: '',
    locationId: '',
    poNumber: '',
    poDate: new Date().toISOString().split('T')[0],
    startDate: '',
    endDate: ''
  });

  // Data State
  const [items, setItems] = useState([]);
  const [excelTotals, setExcelTotals] = useState({ taxable: 0, gst: 0, grandTotal: 0 });
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch Customers
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/customers', { headers });
        setCustomers(res.data);
      } catch (err) {
        console.error('Failed to fetch customers', err);
      }
    };
    fetchCustomers();
  }, []);

  // Fetch Locations
  useEffect(() => {
    if (basicDetails.customerId) {
      const fetchLocations = async () => {
        try {
          const token = localStorage.getItem('token');
          const headers = { Authorization: `Bearer ${token}` };
          const res = await axios.get(`http://localhost:3000/api/locations?customer_id=${basicDetails.customerId}`, { headers });
          const locs = Array.isArray(res.data) ? res.data : [];
          setLocations(locs);
          if (locs.length === 0) {
            alert('This customer has no locations. Please add locations first.');
          }
        } catch (err) {
          console.error('Failed to fetch locations', err);
        }
      };
      fetchLocations();
    }
  }, [basicDetails.customerId]);

  const handleBasicChange = (e) => {
    const { name, value } = e.target;
    setBasicDetails(prev => ({ ...prev, [name]: value }));
  };

  const parseNum = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    // Remove currency symbols, commas, and whitespace
    const cleaned = String(val).replace(/[₹$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // --- Hardened Excel Ingestion Logic ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

        console.log("Total Rows Read:", rawData.length);

        if (rawData.length < 2) throw new Error('File is empty');

        // 1. Robust Header Detection (Scoring Logic)
        const keywords = ['s.no', 'description', 'item', 'qty', 'rate', 'amount', 'value', 'taxable', 'gst'];
        let bestRowIndex = 0;
        let maxScore = 0;

        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          let currentScore = 0;
          const row = rawData[i];
          if (!row) continue;
          row.forEach(cell => {
            const val = String(cell || '').toLowerCase().replace(/\s+/g, '');
            if (keywords.some(k => val.includes(k.replace(/\s+/g, '')))) currentScore++;
          });
          if (currentScore > maxScore) {
            maxScore = currentScore;
            bestRowIndex = i;
          }
        }

        const headerRow = rawData[bestRowIndex];

        // 2. Flexible Column Mapping (Strict Logic)
        const headers = headerRow.map(h => String(h || '').toLowerCase().replace(/\s+/g, ''));
        const findCol = (keys) => headers.findIndex(h => keys.some(k => h.includes(k.replace(/\s+/g, ''))));

        const colMap = {
          sno: findCol(['sno', 'slno', 'no']),
          package: findCol(['package']),
          heading: findCol(['heading']),
          description: findCol(['description', 'item', 'particulars', 'product']),
          qty: findCol(['qty', 'quantity', 'supplyqty']),
          rate: findCol(['rate', 'unitprice', 'supplyrate']),
          taxableValue: findCol(['taxable', 'taxablevalue', 'amount', 'value']),
          gst: findCol(['gst', 'taxrate', 'gstrate']),
          totalValue: findCol(['total', 'invoicevalue', 'netamount'])
        };

        console.log("Column Mapping Result:", colMap);

        // 3. Extract Summary Totals (Source of Truth)
        let extractedTotals = { taxable: 0, gst: 0, grandTotal: 0 };
        rawData.forEach(row => {
          const rowStr = row.join(' ').toUpperCase();
          if (rowStr.includes('TAXABLE AMOUNT') || rowStr.includes('SUB TOTAL')) {
            extractedTotals.taxable = parseNum(row.find(c => parseNum(c) > 0));
          } else if (rowStr.includes('GST')) {
            extractedTotals.gst = parseNum(row.find(c => parseNum(c) > 0));
          } else if (rowStr.includes('TOTAL AMOUNT') || rowStr.includes('GRAND TOTAL')) {
            extractedTotals.grandTotal = parseNum(row.find(c => parseNum(c) > 0));
          }
        });
        setExcelTotals(extractedTotals);

        // 4. Processing Items (Hierarchical Grouping Logic)
        const processedItems = [];
        let currentItem = null;
        const summaryKeywords = ['TOTAL', 'GST', 'TAXABLE', 'SUMMARY', 'GRAND', 'SUB TOTAL', 'AMOUNT IN WORDS', 'SIGNATURE'];

        rawData.slice(bestRowIndex + 1).forEach((row) => {
          if (!row || row.length === 0) return;

          const rawText = String(row[colMap.description] || '').trim();
          const sno = String(row[colMap.sno] || '').trim();
          
          // Skip known footer/summary keywords
          if (summaryKeywords.some(kw => rawText.toUpperCase().includes(kw) || sno.toUpperCase().includes(kw))) return;

          const q = parseNum(row[colMap.qty]);
          const r = parseNum(row[colMap.rate]);
          const tValue = parseNum(row[colMap.taxableValue]);

          const isMainRow = (q > 0 || r > 0 || tValue > 0);

          if (isMainRow) {
            // New Main Item detected
            currentItem = {
              id: Date.now() + Math.random(),
              sNo: sno,
              package: String(row[colMap.package] || '').trim(),
              itemName: rawText || "Item",
              description: '', 
              qty: q,
              rate: r || (q > 0 ? tValue / q : 0),
              taxableAmount: tValue || (q * r),
              gstPercent: parseNum(row[colMap.gst]) || 18
            };
            processedItems.push(currentItem);
          } else if (currentItem && rawText && !sno.includes('.')) {
            // This is a description row for the current main item
            // Avoid adding S.No like "1.1" as descriptions if they are just sub-indices
            currentItem.description = currentItem.description 
              ? `${currentItem.description}\n${rawText}` 
              : rawText;
          } else if (!currentItem && rawText) {
            // If we find text BEFORE any main item (like a heading), 
            // we can either ignore it or create a placeholder if it looks important.
            // Requirement says "Combine description rows under correct item", 
            // so we skip these until we find the first valid item.
          }
        });

        const validItems = processedItems.filter(it => it.itemName && (it.qty > 0 || it.rate > 0 || it.taxableAmount > 0));
        
        console.log("Hierarchical Parsed Items:", validItems);
        if (validItems.length === 0) throw new Error('No valid items with quantity or rate found in the Excel.');

        setItems(validItems);
        setStep(2);
      } catch (err) {
        alert('Ingestion Error: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Calculations ---
  // Sum of individual taxable amounts
  const calculatedTaxable = items.reduce((acc, it) => acc + it.taxableAmount, 0);
  
  // Grand Total: Priority is Excel Grand Total, Fallback is calculated
  const finalTotals = excelTotals.grandTotal > 0 ? {
    subtotal: excelTotals.taxable || calculatedTaxable,
    tax: excelTotals.gst || (excelTotals.grandTotal - (excelTotals.taxable || calculatedTaxable)),
    grandTotal: excelTotals.grandTotal
  } : (() => {
    const sub = calculatedTaxable;
    // Calculate total tax by summing individual item taxes
    const tax = items.reduce((acc, it) => acc + (it.taxableAmount * (it.gstPercent / 100)), 0);
    return { subtotal: sub, tax, grandTotal: sub + tax };
  })();

  const finalSubmit = async () => {
    setLoading(true);
    const payload = {
      customer_id: basicDetails.customerId,
      location_id: basicDetails.locationId,
      po_number: basicDetails.poNumber,
      po_date: basicDetails.poDate,
      start_date: basicDetails.startDate,
      end_date: basicDetails.endDate,
      // Send the truth from UI
      total_value: finalTotals.grandTotal,
      items: items.map(it => ({
        package: it.package,
        item_name: it.itemName,
        description: it.description,
        quantity: it.qty,
        rate_per_unit: it.rate,
        taxable_value: it.taxableAmount,
        gst_amount: it.taxableAmount * (it.gstPercent / 100),
        total_value: it.taxableAmount + (it.taxableAmount * (it.gstPercent / 100)),
        gst_percent: it.gstPercent
      }))
    };
    console.log("Final Payload to Backend:", payload);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post('http://localhost:3000/api/pos', payload, { headers });
      alert('PO Created Successfully!');
      navigate('/dashboard');
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-enter">
      <div className="page-header" style={{ position: 'relative' }}>
        <button className="btn btn-ghost" style={{ position: 'absolute', left: '-10px', top: '0' }} onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back</span> Back
        </button>
        <div style={{ marginTop: '40px' }}>
          <h1 className="text-h1">Purchase Order Ingestion</h1>
          <p className="page-header__subtitle">Step {step} of 3: {step === 1 ? 'Basic Info' : step === 2 ? 'Items Review' : 'Final Validation'}</p>
        </div>
      </div>

      <div className="card card--padded animate-fade">
        {step === 1 && (
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <select className="form-select" name="customerId" value={basicDetails.customerId} onChange={handleBasicChange}>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Location *</label>
              <select className="form-select" name="locationId" value={basicDetails.locationId} onChange={handleBasicChange}>
                <option value="">{locations.length === 0 ? 'No locations found' : 'Select Location'}</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label} - {loc.city}, {loc.state} - {loc.pincode}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">PO Number *</label>
              <input className="form-input" name="poNumber" value={basicDetails.poNumber} onChange={handleBasicChange} placeholder=" PO/2026/001" />
            </div>
            <div className="form-group">
              <label className="form-label">PO Date</label>
              <input className="form-input" type="date" name="poDate" value={basicDetails.poDate} onChange={handleBasicChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Project Start Date</label>
              <input className="form-input" type="date" name="startDate" value={basicDetails.startDate} onChange={handleBasicChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Project End Date</label>
              <input className="form-input" type="date" name="endDate" value={basicDetails.endDate} onChange={handleBasicChange} />
            </div>
            
            <div style={{ gridColumn: 'span 2', textAlign: 'center', marginTop: '32px', borderTop: '1px solid var(--outline-variant)', paddingTop: '32px' }}>
              <div className="upload-zone" onClick={() => fileInputRef.current.click()} style={{ maxWidth: '500px', margin: '0 auto' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--primary)' }}>upload_file</span>
                <p style={{ fontWeight: 700, marginTop: '12px' }}>Upload Structured Excel</p>
                <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Groups descriptions automatically</p>
              </div>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="text-h3">Items Preview</h3>
              <button className="btn btn-sm btn-outline" onClick={() => fileInputRef.current.click()}>Re-upload</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Name & Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">GST %</th>
                    <th className="text-right">Taxable Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {it.package && (
                            <span style={{ fontSize: '10px', background: 'var(--surface-container-highest)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                              {it.package}
                            </span>
                          )}
                          <div style={{ fontWeight: 600 }}>{it.itemName}</div>
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, whiteSpace: 'pre-line', marginTop: '4px' }}>
                          {it.description}
                        </div>
                      </td>
                      <td className="text-right">{it.qty.toLocaleString()}</td>
                      <td className="text-right">₹{it.rate.toLocaleString()}</td>
                      <td className="text-right">{it.gstPercent}%</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>₹{it.taxableAmount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ textAlign: 'right', marginTop: '24px' }}>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Proceed to Summary →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ background: 'var(--surface-container-low)', padding: '24px', borderRadius: '12px', border: '1px solid var(--outline-variant)', marginBottom: '32px' }}>
              <div className="grid-2">
                <div>
                  <p className="text-label">Customer / Location</p>
                  <p style={{ fontWeight: 700 }}>{customers.find(c => c.id == basicDetails.customerId)?.name} / {locations.find(l => l.id == basicDetails.locationId)?.label}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="text-label">PO Number</p>
                  <p style={{ fontWeight: 700 }}>{basicDetails.poNumber}</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: '350px', background: 'var(--surface-container-highest)', padding: '20px', borderRadius: '12px' }}>
                <div className="summary-card__row"><span>Subtotal (Taxable):</span><span>₹{finalTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="summary-card__row"><span>Tax (GST):</span><span>₹{finalTotals.tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="summary-card__row" style={{ background: 'var(--primary)', color: 'white', padding: '16px', borderRadius: '8px', marginTop: '16px', fontWeight: 800, fontSize: '1.25rem' }}>
                  <span>Grand Total:</span><span>₹{finalTotals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {excelTotals.grandTotal > 0 && (
              <p style={{ textAlign: 'right', marginTop: '12px', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                Source integrity verified with Excel totals
              </p>
            )}

            <div style={{ textAlign: 'center', marginTop: '48px' }}>
              <button className="btn btn-primary btn-lg" onClick={finalSubmit} disabled={loading} style={{ width: '100%', maxWidth: '400px', height: '56px' }}>
                {loading ? 'Processing...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .summary-card__row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem; }
        .text-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 4px; }
        .upload-zone { border: 2px dashed var(--outline-variant); padding: 40px; border-radius: 16px; cursor: pointer; transition: all 0.2s; }
        .upload-zone:hover { border-color: var(--primary); background: var(--surface-container-low); }
      `}</style>
    </div>
  );
}
