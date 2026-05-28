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
  const [previewImage, setPreviewImage] = useState(null);

  const [currentPOData, setCurrentPOData] = useState(null);
  const [masterAddresses, setMasterAddresses] = useState([]);
  const [dispatchSource, setDispatchSource] = useState('manual');
  const [sourceAddress, setSourceAddress] = useState({ line1: '', line2: '', pin: '', landmark: '' });

  useEffect(() => {
    const fetchApprovedPOs = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('/api/dc-requests/pos', { headers });
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
        const res = await axios.get('/api/master-addresses', {
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
        const res = await axios.get(`/api/next-dc-number/${po.customer_id || po.id}`, { headers });
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
      const res = await axios.get(`/api/pos/${poId}`, { headers });
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

    if (!logistics.vehicle_no?.trim() || !logistics.driver_name?.trim() || !logistics.driver_phone?.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Logistics Details Required',
        text: 'Please enter Vehicle Number, Driver / Agent Name, and Driver Phone before submitting the request.'
      });
      return;
    }

    const cleanVehicle = (logistics.vehicle_no || '').replace(/\s+/g, '');
    if (cleanVehicle.length !== 10) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Vehicle Number',
        text: 'Please enter a valid 10-character Vehicle Number (excluding spaces).'
      });
      return;
    }

    if (!sourceAddress.line1?.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Dispatch Source Address Required',
        text: 'Please enter the Dispatch Source Address Line 1 before submitting the request.'
      });
      return;
    }

    if (!sourceAddress.pin?.trim() || sourceAddress.pin.trim().length !== 6) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Pincode',
        text: 'Please enter a valid 6-digit Pincode before submitting the request.'
      });
      return;
    }

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
      const res = await axios.post('/api/dc-requests', formData, { headers });

      const data = res.data;
      Swal.fire({ icon: 'success', title: 'Success', text: `Delivery Challan Request ${data.dc_request} submitted successfully!`, timer: 2000, showConfirmButton: false });
      navigate('/dashboard');

      // Reset form
      setSelectedPOId('');
      setItems([]);
      setTransporter('');
      setInstructions('');
      setLocationDetails({ name: '', id: '' });

    } catch (err) {
      console.error('ERROR SUBMITTING DC REQUEST:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to submit Delivery Challan Request';
      Swal.fire({ icon: 'error', title: 'Error', text: 'Error: ' + msg });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedForSummary = items.filter(i => i.selected && i.requestQty > 0);
  const totalQuantity = selectedForSummary.reduce((acc, item) => acc + (Number(item.requestQty) || 0), 0);
  const totalValue = selectedForSummary.reduce((acc, item) => acc + ((item.supply_rate || 0) * item.requestQty), 0);

  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalItemsAvailable = items.length;
  const totalRequestQty = items.reduce((sum, it) => sum + (Number(it.requestQty) || 0), 0);

  return (
    <div className="screen-enter" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
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
      <div style={{ background: 'white', padding: '12px 16px', borderRadius: '6px', border: '1px solid #E5E7EB', marginBottom: '16px' }} className="animate-fade">
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '12px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Source Sales Order <span style={{ color: '#EF4444' }}>*</span></label>
            <select className="form-select" value={selectedPOId} onChange={handlePOChange} style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }}>
              <option value="">
                {loadingPOs ? 'Loading approved POs...' : approvedPOs.length === 0 ? 'No approved POs available' : '-- Select a Sales Order --'}
              </option>
              {approvedPOs.map(o => (
                <option key={o.id} value={o.id}>{o.po} — {o.customer}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Delivery Location</label>
            <input className="form-input" type="text" readOnly value={locationDetails.name} placeholder="Select PO to see location" style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F9FAFB', width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Requested Dispatch Date <span style={{ color: '#EF4444' }}>*</span></label>
            <div className="date-picker-container" style={{ position: 'relative', width: '100%' }}>
              <DatePicker
                selected={dispatchDate ? new Date(dispatchDate) : null}
                onChange={(date) => setDispatchDate(date ? date.toISOString().split('T')[0] : '')}
                dateFormat="dd/MM/yyyy"
                placeholderText="DD/MM/YYYY"
                customInput={
                  <input style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }} />
                }
              />
              <span className="material-symbols-outlined calendar-icon" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#94A3B8', pointerEvents: 'none' }}>calendar_today</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'white', padding: '12px 16px', borderRadius: '6px', border: '1px solid #E5E7EB' }} className="animate-fade">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155' }}>Select Items for Dispatch</h3>
            <span style={{ color: '#9CA3AF', fontSize: '11px', fontWeight: 500, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '3px', background: '#F9FAFB', padding: '3px 8px', borderRadius: '4px', border: '1px solid #F3F4F6' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>keyboard_tab</span>
              Press Tab to move to the next cell
            </span>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px', maxHeight: '400px', background: 'white' }}>
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
              <thead style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 40 }}>
                <tr style={{ whiteSpace: 'nowrap', height: '36px' }}>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', width: '35px', position: 'sticky', left: 0, zIndex: 50, background: '#F3F4F6', borderRight: '2px solid #D1D5DB', height: '36px' }}>Sl</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', width: '70px', height: '36px', border: '1px solid #E5E7EB' }}>Ref No</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', minWidth: '150px', height: '36px', border: '1px solid #E5E7EB' }}>Package Name</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', minWidth: '180px', height: '36px', border: '1px solid #E5E7EB' }}>Heading</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', minWidth: '200px', height: '36px', border: '1px solid #E5E7EB' }}>Sub Heading</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', minWidth: '250px', height: '36px', border: '1px solid #E5E7EB' }}>Item Name</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', minWidth: '300px', height: '36px', border: '1px solid #E5E7EB' }}>Description <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', width: '50px', height: '36px', border: '1px solid #E5E7EB' }}>UOM</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', textAlign: 'right', width: '70px', height: '36px', border: '1px solid #E5E7EB' }}>Quantity</th>
                  <th style={{ padding: '0 8px', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', textAlign: 'right', width: '70px', height: '36px', border: '1px solid #E5E7EB' }}>Dispatched</th>
                  <th style={{ padding: '0 8px', color: '#059669', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', background: '#ECFDF5', textAlign: 'right', width: '80px', height: '36px', border: '1px solid #E5E7EB' }}>Pending</th>
                  <th style={{ padding: '0 8px', color: '#1D4ED8', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', background: '#EFF6FF', textAlign: 'center', width: '90px', height: '36px', border: '1px solid #E5E7EB' }}>New DC Qty</th>
                </tr>
              </thead>
              <tbody>
                {!selectedPOId ? (
                  <tr><td colSpan="12" style={{ padding: '30px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>Please select a Sales Order to view items</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan="12" style={{ padding: '30px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>No supply items found in this PO</td></tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={it.id || idx} style={{ height: '32px', whiteSpace: 'nowrap' }}>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#1e293b', textAlign: 'center', fontWeight: 800, position: 'sticky', left: 0, zIndex: 10, background: '#f1f5f9', borderRight: '2px solid #D1D5DB', height: '32px', fontSize: '0.75rem' }}>{it.line_number || idx + 1}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.ref_no || '-'}</td>
                      <td
                        style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 600, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', height: '32px', fontSize: '0.75rem' }}
                        onClick={() => it.package_name && it.package_name.length > 20 && Swal.fire({ title: 'Package', text: it.package_name })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '32px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.package_name || '-'}</span>
                          {it.package_name && it.package_name.length > 20 && <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#3b82f6', opacity: 0.6 }}>open_in_new</span>}
                        </div>
                      </td>
                      <td
                        style={{ padding: '0 8px', border: '1px solid #E5E7EB', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', height: '32px', fontSize: '0.75rem' }}
                        onClick={() => it.heading && it.heading.length > 25 && Swal.fire({ title: 'Heading', text: it.heading })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '32px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.heading || '-'}</span>
                          {it.heading && it.heading.length > 25 && <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#3b82f6', opacity: 0.6 }}>open_in_new</span>}
                        </div>
                      </td>
                      <td
                        style={{ padding: '0 8px', border: '1px solid #E5E7EB', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', height: '32px', fontSize: '0.75rem' }}
                        onClick={() => it.sub_heading && it.sub_heading.length > 30 && Swal.fire({ title: 'Sub Heading', text: it.sub_heading })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '32px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub_heading || '-'}</span>
                          {it.sub_heading && it.sub_heading.length > 30 && <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#3b82f6', opacity: 0.6 }}>open_in_new</span>}
                        </div>
                      </td>
                      <td
                        style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 600, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', height: '32px', fontSize: '0.75rem' }}
                        onClick={() => it.item_name && it.item_name.length > 35 && Swal.fire({ title: 'Item Name', text: it.item_name })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '32px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.item_name === 'Item' ? '' : it.item_name}</span>
                          {it.item_name && it.item_name.length > 35 && <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#3b82f6', opacity: 0.6 }}>open_in_new</span>}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '0 8px', border: '1px solid #E5E7EB',
                          color: '#111827',
                          maxWidth: '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                          height: '32px', fontSize: '0.75rem'
                        }}
                        onClick={() => it.description && it.description.length > 40 && Swal.fire({ icon: 'info', title: 'Description', text: it.description || 'No description available' })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '32px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description || '-'}</span>
                          {it.description && it.description.length > 40 && <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#3b82f6', opacity: 0.6 }}>open_in_new</span>}
                        </div>
                      </td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem', textAlign: 'center' }}>{it.uom || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>{it.supply_qty}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#6B7280', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>{it.qty_delivered || 0}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 700, color: '#059669', background: '#F0FDF4', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>{it.available}</td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#EFF6FF', height: '32px' }}>
                        <input
                          type="number"
                          className="form-input"
                          value={it.requestQty}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.75rem', textAlign: 'center', height: '32px', background: 'transparent', outline: 'none' }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot style={{ background: '#0f172a', borderTop: '2px solid #334155', position: 'sticky', bottom: 0, zIndex: 5, color: '#ffffff' }}>
                <tr>
                  <td colSpan="11" style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', color: '#ffffff' }}>
                    {selectedForSummary.length} ITEMS — TOTAL QUANTITY FOR DISPATCH
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 900, fontSize: '13px', color: '#ffffff', background: '#1e293b' }}>
                    {totalRequestQty}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Logistics & DC Configuration moved here */}
        <div style={{ background: 'white', padding: '12px 16px', borderRadius: '6px', border: '1px solid #E5E7EB' }} className="animate-fade">
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '18px' }}>local_shipping</span>
            Logistics & DC Configuration
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Vehicle Number <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                className="form-input"
                placeholder="e.g. TS09EX 1234"
                value={logistics.vehicle_no}
                maxLength={10}
                onChange={e => {
                  const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                  setLogistics({ ...logistics, vehicle_no: val });
                }}
                style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Driver Name / Agent Name <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                className="form-input"
                placeholder="Enter driver or agent name"
                value={logistics.driver_name}
                onChange={e => setLogistics({ ...logistics, driver_name: e.target.value })}
                style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Driver Phone <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                className="form-input"
                placeholder="10-digit number"
                value={logistics.driver_phone}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setLogistics({ ...logistics, driver_phone: val });
                }}
                style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Transporter Name <span style={{ color: '#94A3B8', fontWeight: 500 }}>(Optional)</span></label>
              <input
                className="form-input"
                placeholder="e.g. DHL, Blue Dart"
                value={transporter}
                onChange={e => setTransporter(e.target.value)}
                style={{ height: '32px', fontSize: '13px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px', padding: '12px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Dispatch Proof (Photo)</label>
              {!proofFile ? (
                <div
                  style={{
                    border: '1px dashed #CBD5E1',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    textAlign: 'center',
                    background: '#F8FAFC',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '80px',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#CBD5E1'}
                  onClick={() => document.getElementById('dc-proof-upload').click()}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '24px', color: '#94A3B8' }}>add_a_photo</span>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>Click to upload proof photo</div>
                  <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '1px' }}>PNG, JPG or WebP supported</div>
                  <input
                    id="dc-proof-upload"
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={e => setProofFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white', padding: '8px 12px', height: '48px', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <img
                      src={URL.createObjectURL(proofFile)}
                      alt="Dispatch Proof"
                      style={{ height: '32px', width: '44px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid #CBD5E1' }}
                      onClick={() => setPreviewImage({ url: URL.createObjectURL(proofFile), name: proofFile.name })}
                      title="Click to preview"
                    />
                    <span style={{ fontSize: '11px', color: '#334155', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }} title={proofFile.name}>
                      {proofFile.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ url: URL.createObjectURL(proofFile), name: proofFile.name })}
                      style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#2563EB' }}
                      title="Preview Image"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProofFile(null)}
                      style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#EF4444' }}
                      title="Remove File"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px', display: 'block' }}>Logistics Remarks</label>
              <textarea
                className="form-input"
                placeholder="Add any specific delivery or transport notes..."
                rows={2}
                style={{ resize: 'none', fontSize: '12px', height: '80px', padding: '6px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', boxSizing: 'border-box', width: '100%' }}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
              ></textarea>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '94px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>Official Delivery Challan Number</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', color: '#475569' }}>
                    <input type="radio" name="dc_type" checked={dcNumbering.type === 'auto'} onChange={() => setDcNumbering({ ...dcNumbering, type: 'auto' })} /> Auto
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', color: '#475569' }}>
                    <input type="radio" name="dc_type" checked={dcNumbering.type === 'manual'} onChange={() => setDcNumbering({ ...dcNumbering, type: 'manual' })} /> Manual
                  </label>
                </div>
              </div>

              {dcNumbering.type === 'auto' ? (
                <div style={{ padding: '6px 10px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '4px', fontWeight: 700, color: 'var(--primary)', fontSize: '13px' }}>
                  {autoDCNumber || 'Loading next number...'}
                </div>
              ) : (
                <input
                  className="form-input"
                  style={{ borderColor: 'var(--primary)', height: '32px', fontSize: '12px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', boxSizing: 'border-box', width: '100%' }}
                  placeholder="Enter manual DC number (e.g. DC/2026/001)"
                  value={dcNumbering.manualValue}
                  onChange={e => setDcNumbering({ ...dcNumbering, manualValue: e.target.value })}
                />
              )}
            </div>

            <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label" style={{ color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>Dispatch Source <span style={{ color: '#EF4444' }}>*</span></label>
                <select
                  className="form-select"
                  value={dispatchSource}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  style={{ width: '130px', height: '24px', fontSize: '11px', padding: '0 4px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                >
                  <option value="manual">Manual Entry</option>
                  {masterAddresses.map(addr => (
                    <option key={addr.id} value={addr.id.toString()}>{addr.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <input
                  className="form-input"
                  placeholder="Addr Line 1 *"
                  style={{ fontSize: '11px', height: '24px', padding: '0 6px', border: '1px solid #CBD5E1', borderRadius: '4px', background: dispatchSource !== 'manual' ? '#F1F5F9' : 'white', boxSizing: 'border-box', width: '100%' }}
                  value={sourceAddress.line1}
                  onChange={e => setSourceAddress({ ...sourceAddress, line1: e.target.value })}
                  readOnly={dispatchSource !== 'manual'}
                />
                <input
                  className="form-input"
                  placeholder="Addr Line 2"
                  style={{ fontSize: '11px', height: '24px', padding: '0 6px', border: '1px solid #CBD5E1', borderRadius: '4px', background: dispatchSource !== 'manual' ? '#F1F5F9' : 'white', boxSizing: 'border-box', width: '100%' }}
                  value={sourceAddress.line2}
                  onChange={e => setSourceAddress({ ...sourceAddress, line2: e.target.value })}
                  readOnly={dispatchSource !== 'manual'}
                />
                <input
                  className="form-input"
                  placeholder="Pincode *"
                  style={{ fontSize: '11px', height: '24px', padding: '0 6px', border: '1px solid #CBD5E1', borderRadius: '4px', background: dispatchSource !== 'manual' ? '#F1F5F9' : 'white', boxSizing: 'border-box', width: '100%' }}
                  value={sourceAddress.pin}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setSourceAddress({ ...sourceAddress, pin: val });
                  }}
                  readOnly={dispatchSource !== 'manual'}
                />
                <input
                  className="form-input"
                  placeholder="Landmark"
                  style={{ fontSize: '11px', height: '24px', padding: '0 6px', border: '1px solid #CBD5E1', borderRadius: '4px', boxSizing: 'border-box', width: '100%' }}
                  value={sourceAddress.landmark}
                  onChange={e => setSourceAddress({ ...sourceAddress, landmark: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: '#F1F5F9', padding: '8px 16px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>Selected: <strong style={{ color: '#0F172A', fontSize: '13px' }}>{selectedForSummary.length} Items</strong></span>
            <span style={{ width: '1px', height: '16px', background: '#CBD5E1' }}></span>
            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>Total Qty: <strong style={{ color: '#1D4ED8', fontSize: '13px' }}>{totalQuantity}</strong></span>
          </div>
          <button
            className="btn btn-primary"
            style={{ height: '36px', padding: '0 24px', background: '#10B981', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={selectedForSummary.length === 0 || submitting}
            onClick={() => {
              if (!logistics.vehicle_no?.trim() || !logistics.driver_name?.trim() || !logistics.driver_phone?.trim()) {
                Swal.fire({
                  icon: 'warning',
                  title: 'Logistics Details Required',
                  text: 'Please enter Vehicle Number, Driver / Agent Name, and Driver Phone before reviewing the request.'
                });
                return;
              }
              const cleanVehicleReview = (logistics.vehicle_no || '').replace(/\s+/g, '');
              if (cleanVehicleReview.length !== 10) {
                Swal.fire({
                  icon: 'warning',
                  title: 'Invalid Vehicle Number',
                  text: 'Please enter a valid 10-character Vehicle Number (excluding spaces).'
                });
                return;
              }
              if (!sourceAddress.line1?.trim()) {
                Swal.fire({
                  icon: 'warning',
                  title: 'Dispatch Source Address Required',
                  text: 'Please enter the Dispatch Source Address Line 1 before reviewing the request.'
                });
                return;
              }
              if (!sourceAddress.pin?.trim() || sourceAddress.pin.trim().length !== 6) {
                Swal.fire({
                  icon: 'warning',
                  title: 'Invalid Pincode',
                  text: 'Please enter a valid 6-digit Pincode before reviewing the request.'
                });
                return;
              }
              setShowReview(true);
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
            {submitting ? 'Processing...' : 'Review Request'}
          </button>
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
              borderRadius: '8px',
              padding: '0',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155' }}>Review Dispatch Items</h3>
                <p style={{ margin: 0, fontSize: '11px', color: '#6B7280' }}>Please verify the requested quantities before submission to Accounts.</p>
              </div>
              <button className="btn-ghost" onClick={() => setShowReview(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ padding: '16px', maxHeight: '70vh', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                <thead style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 10, }}>
                  <tr style={{ height: '36px' }}>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Sl no</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Ref No</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Package</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Sub Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Item Name</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>Description</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', height: '36px' }}>UOM</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', textAlign: 'right', height: '36px' }}>Supply QTY</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#111827', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', textAlign: 'right', height: '36px' }}>Despatched</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#059669', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', textAlign: 'right', height: '36px', background: '#ECFDF5' }}>To be Dispatched</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', textAlign: 'center', height: '36px' }}>New DC Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedForSummary.map((it, idx) => (
                    <tr key={idx} style={{ height: '32px' }}>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', color: '#6B7280', height: '32px', fontSize: '0.75rem' }}>{it.line_number || idx + 1}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.ref_no || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.package_name || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.heading || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem' }}>{it.sub_heading || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 600, height: '32px', fontSize: '0.75rem' }}>{it.item_name === 'Item' ? '' : it.item_name}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', height: '32px', fontSize: '0.75rem' }}>{it.description || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', height: '32px', fontSize: '0.75rem', textAlign: 'center' }}>{it.uom || '-'}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>{it.supply_qty}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', height: '32px', fontSize: '0.75rem' }}>{it.qty_delivered || 0}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 700, color: '#059669', textAlign: 'right', height: '32px', fontSize: '0.75rem', background: '#F0FDF4' }}>{it.available}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', fontWeight: 800, color: '#1D4ED8', background: '#F0F7FF', textAlign: 'center', height: '32px', fontSize: '0.75rem' }}>{it.requestQty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: '#F8FAFC', borderTop: '2px solid #E5E7EB' }}>
                  <tr>
                    <td colSpan="11" style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: '12px', color: '#111827' }}>
                      {selectedForSummary.length} ITEMS — TOTAL QUANTITY FOR DISPATCH
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 900, fontSize: '14px', color: '#1D4ED8', background: '#EFF6FF' }}>{totalQuantity}</td>
                  </tr>
                </tfoot>
              </table>

              <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px' }}>Logistics Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '9px', color: '#94A3B8' }}>Vehicle Number</div>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{logistics.vehicle_no}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', color: '#94A3B8' }}>Driver / Agent Contact</div>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{logistics.driver_name} ({logistics.driver_phone})</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', color: '#94A3B8' }}>Transporter</div>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{transporter || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px' }}>Dispatch Proof</h4>
                  {proofFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={URL.createObjectURL(proofFile)}
                          alt="Proof Preview"
                          style={{ height: '32px', width: '44px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #CBD5E1', cursor: 'pointer' }}
                          onClick={() => setPreviewImage({ url: URL.createObjectURL(proofFile), name: proofFile.name })}
                          title="Click to preview"
                        />
                        <div style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>{proofFile.name}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: URL.createObjectURL(proofFile), name: proofFile.name })}
                        style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#2563EB' }}
                        title="Preview Image"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No proof photo uploaded</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 16px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setShowReview(false)} style={{ height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: 600 }}>Back to Edit</button>
              <button
                className="btn btn-primary"
                style={{ background: '#10B981', color: 'white', border: 'none', padding: '0 24px', height: '36px', fontWeight: 700, fontSize: '13px', borderRadius: '6px' }}
                onClick={submitDCRequest}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
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
