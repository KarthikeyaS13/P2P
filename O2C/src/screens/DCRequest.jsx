import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function DCRequest() {
  const navigate = useNavigate();
  const [approvedPOs, setApprovedPOs] = useState([]);
  const [selectedPOId, setSelectedPOId] = useState('');
  const [locationDetails, setLocationDetails] = useState({ name: '', id: '' });
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [transporter, setTransporter] = useState('');
  const [instructions, setInstructions] = useState('');

  const [items, setItems] = useState([]);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [logistics, setLogistics] = useState({ driver_name: '', driver_phone: '', vehicle_no: '' });
  const [dcNumbering, setDcNumbering] = useState({ type: 'auto', manualValue: '' });
  const [autoDCNumber, setAutoDCNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [proofFile, setProofFile] = useState(null);

  const [currentPOData, setCurrentPOData] = useState(null);
  const [masterAddresses, setMasterAddresses] = useState([]);
  const [dispatchSource, setDispatchSource] = useState('manual');
  const [sourceAddress, setSourceAddress] = useState({ line1: '', line2: '', pin: '', landmark: '' });

  useEffect(() => {
    const fetchApprovedPOs = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:5000/api/dc-requests/pos', { headers });
        setApprovedPOs(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPOs(false);
      }
    };

    const fetchMasterAddresses = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const res = await axios.get('http://localhost:5000/api/master-addresses', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMasterAddresses(res.data);
        // Default to the first address marked as default if it exists
        const def = res.data.find(a => a.is_default);
        if (def) {
          setDispatchSource(def.id.toString());
          setSourceAddress({
            line1: def.addr_line1 || '',
            line2: def.addr_line2 || '',
            pin: def.pincode || '',
            landmark: def.landmark || ''
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchApprovedPOs();
    fetchMasterAddresses();
  }, []);

  useEffect(() => {
    const fetchNextDC = async () => {
      if (!selectedPOId) return;
      const po = approvedPOs.find(p => String(p.id) === String(selectedPOId));
      if (!po || !po.customer_id) return; // Fallback: we need customer_id which might not be in the list

      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        // We need to make sure we have customer_id. Let's update the PO list to include it.
        const res = await axios.get(`http://localhost:5000/api/next-dc-number/${po.customer_id || po.id}`, { headers });
        setAutoDCNumber(res.data.nextDC);
      } catch (err) {
        console.error('Failed to fetch next DC number', err);
      }
    };
    fetchNextDC();
  }, [selectedPOId, approvedPOs]);

  const handlePOChange = async (e) => {
    const poId = e.target.value;
    setSelectedPOId(poId);
    setItems([]);
    setLocationDetails({ name: '', id: '' });

    if (!poId) return;

    setLoadingItems(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:5000/api/pos/${poId}`, { headers });
      const po = res.data;
      setLocationDetails({
        name: po.location_name
          ? [
            po.location_name,
            po.location_address,
            po.location_address2,
            po.location_address3,
            po.location_city,
            po.location_state ? `${po.location_state} - ${po.location_pincode || ''}` : po.location_pincode
          ].filter(Boolean).join(', ')
          : (po.location_city || 'N/A'),
        id: po.location_id || ''
      });

      const newItems = (po.items || []).map(item => {
        const qty = item.supply_qty || 0;
        const delivered = item.qty_delivered || 0;
        const available = Math.max(0, qty - delivered);
        return {
          ...item,
          available,
          requestQty: '',
          selected: available > 0
        };
      });
      // Filter out items that are fully delivered or have no supply qty
      setItems(newItems.filter(it => it.supply_qty > 0 && it.available > 0));
      setCurrentPOData(po);

      // If source is customer, update address
      if (dispatchSource === 'customer') {
        setSourceAddress({
          line1: po.customer_addr1 || '',
          line2: po.customer_addr2 || po.customer_city || '',
          pin: po.customer_pincode || '',
          landmark: ''
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleItemSelect = (index, checked) => {
    const newItems = [...items];
    newItems[index].selected = checked;
    setItems(newItems);
  };

  const handleQtyChange = (index, val) => {
    const newItems = [...items];
    const it = newItems[index];

    if (val === '') {
      it.requestQty = '';
    } else {
      let num = parseFloat(val);
      if (isNaN(num)) num = 0;
      if (num < 0) num = 0;

      const max = it.available;
      if (num > max && num > 0) {
        Swal.fire({ icon: 'error', title: 'Limit Exceeded', text: 'Sales team has to update the PO' });
        it.requestQty = '';
      } else {
        it.requestQty = num;
      }
    }

    const qtyForCalc = Number(it.requestQty) || 0;

    // Auto calculations
    const taxable = qtyForCalc * (it.supply_rate || 0);
    const gst = taxable * ((it.supply_gst_rate || 0) / 100);
    it.auto_cal = taxable;
    it.supply_tax_value = taxable;
    it.supply_gst_value = gst;
    it.total_supply_value = taxable + gst;

    setItems(newItems);
  };

  const handleSourceChange = (val) => {
    setDispatchSource(val);
    if (val === 'manual') {
      setSourceAddress({ line1: '', line2: '', pin: '', landmark: '' });
    } else {
      const addr = masterAddresses.find(a => a.id.toString() === val);
      if (addr) {
        setSourceAddress({
          line1: addr.addr_line1 || '',
          line2: addr.addr_line2 || '',
          pin: addr.pincode || '',
          landmark: addr.landmark || ''
        });
      }
    }
  };

  const submitDCRequest = async () => {
    const selectedItems = items
      .filter(i => i.requestQty && Number(i.requestQty) > 0)
      .map(i => ({ line_item_id: i.id, qty: i.requestQty }));

    if (!selectedPOId || selectedItems.length === 0) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.append('po_id', selectedPOId);
    formData.append('location_id', locationDetails.id);
    formData.append('dispatch_date', dispatchDate);
    formData.append('transporter', transporter);
    formData.append('special_instructions', instructions);
    formData.append('items', JSON.stringify(selectedItems));
    formData.append('vehicle_no', logistics.vehicle_no);
    formData.append('driver_name', logistics.driver_name);
    formData.append('driver_phone', logistics.driver_phone);
    formData.append('dispatch_from_line1', sourceAddress.line1);
    formData.append('dispatch_from_line2', sourceAddress.line2);
    formData.append('dispatch_from_pin', sourceAddress.pin);
    formData.append('dispatch_from_landmark', sourceAddress.landmark);
    formData.append('requested_dc_number', dcNumbering.type === 'auto' ? autoDCNumber : dcNumbering.manualValue);
    formData.append('is_manual_dc', dcNumbering.type === 'manual');
    formData.append('logistics_remarks', remarks);
    if (proofFile) {
      formData.append('proof', proofFile);
    }

    try {
      const token = sessionStorage.getItem('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      };
      const res = await axios.post('http://localhost:5000/api/dc-requests', formData, { headers });

      const data = res.data;
      Swal.fire({ icon: 'success', title: 'Success', text: `DC Request ${data.dc_request} submitted successfully!`, timer: 2000, showConfirmButton: false });
      navigate('/dashboard');

      // Reset form
      setSelectedPOId('');
      setItems([]);
      setTransporter('');
      setInstructions('');
      setLocationDetails({ name: '', id: '' });

    } catch (err) {
      console.error('ERROR SUBMITTING DC REQUEST:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to submit DC Request';
      Swal.fire({ icon: 'error', title: 'Error', text: 'Error: ' + msg });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedForSummary = items.filter(i => i.selected && i.requestQty > 0);
  const totalValue = selectedForSummary.reduce((acc, item) => acc + ((item.supply_rate || 0) * item.requestQty), 0);

  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="screen-enter">
      <div className="page-header">
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
            <h1 className="text-h1 page-header__title">Delivery Challan Request</h1>
            <p className="page-header__subtitle">Select items from an approved PO to initiate fulfillment.</p>
          </div>
        </div>
      </div>


      {/* PO Selection & Delivery Details Card */}
      <div className="card card--padded animate-fade" style={{ background: 'white', marginBottom: '24px', border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '20px' }}>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Source Purchase Order</label>
            <select className="form-select" value={selectedPOId} onChange={handlePOChange} style={{ height: '42px', fontSize: '14px' }}>
              <option value="">
                {loadingPOs ? 'Loading approved POs...' : approvedPOs.length === 0 ? 'No approved POs available' : '-- Select a Purchase Order --'}
              </option>
              {approvedPOs.map(o => (
                <option key={o.id} value={o.id}>{o.po} — {o.customer}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Delivery Location</label>
            <input className="form-input" type="text" readOnly value={locationDetails.name} placeholder="Select PO to see location" style={{ height: '42px', fontSize: '14px', background: '#F9FAFB' }} />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Requested Dispatch Date</label>
            <div className="date-picker-container">
              <DatePicker
                selected={dispatchDate ? new Date(dispatchDate) : null}
                onChange={(date) => setDispatchDate(date ? date.toISOString().split('T')[0] : '')}
                dateFormat="dd/MM/yyyy"
                className="form-input"
                placeholderText="DD/MM/YYYY"
              />
              <span className="material-symbols-outlined calendar-icon">calendar_today</span>
            </div>
          </div>
        </div>
      </div>


      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginBottom: '24px' }}>
        <div className="card card--padded animate-fade" style={{ background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className="text-h3">Select Items for Dispatch</h3>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '12px', maxHeight: '650px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ whiteSpace: 'nowrap' }}>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Sl no</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Ref No</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Package</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Heading</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Sub Heading</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Item Name</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Description</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>UOM</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Supply QTY</th>
                  <th style={{ padding: '12px 8px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>Already Despatched</th>
                  <th style={{ padding: '12px 8px', color: '#059669', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', background: '#ECFDF5' }}>Available Qty</th>
                  <th style={{ padding: '12px 8px', color: '#1D4ED8', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', background: '#EFF6FF' }}>New DC Qty</th>
                </tr>
              </thead>
              <tbody>
                {!selectedPOId ? (
                  <tr><td colSpan="12" style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Please select a Purchase Order to view items</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan="12" style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>No supply items found in this PO</td></tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={it.id || idx} style={{ borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }}>
                      <td style={{ padding: '10px 8px', color: '#6B7280' }}>{it.line_number || idx + 1}</td>
                      <td style={{ padding: '10px 8px' }}>{it.ref_no || '-'}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{it.package_name || '-'}</td>
                      <td style={{ padding: '10px 8px' }}>{it.heading || '-'}</td>
                      <td style={{ padding: '10px 8px' }}>{it.sub_heading || '-'}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{it.item_name === 'Item' ? '' : it.item_name}</td>
                      <td
                        style={{
                          padding: '10px 8px',
                          color: '#4B5563',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                        }}
                        onClick={() => Swal.fire({ icon: 'info', title: 'Description', text: it.description || 'No description available' })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description || '-'}</span>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary)', opacity: 0.6 }}>open_in_new</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>{it.uom || '-'}</td>
                      <td style={{ padding: '10px 8px' }}>{it.supply_qty}</td>
                      <td style={{ padding: '10px 8px', color: '#6B7280' }}>{it.qty_delivered || 0}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: '#059669', background: '#F0FDF4' }}>{it.available}</td>
                      <td style={{ padding: '10px 8px', background: '#EFF6FF' }}>
                        <input
                          type="number"
                          className="form-input"
                          value={it.requestQty}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          style={{ width: '80px', padding: '4px 8px', fontSize: '14px', textAlign: 'center', border: '1px solid #BFDBFE' }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logistics & DC Configuration moved here */}
        <div className="card card--padded animate-fade" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
          <h3 className="text-h3" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>local_shipping</span>
            Logistics & DC Configuration
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Vehicle Number</label>
              <input
                className="form-input"
                placeholder="e.g. TS 09 EX 1234"
                value={logistics.vehicle_no}
                onChange={e => setLogistics({ ...logistics, vehicle_no: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Driver Name</label>
              <input
                className="form-input"
                placeholder="Enter driver name"
                value={logistics.driver_name}
                onChange={e => setLogistics({ ...logistics, driver_name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Driver Phone</label>
              <input
                className="form-input"
                placeholder="10-digit number"
                value={logistics.driver_phone}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setLogistics({ ...logistics, driver_phone: val });
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '24px', padding: '20px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Dispatch Proof (Photo)</label>
              <div
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '8px',
                  padding: '12px',
                  textAlign: 'center',
                  background: '#F8FAFC',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onClick={() => document.getElementById('dc-proof-upload').click()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '24px', color: '#64748B' }}>
                  {proofFile ? 'check_circle' : 'add_a_photo'}
                </span>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  {proofFile ? proofFile.name : 'Click to upload proof'}
                </div>
                <input
                  id="dc-proof-upload"
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={e => setProofFile(e.target.files[0])}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Logistics Remarks</label>
              <textarea
                className="form-input"
                placeholder="Add any specific delivery or transport notes..."
                rows={2}
                style={{ resize: 'none', fontSize: '13px' }}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
              ></textarea>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '40px' }}>
            <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>Official DC Number</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                    <input type="radio" name="dc_type" checked={dcNumbering.type === 'auto'} onChange={() => setDcNumbering({ ...dcNumbering, type: 'auto' })} /> Auto
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                    <input type="radio" name="dc_type" checked={dcNumbering.type === 'manual'} onChange={() => setDcNumbering({ ...dcNumbering, type: 'manual' })} /> Manual
                  </label>
                </div>
              </div>

              {dcNumbering.type === 'auto' ? (
                <div style={{ padding: '10px 12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '4px', fontWeight: 700, color: 'var(--primary)', fontSize: '14px' }}>
                  {autoDCNumber || 'Loading next number...'}
                </div>
              ) : (
                <input
                  className="form-input"
                  style={{ borderColor: 'var(--primary)' }}
                  placeholder="Enter manual DC number (e.g. DC/2026/001)"
                  value={dcNumbering.manualValue}
                  onChange={e => setDcNumbering({ ...dcNumbering, manualValue: e.target.value })}
                />
              )}
              <p style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
                {dcNumbering.type === 'auto' ? '' : 'Attach your internal/official DC number to this request.'}
              </p>
            </div>

            <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label className="form-label" style={{ color: 'var(--secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>Dispatch Source</label>
                <select 
                  className="form-select" 
                  value={dispatchSource} 
                  onChange={(e) => handleSourceChange(e.target.value)}
                  style={{ width: '180px', height: '30px', fontSize: '12px', padding: '0 8px' }}
                >
                  <option value="manual">Manual Entry</option>
                  {masterAddresses.map(addr => (
                    <option key={addr.id} value={addr.id.toString()}>{addr.name}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                <input 
                  className="form-input" 
                  placeholder="Addr Line 1" 
                  style={{ fontSize: '12px' }} 
                  value={sourceAddress.line1} 
                  onChange={e => setSourceAddress({ ...sourceAddress, line1: e.target.value })}
                  readOnly={dispatchSource !== 'manual'}
                />
                <input 
                  className="form-input" 
                  placeholder="Addr Line 2" 
                  style={{ fontSize: '12px' }} 
                  value={sourceAddress.line2} 
                  onChange={e => setSourceAddress({ ...sourceAddress, line2: e.target.value })}
                  readOnly={dispatchSource !== 'manual'}
                />
                <input 
                  className="form-input" 
                  placeholder="Pincode" 
                  style={{ fontSize: '12px' }} 
                  value={sourceAddress.pin} 
                  onChange={e => setSourceAddress({ ...sourceAddress, pin: e.target.value })}
                  readOnly={dispatchSource !== 'manual'}
                />
                <input 
                  className="form-input" 
                  placeholder="Landmark" 
                  style={{ fontSize: '12px' }} 
                  value={sourceAddress.landmark} 
                  onChange={e => setSourceAddress({ ...sourceAddress, landmark: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <div className="summary-card" style={{ width: '400px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '20px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Dispatch Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.7)' }}>
                <span>Items Selected for Dispatch</span>
                <span style={{ fontWeight: 600, color: 'white' }}>{selectedForSummary.length}</span>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '20px', background: '#10B981', border: 'none', padding: '16px', fontSize: '1rem', fontWeight: 700 }}
                disabled={selectedForSummary.length === 0 || submitting}
                onClick={() => setShowReview(true)}
              >
                <span className="material-symbols-outlined">visibility</span>
                {submitting ? 'Processing...' : 'Review Request'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description Popup */}
      {expandedDesc && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setExpandedDesc(null)}
        >
          <div
            style={{
              background: 'white',
              width: '500px',
              padding: '24px',
              borderRadius: '8px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
              border: '1px solid #E5E7EB'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '12px', textTransform: 'uppercase' }}>Full Description</span>
              <button className="btn-ghost" onClick={() => setExpandedDesc(null)} style={{ padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div style={{
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#374151',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '12px',
              background: '#F9FAFB',
              borderRadius: '4px',
              border: '1px solid #F3F4F6'
            }}>
              {expandedDesc}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReview && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowReview(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              maxWidth: '1200px',
              width: '100%',
              background: 'white',
              borderRadius: '12px',
              padding: '0',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '24px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="text-h3" style={{ margin: 0 }}>Review Dispatch Items</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>Please verify the requested quantities before submission to Accounts.</p>
              </div>
              <button className="btn-ghost" onClick={() => setShowReview(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ padding: '24px', maxHeight: '70vh', overflow: 'auto' }}>
              <table className="data-table" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th>Sl no</th>
                    <th>Ref No</th>
                    <th>Package</th>
                    <th>Heading</th>
                    <th>Sub Heading</th>
                    <th>Item Name</th>
                    <th>Description</th>
                    <th>UOM</th>
                    <th>Supply QTY</th>
                    <th>Already Despatched</th>
                    <th>Available Qty</th>
                    <th style={{ background: '#EFF6FF', color: '#1D4ED8' }}>New DC Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedForSummary.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ color: '#6B7280' }}>{it.line_number || idx + 1}</td>
                      <td>{it.ref_no || '-'}</td>
                      <td>{it.package_name || '-'}</td>
                      <td>{it.heading || '-'}</td>
                      <td>{it.sub_heading || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{it.item_name === 'Item' ? '' : it.item_name}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description || '-'}</td>
                      <td>{it.uom || '-'}</td>
                      <td>{it.supply_qty}</td>
                      <td>{it.qty_delivered || 0}</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>{it.available}</td>
                      <td style={{ fontWeight: 800, color: '#1D4ED8', background: '#F0F7FF', textAlign: 'center' }}>{it.requestQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '24px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setShowReview(false)} style={{ height: '48px', padding: '0 24px' }}>Back to Edit</button>
              <button
                className="btn btn-primary"
                style={{ background: '#10B981', padding: '0 40px', height: '48px', fontWeight: 700, fontSize: '16px' }}
                onClick={submitDCRequest}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Hide number input spinners */
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
