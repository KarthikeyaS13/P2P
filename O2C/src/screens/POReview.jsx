import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function POReview() {
  const [pendingPOs, setPendingPOs] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [poDetails, setPoDetails] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Local state for inline editing
  const [editableItems, setEditableItems] = useState([]);

  useEffect(() => {
    loadPendingPOs();
  }, []);

  const loadPendingPOs = async () => {
    setLoadingList(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:3000/api/pos?status=pending', { headers });
      setPendingPOs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleSelectPO = async (po) => {
    setSelectedPO(po);
    setPoDetails(null);
    setLoadingDetails(true);
    setRemarks('');

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:3000/api/pos/${po.id}`, { headers });
      const details = res.data;
      setPoDetails(details);
      
      setEditableItems((details.items || []).map((it, i) => {
        return calculateRow({
          ...it,
          line_number: it.line_number || i + 1,
          package_name: it.package_name || '',
          heading: it.heading || '',
          sub_heading: it.sub_heading || '',
          item_name: it.item_name === 'Item' ? '' : (it.item_name || ''),
          description: it.description || '',
          uom: it.uom || '',
          supply_qty: it.supply_qty || 0,
          supply_rate: it.supply_rate || 0,
          supply_gst_rate: it.supply_gst_rate || 0,
          service_qty: it.service_qty || 0,
          service_rate: it.service_rate || 0,
          service_gst_rate: it.service_gst_rate || 0
        });
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const updatePOStatus = async (status) => {
    if (!selectedPO) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`http://localhost:3000/api/pos/${selectedPO.id}/status`, {
        status, remarks
      }, { headers });

      alert(`PO successfully ${status}`);
      loadPendingPOs();
      setSelectedPO(null);
      setPoDetails(null);
    } catch (err) {
      console.error(err);
      alert('Error updating PO status');
    } finally {
      setActionLoading(false);
    }
  };

  const calculateRow = (row) => {
    const s_qty = parseFloat(row.supply_qty) || 0;
    const s_rate = parseFloat(row.supply_rate) || 0;
    const s_gst_pct = parseFloat(row.supply_gst_rate) || 0;
    const sv_qty = parseFloat(row.service_qty) || 0;
    const sv_rate = parseFloat(row.service_rate) || 0;
    const sv_gst_pct = parseFloat(row.service_gst_rate) || 0;
    const taxable_s = s_qty * s_rate;
    const gst_s = taxable_s * (s_gst_pct / 100);
    const total_s = taxable_s + gst_s;
    const taxable_sv = sv_qty * sv_rate;
    const gst_sv = taxable_sv * (sv_gst_pct / 100);
    const total_sv = taxable_sv + gst_sv;
    const total_taxable = taxable_s + taxable_sv;
    const total_gst = gst_s + gst_sv;
    const total_invoice = total_s + total_sv;
    return {
      ...row,
      taxable_supply: taxable_s,
      gst_supply: gst_s,
      total_supply: total_s,
      taxable_service: taxable_sv,
      gst_service: gst_sv,
      total_service: total_sv,
      total_taxable,
      total_gst,
      total_invoice
    };
  };

  const handleCellChange = (idx, field, val) => {
    setEditableItems(prev => {
      const newItems = [...prev];
      newItems[idx] = calculateRow({ ...newItems[idx], [field]: val });
      return newItems;
    });
  };

  const addNewItem = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const newItem = calculateRow({
      line_number: editableItems.length + 1,
      package_name: '',
      heading: '',
      sub_heading: '',
      item_name: '',
      description: '',
      uom: '',
      supply_qty: 0,
      supply_rate: 0,
      supply_gst_rate: 18,
      service_qty: 0,
      service_rate: 0,
      service_gst_rate: 18,
      id: 'row-' + Date.now()
    });
    setEditableItems(prev => [...prev, newItem]);
  };

  const removeItem = (idx) => {
    setEditableItems(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAllItems = async () => {
    if (!poDetails) return;
    setActionLoading(true);
    try {
      const itemsToSave = editableItems.map(it => ({
        ...it,
        quantity: parseFloat(it.quantity) || 0,
        rate_per_unit: parseFloat(it.rate_base) || 0,
        gst_percent: parseFloat(it.gst_percent) || 0,
        taxable_value: parseFloat(it.taxable_base) || 0,
        gst_amount: parseFloat(it.gst_amount_base) || 0,
        total_value: parseFloat(it.total_base) || 0
      }));

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`http://localhost:3000/api/pos/${poDetails.id}`, { items: itemsToSave }, { headers });

      alert('Line items saved successfully');
      setSelectedPO(null); // Close the modal
      loadPendingPOs(); // Refresh the list of cards to show updated values
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate local totals for the Excel-style footer
  // Taxable Total is the sum of all item taxable values
  const localTaxableTotal = editableItems.reduce((acc, it) => acc + (it.total_taxable || 0), 0);
  const localGstTotal = editableItems.reduce((acc, it) => acc + (it.total_gst || 0), 0);
  const localGrandTotal = editableItems.reduce((acc, it) => acc + (it.total_invoice || 0), 0);

  return (
    <div className="screen-enter">
      <div className="page-header">
        <div>
          <h1 className="text-h1 page-header__title">PO Verification Queue</h1>
          <p className="page-header__subtitle">Review and validate new purchase orders from the Sales team.</p>
        </div>
        <div className="page-header__actions">
          <div className="stat-card" style={{ padding: '12px 20px', margin: 0 }}>
            <p className="stat-card__label" style={{ marginBottom: '4px' }}>Pending Orders</p>
            <span className="stat-card__value" style={{ fontSize: '1.25rem' }}>{pendingPOs.length}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto var(--space-lg)' }}>
        <div className="card card--padded animate-fade" style={{ background: 'white' }}>
          <h3 className="text-h3" style={{ marginBottom: 'var(--space-md)' }}>Pending POs</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {loadingList ? (
              <p style={{ color: 'var(--secondary)', fontSize: '14px' }}>Loading pending POs...</p>
            ) : pendingPOs.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--outline)', marginBottom: '12px' }}>check_circle_outline</span>
                <p style={{ color: 'var(--secondary)', fontWeight: 500 }}>No pending POs for review.</p>
              </div>
            ) : (
              pendingPOs.map(o => (
                <div
                  key={o.id}
                  className="card card--padded"
                  onClick={() => handleSelectPO(o)}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid var(--outline-variant)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    ':hover': { transform: 'translateY(-2px)', boxShadow: 'var(--shadow-md)' }
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontWeight: 600, color: 'var(--primary)', margin: 0 }}>{o.po_number}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>{new Date(o.po_date || o.created_at).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: '14px', marginTop: '8px', fontWeight: 500, color: 'var(--surface-on)' }}>{o.customer_name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '2px' }}>{o.location_name || o.location_city || ''}</p>
                  <p style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: '4px' }}>
                    Value: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>₹{Number(o.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                  {(o.gst_total || 0) > 0 && (
                    <p style={{ fontSize: '11px', color: 'var(--success)', marginTop: '2px', fontWeight: 500 }}>
                      Incl. GST: ₹{Number(o.gst_total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
          {!selectedPO && pendingPOs.length > 0 && (
            <div style={{ marginTop: '32px', textAlign: 'center', borderTop: '1px solid var(--outline-variant)', paddingTop: '24px' }}>
              <p style={{ color: 'var(--secondary)', fontSize: '14px' }}>Select a purchase order above to begin verification</p>
            </div>
          )}
        </div>
      </div>

      {/* Full Screen Overlay for Details - PUSHED DOWN from top */}
      {(selectedPO || loadingDetails) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px' }}>
          <div className="animate-scale-up" style={{ width: '100%', maxWidth: '1200px', height: 'auto', maxHeight: '85vh', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>

            {/* Overlay Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button className="btn-ghost" onClick={() => setSelectedPO(null)} style={{ padding: '4px', borderRadius: '50%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
                </button>
                <div>
                  <h2 className="text-h3" style={{ margin: 0 }}>Review: {selectedPO?.po_number}</h2>
                  <p style={{ fontSize: '12px', color: 'var(--secondary)' }}>{selectedPO?.customer_name}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* <button className="btn btn-primary" onClick={saveAllItems} disabled={actionLoading} style={{ fontSize: '13px', padding: '8px 16px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span> Save Grid Data
                </button> */}
                <button className="btn-ghost" onClick={() => setSelectedPO(null)} style={{ padding: '8px', borderRadius: '50%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>close</span>
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--surface-container-lowest)' }}>
              {loadingDetails ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 0' }}>
                  <p>Loading PO Details...</p>
                </div>
              ) : poDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="grid-2" style={{ gap: '24px' }}>
                    <div className="card card--padded" style={{ background: 'white' }}>
                      <h4 className="text-h4" style={{ marginBottom: '12px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined">info</span> PO Details
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</p>
                          <p style={{ fontWeight: 600 }}>{poDetails.customer_name}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Delivery Location</p>
                          <p style={{ fontWeight: 600, margin: 0 }}>{poDetails.location_name} - {poDetails.location_city}, {poDetails.location_state}</p>
                          <p style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: '4px' }}>{poDetails.location_address}</p>
                          <p style={{ fontSize: '13px', color: 'var(--secondary)' }}>GSTIN: <span style={{ color: 'var(--surface-on)', fontWeight: 500 }}>{poDetails.location_gstin || 'N/A'}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="card card--padded" style={{ background: 'white' }}>
                      <h4 className="text-h4" style={{ marginBottom: '12px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined">fact_check</span> Decision
                      </h4>
                      <div className="form-group" style={{ marginBottom: '12px' }}>
                        <textarea
                          className="form-input"
                          rows="1"
                          placeholder="Verification notes..."
                          value={remarks}
                          onChange={e => setRemarks(e.target.value)}
                          style={{ fontSize: '13px' }}
                        ></textarea>
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn btn-success" style={{ flex: 1 }} onClick={() => updatePOStatus('accepted')} disabled={actionLoading}>Approve</button>
                        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => updatePOStatus('rejected')} disabled={actionLoading}>Reject</button>
                      </div>
                    </div>
                  </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px', background: 'white' }}>
                      <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.7rem' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: '#F9FAFB' }}>
                          <tr style={{ whiteSpace: 'nowrap' }}>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '40px' }}>Sl no</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '70px' }}>Ref No</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '110px' }}>Package</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '110px' }}>Heading</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '110px' }}>Sub Heading</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '140px' }}>Item Name</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '160px' }}>Description</th>
                            <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '50px' }}>UOM</th>
                            
                            <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#ECFDF5', textAlign: 'center', fontSize: '0.65rem' }}>Supply Details</th>
                            <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'center', fontSize: '0.65rem' }}>Service Details</th>
                            <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center', fontSize: '0.65rem' }}>Calc. Supply</th>
                            <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center', fontSize: '0.65rem' }}>Calc. Service</th>
                            <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center', fontSize: '0.65rem' }}>TOTALS</th>
                          </tr>
                          <tr style={{ whiteSpace: 'nowrap' }}>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '70px' }}>Qty</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '80px' }}>Rate</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '50px' }}>GST%</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '70px' }}>Qty</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '80px' }}>Rate</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '50px' }}>GST%</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Taxable</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>GST</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Total</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Taxable</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>GST</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Total</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '80px' }}>Taxable</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '80px' }}>GST</th>
                            <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '90px' }}>Invoice</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editableItems.map((it, idx) => (
                            <tr key={it.id || idx}>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#6B7280' }}>{idx + 1}</td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.ref_no} onChange={e => handleCellChange(idx, 'ref_no', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.package_name} onChange={e => handleCellChange(idx, 'package_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.heading} onChange={e => handleCellChange(idx, 'heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.sub_heading} onChange={e => handleCellChange(idx, 'sub_heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.item_name} onChange={e => handleCellChange(idx, 'item_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.description} onChange={e => handleCellChange(idx, 'description', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.uom} onChange={e => handleCellChange(idx, 'uom', e.target.value)} style={{ width: '100%', border: 'none', padding: '3px 5px', fontSize: '0.7rem' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_qty} onChange={e => handleCellChange(idx, 'supply_qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '3px 5px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_rate} onChange={e => handleCellChange(idx, 'supply_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '3px 5px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_gst_rate} onChange={e => handleCellChange(idx, 'supply_gst_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '3px 5px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_qty} onChange={e => handleCellChange(idx, 'service_qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '3px 5px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_rate} onChange={e => handleCellChange(idx, 'service_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '3px 5px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_gst_rate} onChange={e => handleCellChange(idx, 'service_gst_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '3px 5px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.taxable_supply || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.gst_supply || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.total_supply || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.taxable_service || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.gst_service || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.total_service || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.65rem' }}>₹{(it.total_taxable || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.65rem' }}>₹{(it.total_gst || 0).toLocaleString()}</td>
                              <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, background: '#FEF3C7', fontSize: '0.7rem' }}>₹{(it.total_invoice || 0).toLocaleString()}</td>
                              <td style={{ padding: '1px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                                <button onClick={() => removeItem(idx)} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 20, background: '#374151', color: 'white', fontWeight: 700 }}>
                          <tr>
                            <td colSpan="8" style={{ padding: '4px 10px', textAlign: 'right', fontSize: '0.7rem' }}>GRAND TOTALS:</td>
                            <td colSpan="3"></td>
                            <td colSpan="3"></td>
                            <td colSpan="3" style={{ textAlign: 'right', padding: '4px 10px', fontSize: '0.7rem' }}>₹{localTaxableTotal.toLocaleString()} <span style={{fontSize: '0.55rem', opacity: 0.8}}>(Taxable)</span></td>
                            <td colSpan="3" style={{ textAlign: 'right', padding: '4px 10px', fontSize: '0.7rem' }}>₹{localGstTotal.toLocaleString()} <span style={{fontSize: '0.55rem', opacity: 0.8}}>(GST)</span></td>
                            <td colSpan="3" style={{ textAlign: 'right', padding: '4px 10px', background: '#059669', fontSize: '0.8rem' }}>₹{localGrandTotal.toLocaleString()}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
