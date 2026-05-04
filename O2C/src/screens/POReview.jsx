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
      
      setEditableItems((details.line_items || []).map(it => {
        const qty = parseFloat(it.quantity) || 1;
        const rate = parseFloat(it.rate_per_unit) || 0;
        const gstPct = parseFloat(it.gst_percent) || 18;
        const taxable = parseFloat(it.taxable_value) || (qty * rate);
        const gstAmt = parseFloat(it.gst_amount) || (taxable * gstPct / 100);
        const total = parseFloat(it.total_value) || (taxable + gstAmt);

        return {
          ...it,
          quantity: qty,
          rate_base: rate.toFixed(2),
          gst_percent: gstPct,
          taxable_base: taxable.toFixed(2),
          gst_amount_base: gstAmt.toFixed(2),
          total_base: total.toFixed(2)
        };
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

  const handleCellChange = (idx, field, val) => {
    setEditableItems(prev => {
      const newItems = [...prev];
      const item = { ...newItems[idx], [field]: val };

      const q = parseFloat(item.quantity) || 0;
      const r = parseFloat(item.rate_base) || 0;
      const gstPercent = parseFloat(item.gst_percent) || 0;

      const taxable = q * r;
      const gstAmt = taxable * (gstPercent / 100);
      const total = taxable + gstAmt;

      item.taxable_base = taxable.toFixed(2);
      item.gst_amount_base = gstAmt.toFixed(2);
      item.total_base = total.toFixed(2);

      newItems[idx] = item;
      return newItems;
    });
  };

  const addNewItem = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const newItem = {
      item_name: '',
      quantity: 1,
      rate_base: '0.00',
      gst_percent: 0,
      taxable_base: '0.00',
      gst_amount_base: '0.00',
      total_base: '0.00',
      id: 'row-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    };
    setEditableItems(prev => [newItem, ...prev]);
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
  const localTaxableTotal = editableItems.reduce((acc, it) => acc + (parseFloat(it.taxable_base) || 0), 0);
  // GST is 18% of the total taxable amount
  const localGstTotal = editableItems.reduce((acc, it) => {
    const taxable = parseFloat(it.taxable_base) || 0;
    const gstPercent = parseFloat(it.gst_percent) || 18;
    return acc + (taxable * (gstPercent / 100));
  }, 0);
  // Grand Total is Taxable + GST
  const localGrandTotal = localTaxableTotal + localGstTotal;

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
                    <h4 style={{ fontWeight: 600, color: 'var(--primary)', margin: 0 }}>{o.po}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>{new Date(o.date).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: '14px', marginTop: '8px', fontWeight: 500, color: 'var(--surface-on)' }}>{o.customer}</p>
                  <p style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: '4px' }}>
                    Value: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>₹{Number(o.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                  {o.gst_amount > 0 && (
                    <p style={{ fontSize: '11px', color: 'var(--success)', marginTop: '2px', fontWeight: 500 }}>
                      Incl. GST: ₹{Number(o.gst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  <h2 className="text-h3" style={{ margin: 0 }}>Review: {selectedPO?.po}</h2>
                  <p style={{ fontSize: '12px', color: 'var(--secondary)' }}>{selectedPO?.customer}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" onClick={saveAllItems} disabled={actionLoading} style={{ fontSize: '13px', padding: '8px 16px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span> Save Grid Data
                </button>
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
                        <div>
                          <p style={{ fontSize: '11px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location</p>
                          <p style={{ fontWeight: 600 }}>{poDetails.location_label || poDetails.city || "N/A"}</p>
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
                        <button className="btn btn-success" style={{ flex: 1 }} onClick={() => updatePOStatus('approved')} disabled={actionLoading}>Approve</button>
                        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => updatePOStatus('rejected')} disabled={actionLoading}>Reject</button>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ overflow: 'hidden', background: 'white', display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-container-high)', position: 'sticky', top: 0, zIndex: 10 }}>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'center', width: '40px', background: 'inherit' }}>#</th>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'left', minWidth: '300px', background: 'inherit' }}>Item Description / Expenses</th>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'right', width: '80px', background: 'inherit' }}>Qty</th>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'right', width: '160px', background: 'inherit' }}>Rate (₹)</th>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'right', width: '90px', background: 'inherit' }}>GST %</th>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'right', width: '200px', background: 'inherit' }}>Total (₹)</th>
                            <th style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'center', width: '50px', background: 'inherit' }}></th>
                          </tr>
                          <tr style={{ background: 'white', position: 'sticky', top: '40px', zIndex: 9 }}>
                            <td colSpan="7" style={{ border: '1px solid var(--outline-variant)', padding: '0' }}>
                              <button
                                onClick={addNewItem}
                                style={{ width: '100%', padding: '10px', border: 'none', background: 'var(--surface-container-low)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add_circle</span> Add New Row (Excel Style)
                              </button>
                            </td>
                          </tr>
                        </thead>
                        <tbody>
                          {editableItems.map((item, idx) => (
                            <tr key={item.id || idx}>
                              <td style={{ border: '1px solid var(--outline-variant)', textAlign: 'center', background: 'var(--surface-container-low)', color: 'var(--secondary)' }}>{idx + 1}</td>
                              <td style={{ border: '1px solid var(--outline-variant)' }}>
                                <div style={{ display: 'flex', gap: '8px', padding: '4px' }}>
                                  <input
                                    style={{ background: 'var(--surface-container-low)', fontSize: '10px', width: '70px', padding: '4px', border: 'none', borderRadius: '4px' }}
                                    value={item.package || ''}
                                    onChange={e => handleCellChange(idx, 'package', e.target.value)}
                                    placeholder="Pkg..."
                                  />
                                  <input
                                    style={{ flex: 1, padding: '4px', border: 'none', background: 'transparent', fontWeight: 600 }}
                                    value={item.item_name}
                                    onChange={e => handleCellChange(idx, 'item_name', e.target.value)}
                                  />
                                </div>
                              </td>
                              <td style={{ border: '1px solid var(--outline-variant)' }}>
                                <input type="number" style={{ width: '100%', padding: '10px', border: 'none', background: 'transparent', textAlign: 'right' }} value={item.quantity} onChange={e => handleCellChange(idx, 'quantity', e.target.value)} />
                              </td>
                              <td style={{ border: '1px solid var(--outline-variant)' }}>
                                <input style={{ width: '100%', padding: '10px', border: 'none', background: 'transparent', textAlign: 'right' }} value={item.rate_base} onChange={e => handleCellChange(idx, 'rate_base', e.target.value)} />
                              </td>
                              <td style={{ border: '1px solid var(--outline-variant)' }}>
                                <input type="number" style={{ width: '100%', padding: '10px', border: 'none', background: 'transparent', textAlign: 'right' }} value={item.gst_percent} onChange={e => handleCellChange(idx, 'gst_percent', e.target.value)} />
                              </td>
                              <td style={{ border: '1px solid var(--outline-variant)', padding: '10px', textAlign: 'right', fontWeight: 600, background: 'var(--surface-container-lowest)' }}>
                                ₹{parseFloat(item.total_base).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ border: '1px solid var(--outline-variant)', textAlign: 'center' }}>
                                <button className="btn-ghost" onClick={() => removeItem(idx)} style={{ color: 'var(--error)' }}><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#FFF4E5', fontWeight: 700 }}>
                            <td colSpan="5" style={{ border: '1px solid var(--outline-variant)', padding: '12px', textAlign: 'right', fontSize: '13px' }}>TAXABLE AMOUNT</td>
                            <td style={{ border: '1px solid var(--outline-variant)', padding: '12px', textAlign: 'right', fontSize: '13px' }}>
                              ₹{localTaxableTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ border: '1px solid var(--outline-variant)' }}></td>
                          </tr>
                          <tr style={{ background: '#FFF4E5', fontWeight: 700 }}>
                            <td colSpan="5" style={{ border: '1px solid var(--outline-variant)', padding: '12px', textAlign: 'right', fontSize: '13px' }}>GST AMOUNT</td>
                            <td style={{ border: '1px solid var(--outline-variant)', padding: '12px', textAlign: 'right', fontSize: '13px' }}>
                              ₹{localGstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ border: '1px solid var(--outline-variant)' }}></td>
                          </tr>
                          <tr style={{ background: 'var(--primary)', fontWeight: 700, color: 'white' }}>
                            <td colSpan="5" style={{ border: '1px solid var(--outline-variant)', padding: '16px', textAlign: 'right', fontSize: '15px' }}>TOTAL AMOUNT (INCL. GST)</td>
                            <td style={{ border: '1px solid var(--outline-variant)', padding: '16px', textAlign: 'right', fontSize: '15px' }}>
                              ₹{localGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ border: '1px solid var(--outline-variant)' }}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
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
