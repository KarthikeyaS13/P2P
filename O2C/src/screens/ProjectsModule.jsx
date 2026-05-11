import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function ProjectsModule() {
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

  useEffect(() => {
    loadPendingDeliveries();
  }, []);

  const loadPendingDeliveries = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:3000/api/dc', { headers });
      // Only show awaiting site confirmation
      const pending = res.data.filter(d => d.delivery_status === 'awaiting_site_confirmation');
      setDeliveries(pending);
    } catch (err) {
      console.error(err);
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
      const res = await axios.get(`http://localhost:3000/api/dc/${dc.id}`, { headers });
      setDetails(res.data);
      
      // Initialize items
      const initialItems = {};
      res.data.items.forEach(it => {
        initialItems[it.id] = { received_qty: it.quantity_dispatched, condition: 'OK' };
      });
      setItemStates(initialItems);
      
      setReceivedBy('');
      setPhone('');
      setDesignation('');
      setSiteRemarks('');
    } catch (err) {
      console.error(err);
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

      await axios.post(`http://localhost:3000/api/dc/${details.id}/confirm-delivery`, formData, { headers });
      
      Swal.fire({ icon: 'success', title: 'Confirmed', text: `Delivery for DC ${details.dc_number} confirmed successfully! Proceeding to Invoice Request.`, timer: 3000, showConfirmButton: false });
      navigate('/invoice-request');
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to confirm delivery' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { header: 'DC Number', accessorKey: 'dc_number', cell: info => <span style={{ fontWeight: 700, color: '#2563EB' }}>{info.getValue()}</span> },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Location', accessorKey: 'location_name' },
    { header: 'Dispatch Date', accessorKey: 'dispatch_date', cell: info => new Date(info.getValue()).toLocaleDateString() },
    {
      header: 'Action',
      cell: info => (
        <button className="btn btn-primary" onClick={() => handleView(info.row.original)} style={{ padding: '4px 12px', fontSize: '10px' }}>
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
      <div className="page-container screen-enter">
        <div className="page-header" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setView('list')} className="btn-ghost btn-back" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
            </button>
            <h1 className="text-h2" style={{ fontSize: '15px' }}>Project Site Delivery Verification</h1>
          </div>
        </div>

        {loadingDetails ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Loading delivery details...</div>
        ) : details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* STEPPER */}
            <div className="card animate-slide-up" style={{ padding: '20px 40px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '15px', left: '40px', right: '40px', height: '2px', background: '#E5E7EB', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', top: '15px', left: '40px', width: '66.6%', height: '2px', background: '#10B981', zIndex: 0 }}></div>
                {[
                  { label: 'Packed', icon: 'inventory_2', active: true },
                  { label: 'Dispatched', icon: 'local_shipping', active: true },
                  { label: 'At Site', icon: 'location_on', active: true },
                  { label: 'Confirmed', icon: 'verified', active: false }
                ].map((step, idx) => (
                  <div key={idx} style={{ zIndex: 1, textAlign: 'center', background: 'white', padding: '0 10px' }}>
                    <div style={{ 
                      width: '32px', 
                      height: '32px', 
                      borderRadius: '50%', 
                      background: step.active ? '#10B981' : 'white', 
                      border: `2px solid ${step.active ? '#10B981' : '#E5E7EB'}`, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: step.active ? 'white' : '#9CA3AF' 
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{step.active ? 'check' : 'pending'}</span>
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '4px' }}>{step.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 1: DELIVERY INFO */}
            <div className="card animate-slide-up" style={{ padding: '20px', background: '#F8FAFC' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '8px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800 }}>DC Number</label>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{details.dc_number}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '8px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800 }}>Vehicle</label>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{details.vehicle_number || 'NA'}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '8px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800 }}>Driver</label>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{details.driver_name || 'NA'}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '8px', color: '#64748B', textTransform: 'uppercase', fontWeight: 800 }}>Customer</label>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{details.customer_name}</div>
                </div>
              </div>
            </div>

            {/* SECTION 2: MATERIAL VERIFICATION */}
            <div className="card animate-slide-up" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', background: '#3B82F6', color: 'white', fontWeight: 700, fontSize: '12px' }}>Material Verification Table</div>
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <thead style={{ background: '#F9FAFB' }}>
                    <tr>
                      <th>SL</th>
                      <th>ITEM DESCRIPTION</th>
                      <th style={{ textAlign: 'right' }}>SENT QTY</th>
                      <th style={{ textAlign: 'right', background: '#FEF3C7' }}>RECEIVED QTY</th>
                      <th style={{ textAlign: 'center' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.items.map((it, idx) => (
                      <tr key={it.id}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{it.item_name || it.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{it.quantity_dispatched}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input 
                            type="number" 
                            className="input-field"
                            value={itemStates[it.id]?.received_qty || 0}
                            onChange={e => setItemStates({...itemStates, [it.id]: { ...itemStates[it.id], received_qty: e.target.value }})}
                            style={{ width: '80px', height: '24px', textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <select 
                            className="input-field"
                            value={itemStates[it.id]?.condition || 'OK'}
                            onChange={e => setItemStates({...itemStates, [it.id]: { ...itemStates[it.id], condition: e.target.value }})}
                            style={{ height: '24px', padding: '0 4px', fontSize: '10px' }}
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
            <div className="responsive-grid responsive-grid--2" style={{ gap: '16px' }}>
              <div className="card animate-slide-up" style={{ padding: '20px' }}>
                <h4 style={{ marginBottom: '16px', fontSize: '12px', fontWeight: 700 }}>Site Acknowledgement</h4>
                <div className="responsive-grid responsive-grid--2" style={{ gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Received By *</label>
                    <input className="form-input" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Full Name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Receiver Phone *</label>
                    <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile No" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Designation</label>
                    <input className="form-input" value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. Site Engineer" />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label className="form-label">Site Remarks</label>
                  <textarea className="form-input" rows="2" value={siteRemarks} onChange={e => setSiteRemarks(e.target.value)} placeholder="Notes about installation or site condition..."></textarea>
                </div>
              </div>

              <div className="card animate-slide-up" style={{ padding: '20px' }}>
                <h4 style={{ marginBottom: '16px', fontSize: '12px', fontWeight: 700 }}>Document Uploads</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="upload-btn-wrapper">
                    <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11px', border: '1px dashed #D1D5DB' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                      {files.pod ? files.pod.name : 'Upload POD (Proof of Delivery)'}
                    </button>
                    <input type="file" onChange={e => setFiles({...files, pod: e.target.files[0]})} />
                  </div>
                  <div className="upload-btn-wrapper">
                    <button className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11px', border: '1px dashed #D1D5DB' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                      {files.signed_dc ? files.signed_dc.name : 'Upload Signed DC Copy'}
                    </button>
                    <input type="file" onChange={e => setFiles({...files, signed_dc: e.target.files[0]})} />
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setView('list')} disabled={submitting}>Cancel</button>
              <button className="btn btn-danger" disabled={submitting}>Raise Delivery Issue</button>
              <button 
                className="btn btn-primary" 
                onClick={handleConfirmDelivery}
                disabled={submitting}
                style={{ background: '#10B981', padding: '0 32px', fontWeight: 700 }}
              >
                {submitting ? 'Confirming...' : 'Confirm Delivery & Accept Site'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-container screen-enter">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="text-h2" style={{ fontSize: '18px' }}>Project Management</h1>
          <p className="text-p" style={{ fontSize: '12px' }}>Track material arrival at site and provide on-field acknowledgment.</p>
        </div>
      </div>
      
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} style={{ padding: '12px 16px' }}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>Searching for active deliveries...</td></tr>
            ) : deliveries.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>All project deliveries confirmed!</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '12px 16px' }}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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
