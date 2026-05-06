import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function DCRequest() {
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

  useEffect(() => {
    const fetchApprovedPOs = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/dc-requests/pos', { headers });
        setApprovedPOs(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPOs(false);
      }
    };
    fetchApprovedPOs();
  }, []);

  const handlePOChange = async (e) => {
    const poId = e.target.value;
    setSelectedPOId(poId);
    setItems([]);
    setLocationDetails({ name: '', id: '' });
    
    if (!poId) return;

    setLoadingItems(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:3000/api/pos/${poId}`, { headers });
      const po = res.data;
      setLocationDetails({
        name: po.location_name ? `${po.location_name} - ${po.location_city}, ${po.location_state}` : (po.location_city || 'N/A'),
        id: po.location_id || ''
      });
      
      const newItems = (po.items || []).map(item => {
        // We primarily dispatch Supply items for DC
        const qty = item.supply_qty || 0;
        const delivered = item.qty_delivered || 0;
        const available = qty - delivered;
        return {
          ...item,
          available,
          requestQty: available > 0 ? available : 0,
          selected: available > 0
        };
      });
      setItems(newItems.filter(it => it.supply_qty > 0)); // Only show items with supply qty for DC
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
    let num = parseInt(val) || 0;
    const max = items[index].available;
    if (num < 0) num = 0;
    if (num > max) num = max;
    
    const newItems = [...items];
    newItems[index].requestQty = num;
    setItems(newItems);
  };

  const submitDCRequest = async () => {
    const selectedItems = items
      .filter(i => i.selected && i.requestQty > 0)
      .map(i => ({ line_item_id: i.id, qty: i.requestQty }));
      
    if (!selectedPOId || selectedItems.length === 0) return;
    
    setSubmitting(true);
    const payload = {
      po_id: selectedPOId,
      location_id: locationDetails.id,
      dispatch_date: dispatchDate,
      transporter: transporter,
      special_instructions: instructions,
      items: selectedItems
    };
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post('http://localhost:3000/api/dc-requests', payload, { headers });
      
      const data = res.data;
      alert(`DC Request ${data.dc_request} submitted successfully!`);
      
      // Reset form
      setSelectedPOId('');
      setItems([]);
      setTransporter('');
      setInstructions('');
      setLocationDetails({ name: '', id: '' });
      
    } catch (err) {
      console.error(err);
      alert('Failed to submit DC Request');
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
        <div>
          <h1 className="text-h1 page-header__title">Delivery Challan Request</h1>
          <p className="page-header__subtitle">Select items from an approved PO to initiate fulfillment.</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="card card--padded animate-fade animate-stagger-1">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3 className="text-h3">Select PO</h3>
            </div>
            <div className="form-group">
              <label className="form-label">Purchase Order</label>
              <select className="form-select" value={selectedPOId} onChange={handlePOChange}>
                <option value="">
                  {loadingPOs ? 'Loading approved POs...' : approvedPOs.length === 0 ? 'No approved POs available' : '-- Select a Purchase Order --'}
                </option>
                {approvedPOs.map(o => (
                  <option key={o.id} value={o.id}>{o.po} — {o.customer}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Delivery Location</label>
                <input className="form-input" type="text" readOnly value={locationDetails.name} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Dispatch Date</label>
                <input className="form-input" type="date" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card card--padded animate-fade animate-stagger-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3 className="text-h3">Items for Dispatch</h3>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--secondary)' }}>
                {selectedForSummary.length} selected
              </span>
            </div>
            <div className="item-selector">
              {!selectedPOId ? (
                <p style={{ color: 'var(--secondary)', textAlign: 'center' }}>Select a PO to view items</p>
              ) : loadingItems ? (
                <p style={{ color: 'var(--secondary)', textAlign: 'center' }}>Loading items...</p>
              ) : items.length === 0 ? (
                <p style={{ color: 'var(--secondary)', textAlign: 'center' }}>No line items found for this PO.</p>
              ) : (
                items.map((item, i) => (
                  <div className="item-row" key={i}>
                    <input 
                      type="checkbox" 
                      checked={item.selected} 
                      disabled={item.available <= 0} 
                      onChange={e => handleItemSelect(i, e.target.checked)} 
                    />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {(item.item_name && item.item_name !== 'Item') 
                          ? item.item_name 
                          : (item.sub_heading || item.package_name || 'Unnamed Item')}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                        {item.ref_no} · PO Qty: {item.supply_qty} · Delivered: {item.qty_delivered || 0}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 600 }}>Available: {item.available}</span>
                    </div>
                    <div className="item-row__qty">
                      <input 
                        className="form-input" 
                        type="number" 
                        value={item.selected ? item.requestQty : 0} 
                        min="0" 
                        max={item.available} 
                        disabled={!item.selected || item.available <= 0}
                        onChange={e => handleQtyChange(i, e.target.value)}
                        style={{ textAlign: 'center', padding: '6px' }} 
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="summary-card animate-fade animate-stagger-2">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-md)', opacity: 0.8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Request Summary
            </h3>
            <div>
              {selectedForSummary.length === 0 ? (
                <p style={{ color: 'var(--secondary)', fontSize: '14px' }}>No items selected</p>
              ) : (
                <>
                  {selectedForSummary.map((item, idx) => (
                    <div className="summary-card__row" key={idx}>
                      <span style={{ fontSize: '13px' }}>
                        {(item.item_name && item.item_name !== 'Item') 
                          ? item.item_name 
                          : (item.sub_heading || item.package_name || 'Item')} × {item.requestQty}
                      </span>
                      <span>₹{((item.supply_rate || 0) * item.requestQty).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="summary-card__row" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <span>Total Value</span>
                    <span>₹{totalValue.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card card--padded animate-fade animate-stagger-3">
            <h3 className="text-h3" style={{ marginBottom: 'var(--space-md)' }}>Dispatch Notes</h3>
            <div className="form-group">
              <label className="form-label">Vehicle / Transporter</label>
              <input 
                className="form-input" 
                placeholder="e.g. ABC Logistics — MH-12-AB-1234" 
                type="text" 
                value={transporter}
                onChange={e => setTransporter(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Special Instructions</label>
              <textarea 
                className="form-input" 
                rows="3" 
                placeholder="Handling instructions, timing constraints..."
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              ></textarea>
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '14px' }} 
            disabled={selectedForSummary.length === 0 || submitting}
            onClick={submitDCRequest}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            {submitting ? 'Submitting...' : 'Submit DC Request'}
          </button>
        </div>
      </div>

      {selectedPOId && items.length > 0 && (
        <div className="card card--padded animate-fade" style={{ background: 'white', marginTop: '24px' }}>
          <h3 className="text-h3" style={{ marginBottom: '16px' }}>Detailed Item View</h3>
          <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
            <table style={{ width: 'max-content', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.7rem' }}>
              <thead style={{ background: '#F9FAFB' }}>
                <tr style={{ whiteSpace: 'nowrap' }}>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '40px', textAlign: 'left' }}>#</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '60px', textAlign: 'left' }}>Ref No</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '80px', textAlign: 'left' }}>Package</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '80px', textAlign: 'left' }}>Heading</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '80px', textAlign: 'left' }}>Sub Heading</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '120px', textAlign: 'left' }}>Item Name</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '150px', textAlign: 'left' }}>Description</th>
                  <th rowSpan="2" style={{ padding: '8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '50px', textAlign: 'center' }}>UOM</th>
                  <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#ECFDF5', textAlign: 'center' }}>Supply Details</th>
                  <th colSpan="3" style={{ padding: '4px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center' }}>TOTALS</th>
                </tr>
                <tr style={{ whiteSpace: 'nowrap' }}>
                  <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '80px' }}>Qty</th>
                  <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '90px' }}>Rate</th>
                  <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '60px' }}>GST%</th>
                  <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '90px' }}>Taxable</th>
                  <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '90px' }}>GST</th>
                  <th style={{ padding: '4px 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '100px' }}>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'left', color: '#6B7280' }}>{it.line_number || idx + 1}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.ref_no || '-'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.package_name || '-'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.heading || '-'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB' }}>{it.sub_heading || '-'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', fontWeight: 600 }}>{it.item_name === 'Item' ? '' : it.item_name}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', color: '#4B5563' }}>{it.description || '-'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{it.uom || '-'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#ECFDF5' }}>{it.supply_qty || 0}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#ECFDF5' }}>{fmt(it.supply_rate || 0)}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#ECFDF5' }}>{it.supply_gst_rate || 0}%</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB' }}>{fmt(it.total_taxable || 0)}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB' }}>{fmt(it.total_gst || 0)}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, background: '#FEF3C7' }}>{fmt(it.total_invoice || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
