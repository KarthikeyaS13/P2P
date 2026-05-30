import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function ProjectsModule() {
  const { user } = useAuth();
  const [view, setView] = useState('list');
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');
  const navigate = useNavigate();

  // Verification States
  const [receivedBy, setReceivedBy] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [siteRemarks, setSiteRemarks] = useState('');
  const [itemStates, setItemStates] = useState({}); // { id: { received_qty, condition } }

  // File States
  const [files, setFiles] = useState({
    pod: null,
    signed_dc: null,
    grn: null
  });

  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    loadPendingDeliveries();
  }, []);

  const loadPendingDeliveries = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/dc', { headers });
      // Only show awaiting site confirmation
      const pending = res.data.filter(d => d.delivery_status === 'awaiting_site_confirmation');
      setDeliveries(pending);
    } catch (err) {
      /* console.error(err); */
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (dc) => {
    setLoadingDetails(true);
    setView('detail');
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/dc/${dc.id}`, { headers });
      setDetails(res.data);

      // Initialize items
      const initialItems = {};
      res.data.items.forEach(it => {
        initialItems[it.id] = { received_qty: it.quantity_dispatched, condition: 'OK' };
      });
      setItemStates(initialItems);

      setReceivedBy(user?.full_name || '');
      setPhone(user?.phone || '');
      setDesignation('');
      setSiteRemarks('');
    } catch (err) {
      /* console.error(err); */
      setView('list');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!receivedBy || !phone) {
      Swal.fire({ icon: 'warning', title: 'Missing Info', text: 'Receiver name and phone are mandatory.' });
      return;
    }

    if (phone.length !== 10) {
      Swal.fire({ icon: 'warning', title: 'Invalid Phone', text: 'Phone number must be exactly 10 digits.' });
      return;
    }

    // Validate that received_qty does not exceed quantity_dispatched
    for (const it of details.items) {
      const state = itemStates[it.id];
      const recQty = parseFloat(state?.received_qty || 0);
      if (recQty > it.quantity_dispatched) {
        Swal.fire({
          icon: 'warning',
          title: 'Validation Error',
          text: `Received quantity for "${it.item_name || it.description}" cannot exceed the sent quantity (${it.quantity_dispatched}).`
        });
        return;
      }
      if (recQty < 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Validation Error',
          text: `Received quantity for "${it.item_name || it.description}" cannot be negative.`
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const formData = new FormData();
      formData.append('receivedBy', receivedBy);
      formData.append('phone', phone);
      formData.append('designation', designation);
      formData.append('siteRemarks', siteRemarks);

      const itemsPayload = Object.keys(itemStates).map(id => ({
        id: parseInt(id),
        received_qty: parseFloat(itemStates[id].received_qty),
        condition: itemStates[id].condition
      }));
      formData.append('items', JSON.stringify(itemsPayload));

      if (files.pod) formData.append('pod', files.pod);
      if (files.signed_dc) formData.append('signed_dc', files.signed_dc);
      if (files.grn) formData.append('grn', files.grn);

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      };

      await axios.post(`/api/dc/${details.id}/confirm-delivery`, formData, { headers });

      Swal.fire({ icon: 'success', title: 'Confirmed', text: `Delivery for DC ${details.dc_number} confirmed successfully! Proceeding to Invoice Request.`, timer: 3000, showConfirmButton: false });
      navigate('/invoice-request');
    } catch (err) {
      /* console.error(err); */
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to confirm delivery' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { header: 'Delivery Challan Number', accessorKey: 'dc_number', cell: info => <span style={{ fontWeight: 700, color: '#2563EB', fontSize: '11px' }}>{info.getValue()}</span> },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Location', accessorKey: 'location_name' },
    { header: 'Dispatch Date', accessorKey: 'dispatch_date', cell: info => new Date(info.getValue()).toLocaleDateString('en-IN') },
    {
      header: 'Action',
      cell: info => (
        <button
          className="btn btn-primary"
          onClick={() => handleView(info.row.original)}
          style={{ height: '24px', padding: '0 10px', fontSize: '11px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', fontWeight: 600 }}
        >
          Verify Delivery
        </button>
      )
    }
  ], []);

  const table = useReactTable({
    data: deliveries,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (view === 'detail') {
    return (
      <div className="page-container screen-enter projects-screen" style={{ padding: '12px 16px' }}>
        <div className="page-header" style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setView('list')} className="btn-ghost btn-back" style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_back</span>
            </button>
            <h1 className="text-h2" style={{ fontSize: '14px', fontWeight: 700 }}>Project Site Delivery Verification</h1>
          </div>
        </div>

        {loadingDetails ? (
          <div className="card" style={{ padding: '24px', textAlign: 'center', fontSize: '12px' }}>Loading delivery details...</div>
        ) : details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* STEPPER */}
            <div className="card animate-slide-up" style={{ padding: '8px 24px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '12px', left: '30px', right: '30px', height: '2px', background: '#E5E7EB', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', top: '12px', left: '30px', width: '66.6%', height: '2px', background: '#10B981', zIndex: 0 }}></div>
                {[
                  { label: 'Packed', icon: 'inventory_2', active: true },
                  { label: 'Dispatched', icon: 'local_shipping', active: true },
                  { label: 'At Site', icon: 'location_on', active: true },
                  { label: 'Confirmed', icon: 'verified', active: false }
                ].map((step, idx) => (
                  <div key={idx} style={{ zIndex: 1, textAlign: 'center', background: 'white', padding: '0 8px' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: step.active ? '#10B981' : 'white',
                      border: `2px solid ${step.active ? '#10B981' : '#E5E7EB'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: step.active ? 'white' : '#9CA3AF',
                      margin: '0 auto'
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{step.active ? 'check' : 'pending'}</span>
                    </div>
                    <div style={{ fontSize: '9px', fontWeight: 700, marginTop: '2px' }}>{step.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 1: DELIVERY INFO */}
            <div className="card animate-slide-up" style={{ padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: '2px', display: 'block' }}>Delivery Challan Number</label>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1F2937' }}>{details.dc_number}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: '2px', display: 'block' }}>Vehicle</label>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1F2937' }}>{details.vehicle_no || details.vehicle_number || 'NA'}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: '2px', display: 'block' }}>Driver</label>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1F2937' }}>{details.driver_name || 'NA'}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: '2px', display: 'block' }}>Customer</label>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1F2937' }}>{details.customer_name}</div>
                </div>
              </div>
            </div>

            {/* SECTION 2: MATERIAL VERIFICATION */}
            <div className="card animate-slide-up" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
              <div style={{ padding: '6px 12px', background: '#3B82F6', color: 'white', fontWeight: 700, fontSize: '11px' }}>Material Verification Table</div>
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#F9FAFB' }}>
                    <tr style={{ height: '36px' }}>
                      <th style={{ padding: '10px 14px', height: '36px', boxSizing: 'border-box', fontSize: '12px', fontWeight: 600, color: '#475569', textAlign: 'left' }}>SL</th>
                      <th style={{ padding: '10px 14px', height: '36px', boxSizing: 'border-box', fontSize: '12px', fontWeight: 600, color: '#475569', textAlign: 'left' }}>ITEM NAME</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', height: '36px', boxSizing: 'border-box', fontSize: '12px', fontWeight: 600, color: '#475569' }}>SENT QTY</th>
                      <th style={{ textAlign: 'right', background: '#FEF3C7', padding: '10px 14px', height: '36px', boxSizing: 'border-box', fontSize: '12px', fontWeight: 600, color: '#D97706' }}>RECEIVED QTY</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px', height: '36px', boxSizing: 'border-box', fontSize: '12px', fontWeight: 600, color: '#475569' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.items.map((it, idx) => (
                      <tr key={it.id} style={{ height: '34px', borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '6px 14px', fontSize: '13px', color: '#334155' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600, padding: '6px 14px', fontSize: '13px', color: '#334155' }}>{it.item_name || it.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, padding: '6px 14px', fontSize: '13px', color: '#334155' }}>{it.quantity_dispatched}</td>
                        <td style={{ textAlign: 'right', padding: '4px 10px' }}>
                          <input
                            type="number"
                            className="form-input"
                            min="0"
                            max={it.quantity_dispatched}
                            value={itemStates[it.id]?.received_qty || 0}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              if (val > it.quantity_dispatched) {
                                Swal.fire({
                                  icon: 'warning',
                                  title: 'Invalid Quantity',
                                  text: `Received quantity cannot exceed sent quantity (${it.quantity_dispatched}).`
                                });
                                setItemStates({ ...itemStates, [it.id]: { ...itemStates[it.id], received_qty: it.quantity_dispatched } });
                              } else if (val < 0) {
                                setItemStates({ ...itemStates, [it.id]: { ...itemStates[it.id], received_qty: 0 } });
                              } else {
                                setItemStates({ ...itemStates, [it.id]: { ...itemStates[it.id], received_qty: e.target.value } });
                              }
                            }}
                            style={{ width: '70px', height: '22px', textAlign: 'right', fontSize: '11px', padding: '0 4px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center', padding: '4px 10px' }}>
                          <select
                            className="form-select"
                            value={itemStates[it.id]?.condition || 'OK'}
                            onChange={e => setItemStates({ ...itemStates, [it.id]: { ...itemStates[it.id], condition: e.target.value } })}
                            style={{ height: '22px', padding: '0 4px', fontSize: '11px', border: '1px solid #CBD5E1', borderRadius: '4px' }}
                          >
                            <option value="OK">OK</option>
                            <option value="Damaged">Damaged</option>
                            <option value="Shortage">Shortage</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 3 & 4: ACKNOWLEDGEMENT & UPLOADS */}
            <div className="responsive-grid responsive-grid--2" style={{ gap: '10px' }}>
              <div className="card animate-slide-up" style={{ padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                <h4 style={{ marginBottom: '8px', fontSize: '15px', fontWeight: 700, color: '#374151' }}>Site Acknowledgement</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '13px', color: '#4B5563', marginBottom: '2px', display: 'block' }}>Received By *</label>
                    <input
                      className="form-input"
                      value={receivedBy}
                      readOnly
                      placeholder="Full Name"
                      style={{ height: '28px', fontSize: '11px', padding: '0 6px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box', background: '#F3F4F6', color: '#6B7280', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '13px', color: '#4B5563', marginBottom: '2px', display: 'block' }}>Receiver Phone *</label>
                    <input
                      className="form-input"
                      value={phone}
                      readOnly
                      placeholder="10-digit Mobile No"
                      style={{ height: '28px', fontSize: '11px', padding: '0 6px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box', background: '#F3F4F6', color: '#6B7280', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '13px', color: '#4B5563', marginBottom: '2px', display: 'block' }}>Designation</label>
                    <input className="form-input" value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. Site Engineer" style={{ height: '28px', fontSize: '11px', padding: '0 6px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '8px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '10px', color: '#4B5563', marginBottom: '2px', display: 'block' }}>Site Remarks</label>
                  <textarea className="form-input" rows="2" value={siteRemarks} onChange={e => setSiteRemarks(e.target.value)} placeholder="Notes about installation..." style={{ resize: 'none', fontSize: '11px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }}></textarea>
                </div>
              </div>

              <div className="card animate-slide-up" style={{ padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                <h4 style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 700, color: '#374151' }}>Document Uploads</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {files.pod ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', background: '#F8FAFC', height: '28px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {files.pod.name?.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                          <img
                            src={URL.createObjectURL(files.pod)}
                            alt="POD preview"
                            style={{ height: '20px', width: '28px', objectFit: 'cover', borderRadius: '2px', cursor: 'pointer', border: '1px solid #CBD5E1' }}
                            onClick={() => setPreviewImage({ url: URL.createObjectURL(files.pod), name: files.pod.name })}
                          />
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#64748B' }}>description</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#334155', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }} title={files.pod.name}>
                          {files.pod.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {files.pod.name?.match(/\.(jpeg|jpg|png|gif|webp)$/i) && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: URL.createObjectURL(files.pod), name: files.pod.name })}
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#2563EB' }}
                            title="Preview Image"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>visibility</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setFiles({ ...files, pod: null })}
                          style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#EF4444' }}
                          title="Remove File"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-btn-wrapper" style={{ position: 'relative', overflow: 'hidden', display: 'inline-block', width: '100%' }}>
                      <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11px', border: '1px dashed #CBD5E1', height: '28px', padding: '0 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                        Upload POD (Proof of Delivery)
                      </button>
                      <input type="file" onChange={e => setFiles({ ...files, pod: e.target.files[0] })} style={{ fontSize: '100px', position: 'absolute', left: 0, top: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}

                  {files.signed_dc ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', background: '#F8FAFC', height: '28px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {files.signed_dc.name?.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                          <img
                            src={URL.createObjectURL(files.signed_dc)}
                            alt="Signed DC preview"
                            style={{ height: '20px', width: '28px', objectFit: 'cover', borderRadius: '2px', cursor: 'pointer', border: '1px solid #CBD5E1' }}
                            onClick={() => setPreviewImage({ url: URL.createObjectURL(files.signed_dc), name: files.signed_dc.name })}
                          />
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#64748B' }}>description</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#334155', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }} title={files.signed_dc.name}>
                          {files.signed_dc.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {files.signed_dc.name?.match(/\.(jpeg|jpg|png|gif|webp)$/i) && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: URL.createObjectURL(files.signed_dc), name: files.signed_dc.name })}
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#2563EB' }}
                            title="Preview Image"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>visibility</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setFiles({ ...files, signed_dc: null })}
                          style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#EF4444' }}
                          title="Remove File"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-btn-wrapper" style={{ position: 'relative', overflow: 'hidden', display: 'inline-block', width: '100%' }}>
                      <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11px', border: '1px dashed #CBD5E1', height: '28px', padding: '0 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                        Upload Signed DC Copy
                      </button>
                      <input type="file" onChange={e => setFiles({ ...files, signed_dc: e.target.files[0] })} style={{ fontSize: '100px', position: 'absolute', left: 0, top: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-ghost" onClick={() => setView('list')} disabled={submitting} style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}>Cancel</button>
              <button className="btn btn-danger" disabled={submitting} style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}>Raise Delivery Issue</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmDelivery}
                disabled={submitting}
                style={{ background: '#10B981', padding: '0 20px', fontWeight: 700, height: '30px', fontSize: '12px', border: 'none', borderRadius: '4px', color: 'white' }}
              >
                {submitting ? 'Confirming...' : 'Confirm Delivery'}
              </button>
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
      </div>
    );
  }

  return (
    <div className="page-container screen-enter projects-screen" style={{ padding: '12px 16px' }}>
      <div className="page-header" style={{ marginBottom: '10px' }}>
        <div>
          <h1 className="text-h2" style={{ fontSize: '24px', fontWeight: 700 }}>Project Management</h1>
          <p className="text-p" style={{ fontSize: '11px', color: '#64748B' }}>Track material arrival at site and provide on-field acknowledgment.</p>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
        <table className="data-table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} style={{ padding: '10px 14px', height: '36px', boxSizing: 'border-box', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '12px' }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', fontSize: '13px' }}>Searching for active deliveries...</td></tr>
            ) : deliveries.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', fontSize: '13px' }}>All project deliveries confirmed!</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9', height: '32px' }}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '6px 14px', height: '32px', boxSizing: 'border-box', verticalAlign: 'middle', fontSize: '13px', color: '#334155' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
