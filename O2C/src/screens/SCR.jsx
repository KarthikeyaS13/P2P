import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, getFileUrl } from '../config';

export default function SCR() {
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();
  const navigate = useNavigate();

  const [view, setView] = useState('list'); // 'list', 'new', 'detail'
  const [scrs, setScrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState([]);
  const [selectedSCR, setSelectedSCR] = useState(null);
  const [selectedPODetails, setSelectedPODetails] = useState(null);
  const [serviceItems, setServiceItems] = useState([]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form States
  const [selectedPOId, setSelectedPOId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [pmName, setPmName] = useState('');
  const [pmPhone, setPmPhone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState(null);

  // Checklist States
  const [civilCompleted, setCivilCompleted] = useState(false);
  const [powerAvailable, setPowerAvailable] = useState(false);
  const [storageSecured, setStorageSecured] = useState(false);
  const [accessCleared, setAccessCleared] = useState(false);
  const [safetyEquipment, setSafetyEquipment] = useState(false);

  // Review state
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadSCRs();
    if (role === 'projects' || role === 'admin') {
      loadPOs();
    }
  }, [role]);

  useEffect(() => {
    const fetchPODetails = async () => {
      if (!selectedPOId) {
        setSelectedPODetails(null);
        setServiceItems([]);
        return;
      }
      try {
        const token = sessionStorage.getItem('token');
        const res = await axios.get(`/api/pos/${selectedPOId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSelectedPODetails(res.data);
        // Find service items (where service_qty > 0)
        const items = (res.data.items || [])
          .filter(item => (parseFloat(item.service_qty) || 0) > 0)
          .map(item => {
            const remaining = Math.max(0, (parseFloat(item.service_qty) || 0) - (parseFloat(item.qty_invoiced) || 0));
            return {
              ...item,
              remaining_qty: remaining,
              invoice_qty: remaining
            };
          });
        setServiceItems(items);
      } catch (err) {
        console.error('Error fetching PO details:', err);
      }
    };
    fetchPODetails();
  }, [selectedPOId]);

  const handleSelectSCR = async (s) => {
    setSelectedSCR(s);
    setView('detail');
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`/api/scr/${s.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const enriched = {
        ...res.data,
        items: (res.data.items || []).map(it => {
          const balance = Math.max(0, parseFloat(it.service_qty) - (parseFloat(it.invoiced_qty) || 0));
          return {
            ...it,
            qty_to_raise: balance > 0 ? balance : 0
          };
        })
      };
      setSelectedSCR(enriched);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to load SCR details.', 'error');
    }
  };

  const handleQtyToRaiseChange = (itemId, val) => {
    setSelectedSCR(prev => {
      if (!prev || !prev.items) return prev;
      return {
        ...prev,
        items: prev.items.map(it => {
          if (it.id === itemId) {
            return { ...it, qty_to_raise: val };
          }
          return it;
        })
      };
    });
  };

  const handleRaiseServiceInvoiceRequest = async () => {
    if (!selectedSCR || !selectedSCR.items) return;

    const itemsToRaise = selectedSCR.items.map(it => ({
      scr_line_item_id: it.id,
      item_name: it.item_name,
      qty_to_raise: parseFloat(it.qty_to_raise) || 0,
      balance_qty: Math.max(0, parseFloat(it.service_qty) - (parseFloat(it.invoiced_qty) || 0))
    })).filter(it => it.qty_to_raise > 0);

    if (itemsToRaise.length === 0) {
      Swal.fire('Warning', 'Please enter a "Qty To Raise" greater than 0 for at least one item.', 'warning');
      return;
    }

    for (const it of itemsToRaise) {
      if (it.qty_to_raise < 0) {
        Swal.fire('Warning', `Quantity to raise for ${it.item_name} cannot be negative.`, 'warning');
        return;
      }
      if (it.qty_to_raise > it.balance_qty) {
        Swal.fire('Warning', `Quantity to raise for ${it.item_name} (${it.qty_to_raise}) exceeds the available balance quantity (${it.balance_qty}).`, 'warning');
        return;
      }
    }

    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.post(`/api/scr/${selectedSCR.id}/raise-invoice-request`, {
        items: itemsToRaise
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Swal.fire('Success', `Service Invoice Request ${res.data.invoice_number} raised successfully!`, 'success');
      setView('list');
      setSelectedSCR(null);
      loadSCRs();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.response?.data?.error || 'Failed to raise service invoice request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const showFullDescription = (desc, name) => {
    if (!desc) return;
    Swal.fire({
      title: name || 'Item Description',
      text: desc,
      icon: 'info',
      confirmButtonColor: 'var(--primary)',
    });
  };

  const loadSCRs = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get('/api/scr', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScrs(res.data);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to load SCR requests.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPOs = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get('/api/pos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter POs that are approved/accepted/active
      const activePOs = res.data.filter(p =>
        ['approved', 'active', 'accepted', 'dc_raised', 'invoice_raised'].includes(p.status?.toLowerCase())
      );
      setPos(activePOs);
    } catch (err) {
      console.error(err);
    }
  };

  const selectedPO = pos.find(p => String(p.id) === String(selectedPOId));
  const selectedPOLocation = selectedPO ? {
    label: selectedPO.location_name,
    address_line1: selectedPO.location_address,
    city: selectedPO.location_city,
    state: selectedPO.location_state,
    pincode: selectedPO.location_pincode
  } : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPOId) {
      Swal.fire('Warning', 'Please select a Sales Order.', 'warning');
      return;
    }
    if (!expectedDate) {
      Swal.fire('Warning', 'Please select an expected delivery date.', 'warning');
      return;
    }
    if (!pmName.trim() || !pmPhone.trim()) {
      Swal.fire('Warning', 'Please enter Project Manager details.', 'warning');
      return;
    }
    if (pmPhone.trim().length !== 10 || /\D/.test(pmPhone.trim())) {
      Swal.fire('Warning', 'Project Manager phone must be exactly 10 digits.', 'warning');
      return;
    }

    for (const item of serviceItems) {
      const val = parseFloat(item.invoice_qty);
      if (isNaN(val) || val < 0 || val > item.remaining_qty) {
        Swal.fire('Warning', `Invoice quantity for ${item.item_name} must be between 0 and ${item.remaining_qty}.`, 'warning');
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const formData = new FormData();
      formData.append('po_id', selectedPOId);
      formData.append('location_id', selectedPO.location_id);
      formData.append('expected_delivery_date', expectedDate);
      formData.append('pm_name', pmName);
      formData.append('pm_phone', pmPhone);
      formData.append('civil_completed', civilCompleted ? 'true' : 'false');
      formData.append('power_available', powerAvailable ? 'true' : 'false');
      formData.append('storage_secured', storageSecured ? 'true' : 'false');
      formData.append('access_cleared', accessCleared ? 'true' : 'false');
      formData.append('safety_equipment', safetyEquipment ? 'true' : 'false');
      formData.append('remarks', remarks);
      formData.append('items', JSON.stringify(serviceItems.map(it => ({
        po_line_item_id: it.id,
        service_qty: parseFloat(it.service_qty) || 0,
        invoice_qty: parseFloat(it.invoice_qty) || 0
      }))));

      if (file) {
        formData.append('file', file);
      }

      await axios.post('/api/scr', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      Swal.fire('Success', 'SCR raised successfully!', 'success');
      setView('list');
      resetForm();
      loadSCRs();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.response?.data?.error || 'Failed to submit SCR request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (status) => {
    if (!selectedSCR) return;
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      await axios.put(`/api/scr/${selectedSCR.id}/status`, {
        status,
        remarks: reviewRemarks
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Swal.fire('Success', `SCR ${status} successfully!`, 'success');
      setView('list');
      setSelectedSCR(null);
      setReviewRemarks('');
      loadSCRs();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.response?.data?.error || 'Failed to review SCR request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedPOId('');
    setExpectedDate('');
    setPmName('');
    setPmPhone('');
    setRemarks('');
    setFile(null);
    setCivilCompleted(false);
    setPowerAvailable(false);
    setStorageSecured(false);
    setAccessCleared(false);
    setSafetyEquipment(false);
    setSelectedPODetails(null);
    setServiceItems([]);
  };

  const filteredSCRs = scrs.filter(s => {
    const matchesSearch =
      (s.scr_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.po_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.pm_name || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && s.status === statusFilter;
  });

  const getStatusBadge = (status) => {
    const style = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: '2px 6px',
      borderRadius: '10px',
      fontSize: '10px',
      fontWeight: '600',
      textTransform: 'uppercase'
    };

    if (status === 'approved') {
      return (
        <span style={{ ...style, background: '#D1FAE5', color: '#065F46' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check_circle</span>
          Approved
        </span>
      );
    } else if (status === 'rejected') {
      return (
        <span style={{ ...style, background: '#FEE2E2', color: '#991B1B' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>cancel</span>
          Rejected
        </span>
      );
    } else {
      return (
        <span style={{ ...style, background: '#FEF3C7', color: '#92400E' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>hourglass_empty</span>
          Pending
        </span>
      );
    }
  };

  const getInvoicingStatusBadge = (status) => {
    switch (status) {
      case 'fully_invoiced':
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: '700',
            background: '#D1FAE5',
            color: '#065F46',
            textTransform: 'uppercase'
          }}>
            Fully Invoiced
          </span>
        );
      case 'partially_invoiced':
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: '700',
            background: '#FEF3C7',
            color: '#92400E',
            textTransform: 'uppercase'
          }}>
            Partially Invoiced
          </span>
        );
      default:
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: '700',
            background: '#F1F5F9',
            color: '#475569',
            textTransform: 'uppercase'
          }}>
            Not Billed
          </span>
        );
    }
  };

  return (
    <div className="page-container screen-enter scr-container" style={{ padding: '12px 16px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h1 className="text-h1" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary)' }}>assignment_turned_in</span>
            Service Credit Request (SCR)
          </h1>
          <p style={{ fontSize: '10px', color: '#64748B', marginTop: '1px', margin: 0 }}>
            Verify site readiness before materials dispatch confirmation.
          </p>
        </div>

        {view !== 'list' && (
          <button
            className="btn btn-ghost"
            onClick={() => { setView('list'); setSelectedSCR(null); resetForm(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--outline-variant)', height: '28px', padding: '0 12px', fontSize: '11px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>arrow_back</span>
            Back to List
          </button>
        )}
      </div>

      {/* VIEW: LIST OF SCRs */}
      {view === 'list' && (
        <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* SEARCH AND FILTERS BAR */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            background: 'white',
            padding: '6px 12px',
            borderRadius: '6px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '16px' }}>search</span>
                <input
                  type="text"
                  placeholder="Search SCR #, Sales Order, Customer or PM..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '28px',
                    padding: '0 8px 0 28px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '11px',
                    outline: 'none',
                    background: '#F8FAFC',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  flex: '0 0 140px',
                  height: '28px',
                  padding: '0 8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  background: '#F8FAFC',
                  fontSize: '11px',
                  cursor: 'pointer',
                  color: '#334155',
                  outline: 'none'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {filteredSCRs.length} Results
            </div>
          </div>

          {/* TABLE OF SCRs CARD */}
          <div className="card data-table-wrapper" style={{ padding: '0px', borderRadius: '6px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>SCR Number</th>
                    <th>Sales Order No</th>
                    <th>Customer</th>
                    <th>Delivery Site</th>
                    <th>Exp Delivery</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Invoiced</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                        Loading Site Clearance Requests...
                      </td>
                    </tr>
                  ) : filteredSCRs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                        No Site Clearance Requests found.
                      </td>
                    </tr>
                  ) : (
                    filteredSCRs.map(s => (
                      <tr key={s.id} className="table-row-hover">
                        <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{s.scr_number}</td>
                        <td style={{ fontWeight: '600' }}>{s.po_no}</td>
                        <td>{s.customer_name}</td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{s.location_label}</div>
                          <div style={{ fontSize: '9px', color: '#64748B' }}>{s.location_city}, {s.location_state}</div>
                        </td>
                        <td>
                          {s.expected_delivery_date ? new Date(s.expected_delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'NA'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {getStatusBadge(s.status)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {getInvoicingStatusBadge(s.invoicing_status)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleSelectSCR(s)}
                            style={{
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: '600',
                              border: '1px solid #E2E8F0',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              height: '24px'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility</span>
                            Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: RAISE NEW SCR */}
      {view === 'new' && (
        <form onSubmit={handleSubmit} className="animate-slide-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* COLUMN 1: SITE & PM INFO */}
          <div className="card" style={{ padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
              Site & Project Details
            </h2>

            <div style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '2px', fontSize: '11px' }}>Select Sales Order *</label>
              <select
                value={selectedPOId}
                onChange={e => setSelectedPOId(e.target.value)}
                required
                className="form-select"
                style={{ width: '100%', height: '28px', borderRadius: '4px', fontSize: '11px', padding: '0 8px' }}
              >
                <option value="">-- Choose Sales Order --</option>
                {pos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.po_number} ({p.customer_name})
                  </option>
                ))}
              </select>
            </div>

            {selectedPO && (
              <div style={{ background: '#F8FAFC', borderRadius: '4px', padding: '6px 10px', marginBottom: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Customer</label>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#1E293B' }}>{selectedPO.customer_name}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Site Location</label>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#1E293B' }}>
                      {selectedPOLocation ? selectedPOLocation.label : 'NA'}
                    </div>
                  </div>
                </div>
                {selectedPOLocation && (
                  <div style={{ marginTop: '4px', borderTop: '1px dashed #CBD5E1', paddingTop: '4px' }}>
                    <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Detailed Site Address</label>
                    <div style={{ fontSize: '10px', color: '#475569' }}>
                      {selectedPOLocation.address_line1}, {selectedPOLocation.city}, {selectedPOLocation.state} - {selectedPOLocation.pincode}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '2px', fontSize: '11px' }}>Expected Delivery Date *</label>
              <input
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                required
                className="form-input"
                style={{ width: '100%', height: '28px', borderRadius: '4px', fontSize: '11px', padding: '0 8px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '2px', fontSize: '11px' }}>Project Manager Name *</label>
                <input
                  type="text"
                  placeholder="Enter name"
                  value={pmName}
                  onChange={e => setPmName(e.target.value)}
                  required
                  className="form-input"
                  style={{ width: '100%', height: '28px', borderRadius: '4px', fontSize: '11px', padding: '0 8px' }}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '2px', fontSize: '11px' }}>Project Manager Phone *</label>
                <input
                  type="text"
                  maxLength="10"
                  placeholder="10-digit mobile"
                  value={pmPhone}
                  onChange={e => setPmPhone(e.target.value)}
                  required
                  className="form-input"
                  style={{ width: '100%', height: '28px', borderRadius: '4px', fontSize: '11px', padding: '0 8px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '2px', fontSize: '11px' }}>Remarks / Site Notes</label>
              <textarea
                placeholder="Describe additional site observations or logistics details..."
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '42px', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', resize: 'none' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '2px', fontSize: '11px' }}>Upload Site Photos / Clearance Certificate</label>
              <input
                type="file"
                onChange={e => setFile(e.target.files[0])}
                className="form-input"
                style={{ width: '100%', padding: '2px 4px', fontSize: '10px', height: '26px' }}
              />
              <p style={{ fontSize: '9px', color: '#64748B', marginTop: '1px', margin: 0 }}>Images or PDF clearance report.</p>
            </div>
          </div>

          {/* COLUMN 2: READINESS CHECKLIST */}
          <div className="card" style={{ padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Site Readiness Checklist
              </h2>
              <p style={{ fontSize: '10px', color: '#64748B', marginBottom: '8px' }}>
                Please verify that the following checklist items are met at the customer site.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: 'pointer', background: civilCompleted ? '#ECFDF5' : 'white', transition: '0.2s' }}>
                  <input
                    type="checkbox"
                    checked={civilCompleted}
                    onChange={e => setCivilCompleted(e.target.checked)}
                    style={{ width: '14px', height: '14px', accentColor: '#10B981' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '11px', color: '#1E293B' }}>Civil Foundation / Placement Completed</div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>Site foundation is structurally ready for equipment placement.</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: 'pointer', background: powerAvailable ? '#ECFDF5' : 'white', transition: '0.2s' }}>
                  <input
                    type="checkbox"
                    checked={powerAvailable}
                    onChange={e => setPowerAvailable(e.target.checked)}
                    style={{ width: '14px', height: '14px', accentColor: '#10B981' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '11px', color: '#1E293B' }}>Stable Power Supply & Earthing</div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>Adequate electricity source is installed and tested.</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: 'pointer', background: storageSecured ? '#ECFDF5' : 'white', transition: '0.2s' }}>
                  <input
                    type="checkbox"
                    checked={storageSecured}
                    onChange={e => setStorageSecured(e.target.checked)}
                    style={{ width: '14px', height: '14px', accentColor: '#10B981' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '11px', color: '#1E293B' }}>Material Storage Area Secured</div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>Dedicated covered/fenced area to safely secure incoming goods.</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: 'pointer', background: accessCleared ? '#ECFDF5' : 'white', transition: '0.2s' }}>
                  <input
                    type="checkbox"
                    checked={accessCleared}
                    onChange={e => setAccessCleared(e.target.checked)}
                    style={{ width: '14px', height: '14px', accentColor: '#10B981' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '11px', color: '#1E293B' }}>Heavy Vehicle Site Access Clear</div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>Roadways and gateways clear for cargo truck unloading.</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: 'pointer', background: safetyEquipment ? '#ECFDF5' : 'white', transition: '0.2s' }}>
                  <input
                    type="checkbox"
                    checked={safetyEquipment}
                    onChange={e => setSafetyEquipment(e.target.checked)}
                    style={{ width: '14px', height: '14px', accentColor: '#10B981' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '11px', color: '#1E293B' }}>Handling Equipment & Safety Gear</div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>Cranes, forklifts, helmets, and safety gear are available on site.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* COLUMN 3: SERVICE LINE ITEMS */}
          {selectedPO && (
            <div className="card" style={{ gridColumn: 'span 2', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Service Line Items Invoicing Details
              </h2>
              {serviceItems.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#64748B', padding: '8px 4px' }}>
                  This Sales Order has no service line items.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        <th>Package Name</th>
                        <th>Item Name</th>
                        <th>Description <span style={{ fontSize: '8px', color: '#64748B', textTransform: 'none', fontWeight: 'normal' }}>(click to view)</span></th>
                        <th>UOM</th>
                        <th style={{ textAlign: 'right' }}>Total Service Qty</th>
                        <th style={{ textAlign: 'right' }}>Already Invoiced</th>
                        <th style={{ textAlign: 'right' }}>Remaining Qty</th>
                        <th style={{ textAlign: 'center', width: '130px' }}>Invoice Qty to Set</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceItems.map((item, index) => (
                        <tr key={item.id} style={{ height: '32px' }}>
                          <td style={{ fontWeight: '500' }}>{item.package_name || '-'}</td>
                          <td>{item.item_name}</td>
                          <td
                            onClick={() => showFullDescription(item.description, item.item_name)}
                            style={{
                              color: '#64748B',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer'
                            }}
                            title={item.description}
                          >
                            {item.description || '-'}
                          </td>
                          <td>{item.uom || 'Nos'}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>{item.service_qty}</td>
                          <td style={{ textAlign: 'right', color: '#64748B' }}>{item.qty_invoiced || 0}</td>
                          <td style={{ textAlign: 'right', color: '#059669', fontWeight: '600' }}>{item.remaining_qty}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              max={item.remaining_qty}
                              step="any"
                              value={item.invoice_qty}
                              onChange={e => {
                                const val = parseFloat(e.target.value);
                                const updated = [...serviceItems];
                                updated[index].invoice_qty = isNaN(val) ? '' : val;
                                setServiceItems(updated);
                              }}
                              style={{
                                width: '100px',
                                height: '24px',
                                borderRadius: '4px',
                                border: '1px solid #CBD5E1',
                                textAlign: 'right',
                                padding: '0 4px',
                                fontSize: '11px'
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* BOTTOM ROW: ACTIONS */}
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setView('list'); resetForm(); }}
              disabled={submitting}
              style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ padding: '0 14px', fontWeight: '700', height: '28px', fontSize: '11px' }}
            >
              {submitting ? 'Submitting...' : 'Submit SCR'}
            </button>
          </div>
        </form>
      )}

      {/* VIEW: SCR DETAIL / REVIEW */}
      {view === 'detail' && selectedSCR && (
        <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* DETAILS BOX */}
          <div className="card" style={{ padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
              <div>
                <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase' }}>Request Details</span>
                <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#1E293B', margin: 0 }}>{selectedSCR.scr_number}</h3>
              </div>
              <div>{getStatusBadge(selectedSCR.status)}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Sales Order No</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>{selectedSCR.po_no}</div>
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Customer Name</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>{selectedSCR.customer_name}</div>
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Expected Delivery Date</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>
                    {selectedSCR.expected_delivery_date ? new Date(selectedSCR.expected_delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'NA'}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Created By</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>{selectedSCR.creator_name || 'System'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Project Manager</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>{selectedSCR.pm_name || 'NA'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>PM Phone</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px' }}>{selectedSCR.pm_phone || 'NA'}</div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Delivery Location</label>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${selectedSCR.location_label} - ${selectedSCR.location_address}, ${selectedSCR.location_city}, ${selectedSCR.location_state}`}>
                    <strong>{selectedSCR.location_label}</strong>: {selectedSCR.location_address}, {selectedSCR.location_city}, {selectedSCR.location_state}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '10px', borderTop: '1px solid #F1F5F9', paddingTop: '6px', marginTop: '2px', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Remarks</label>
                  <div style={{ fontSize: '11px', color: '#334155', marginTop: '1px', background: '#F8FAFC', padding: '3px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedSCR.remarks || 'No remarks provided.'}>
                    {selectedSCR.remarks || 'No remarks provided.'}
                  </div>
                </div>
                {selectedSCR.file_path ? (
                  <div>
                    <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Clearance File</label>
                    <a
                      href={getFileUrl(selectedSCR.file_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '10px', height: '22px', background: 'white' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>download</span>
                      Download File
                    </a>
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: '9px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Clearance File</label>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>No attachment</span>
                  </div>
                )}
              </div>
            </div>

            {/* REVIEW FORM SECTION (FOR ACCOUNTS / ADMIN IN PENDING STATE) */}
            {selectedSCR.status === 'pending' && (role === 'accounts' || role === 'admin') && (
              <div style={{ marginTop: '12px', borderTop: '2px solid #F1F5F9', paddingTop: '8px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: '700', color: '#1E293B', marginBottom: '4px' }}>Action & Review Comments</h4>
                <textarea
                  placeholder="Enter approval/rejection comments here..."
                  value={reviewRemarks}
                  onChange={e => setReviewRemarks(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '42px', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', resize: 'none' }}
                />
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setView('list'); setSelectedSCR(null); }}
                style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
              >
                Close Details
              </button>
              {selectedSCR.status === 'pending' && (role === 'accounts' || role === 'admin') && (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleReview('rejected')}
                    disabled={submitting}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700', height: '28px', padding: '0 12px', fontSize: '11px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                    Reject
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleReview('approved')}
                    disabled={submitting}
                    style={{ background: '#10B981', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', color: 'white', fontWeight: '700', height: '28px', padding: '0 12px', fontSize: '11px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
                    Approve Clearance
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedSCR.items && selectedSCR.items.length > 0 && (() => {
        const isProjectsOrAdmin = (role === 'projects' || role === 'admin');
        const hasRemainingQty = selectedSCR.items.some(item => (parseFloat(item.service_qty) - (parseFloat(item.invoiced_qty) || 0)) > 0);
        const canRaise = isProjectsOrAdmin && hasRemainingQty && selectedSCR.status !== 'rejected';

        return (
          <div className="card" style={{ padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
              Service Line Items Invoicing Details
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Package Name</th>
                    <th>Item Name</th>
                    <th>Description <span style={{ fontSize: '8px', color: '#64748B', textTransform: 'none', fontWeight: 'normal' }}>(click to view)</span></th>
                    <th>UOM</th>
                    <th style={{ textAlign: 'right' }}>Total Service Qty</th>
                    <th style={{ textAlign: 'right' }}>Already Raised Qty</th>
                    <th style={{ textAlign: 'right' }}>Balance Qty</th>
                    <th style={{ textAlign: 'center', width: canRaise ? '180px' : '100px' }}>
                      {canRaise ? 'Qty To Raise' : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSCR.items.map((item) => {
                    const totalQty = parseFloat(item.service_qty) || 0;
                    const raisedQty = parseFloat(item.invoiced_qty) || 0;
                    const balanceQty = Math.max(0, totalQty - raisedQty);

                    return (
                      <tr key={item.id} style={{ height: '32px' }}>
                        <td style={{ fontWeight: '500' }}>{item.package_name || '-'}</td>
                        <td>{item.item_name}</td>
                        <td
                          onClick={() => showFullDescription(item.description, item.item_name)}
                          style={{
                            color: '#64748B',
                            maxWidth: '250px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                          title={item.description}
                        >
                          {item.description || '-'}
                        </td>
                        <td>{item.uom || 'Nos'}</td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>{totalQty}</td>
                        <td style={{ textAlign: 'right', color: '#64748B' }}>{raisedQty}</td>
                        <td style={{ textAlign: 'right', color: '#059669', fontWeight: '600' }}>{balanceQty}</td>
                        <td style={{ textAlign: 'center' }}>
                          {canRaise ? (
                            balanceQty <= 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <input
                                  type="number"
                                  disabled
                                  value={0}
                                  style={{
                                    width: '70px',
                                    height: '24px',
                                    borderRadius: '4px',
                                    border: '1px solid #CBD5E1',
                                    textAlign: 'right',
                                    padding: '0 4px',
                                    fontSize: '11px',
                                    background: '#F1F5F9'
                                  }}
                                />
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '9px',
                                  fontWeight: '700',
                                  background: '#D1FAE5',
                                  color: '#065F46',
                                  whiteSpace: 'nowrap'
                                }}>
                                  Fully Raised
                                </span>
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                max={balanceQty}
                                step="any"
                                value={item.qty_to_raise !== undefined ? item.qty_to_raise : ''}
                                onChange={e => handleQtyToRaiseChange(item.id, e.target.value)}
                                style={{
                                  width: '100px',
                                  height: '24px',
                                  borderRadius: '4px',
                                  border: '1px solid #CBD5E1',
                                  textAlign: 'right',
                                  padding: '0 4px',
                                  fontSize: '11px'
                                }}
                              />
                            )
                          ) : (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              fontWeight: '700',
                              background: balanceQty <= 0 ? '#D1FAE5' : '#F1F5F9',
                              color: balanceQty <= 0 ? '#065F46' : '#475569'
                            }}>
                              {balanceQty <= 0 ? 'Fully Raised' : 'Pending'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canRaise && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={submitting}
                  onClick={handleRaiseServiceInvoiceRequest}
                  style={{ background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '4px', height: '28px', padding: '0 12px', fontSize: '11px', fontWeight: 600 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>receipt_long</span>
                  Raise Service Invoice Request
                </button>
              </div>
            )}
          </div>
        );
      })()}
        </div>
      )}

      {/* STYLES OVERRIDES FOR SCR CONTAINER */}
      <style>{`
        .scr-container .data-table-wrapper {
          padding: 0 !important;
        }
        .scr-container .data-table th {
          height: 34px !important;
          padding: 0 12px !important;
          font-size: 11px !important;
          vertical-align: middle !important;
          box-sizing: border-box;
          background: #F8FAFC !important;
          color: #475569 !important;
          border-bottom: 1px solid #E2E8F0 !important;
          font-weight: 700 !important;
          letter-spacing: 0.03em !important;
          text-transform: uppercase !important;
        }
        .scr-container .data-table td {
          height: 32px !important;
          padding: 4px 12px !important;
          font-size: 11px !important;
          vertical-align: middle !important;
          box-sizing: border-box;
          border-bottom: 1px solid #F1F5F9 !important;
          color: #334155 !important;
        }
        .scr-container .data-table tr {
          height: 32px !important;
        }
        .scr-container .form-input, 
        .scr-container .form-select {
          height: 28px !important;
          padding: 0 8px !important;
          font-size: 11px !important;
          border-radius: 4px !important;
          border: 1px solid #CBD5E1 !important;
        }
        .scr-container .form-label {
          font-size: 11px !important;
          font-weight: 600 !important;
          color: #475569 !important;
          margin-bottom: 2px !important;
          display: block;
        }
        .scr-container .card {
          padding: 10px 12px !important;
          border-radius: 6px !important;
          border: 1px solid #E2E8F0 !important;
        }
        .scr-container .btn {
          height: 28px !important;
          padding: 0 12px !important;
          font-size: 11px !important;
          border-radius: 4px !important;
        }
      `}</style>
    </div>
  );
}

