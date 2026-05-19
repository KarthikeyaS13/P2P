import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';

export default function MasterAddress() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    addr_line1: '',
    addr_line2: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
    is_default: false
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('address'); // 'address' or 'signature'

  // Signature States & Handlers
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [sigType, setSigType] = useState('draw'); // 'draw' or 'upload'
  const [globalSig, setGlobalSig] = useState(null);

  // Fetch global signature on load
  const fetchGlobalSignature = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/global-settings/authorized_signature');
      if (res.data && res.data.value) {
        setGlobalSig(res.data.value);
      }
    } catch (err) {
      console.error('Failed to fetch signature:', err);
    }
  };

  useEffect(() => {
    fetchAddresses();
    fetchGlobalSignature();
  }, []);

  useEffect(() => {
    if (sigType === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
    }
  }, [sigType, globalSig]);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setGlobalSig(event.target.result); // base64 string
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignature = async () => {
    let dataUrl = null;
    if (sigType === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Check if canvas is empty
      const ctx = canvas.getContext('2d');
      const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hasData = false;
      for (let i = 3; i < pixelData.length; i += 4) {
        if (pixelData[i] > 0) {
          hasData = true;
          break;
        }
      }
      if (!hasData) {
        Swal.fire({ icon: 'warning', title: 'Empty Signature', text: 'Please draw your signature before saving.' });
        return;
      }
      dataUrl = canvas.toDataURL('image/png');
    } else {
      if (!globalSig) {
        Swal.fire({ icon: 'warning', title: 'No File Uploaded', text: 'Please upload a signature image file.' });
        return;
      }
      dataUrl = globalSig;
    }

    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post('http://localhost:5000/api/global-settings/authorized_signature', { value: dataUrl }, { headers });
      setGlobalSig(dataUrl);
      Swal.fire({ icon: 'success', title: 'Success', text: 'Authorized signature updated successfully!', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save signature' });
    }
  };

  const handleDeleteSignature = async () => {
    const result = await Swal.fire({
      title: 'Remove Signature?',
      text: 'Are you sure you want to remove the authorized signature? Transactions will lack a signature preview.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Yes, remove it!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post('http://localhost:5000/api/global-settings/authorized_signature', { value: null }, { headers });
        setGlobalSig(null);
        if (sigType === 'draw') clearCanvas();
        Swal.fire('Removed!', 'Authorized signature has been removed.', 'success');
      } catch (err) {
        Swal.fire('Error', 'Failed to remove signature', 'error');
      }
    }
  };

  const fetchAddresses = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:5000/api/master-addresses', { headers });
      setAddresses(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      if (isEditing) {
        await axios.put(`http://localhost:5000/api/master-addresses/${editId}`, form, { headers });
        Swal.fire({ icon: 'success', title: 'Success', text: 'Location updated successfully', timer: 1500, showConfirmButton: false });
      } else {
        await axios.post('http://localhost:5000/api/master-addresses', form, { headers });
        Swal.fire({ icon: 'success', title: 'Success', text: 'Location added successfully', timer: 1500, showConfirmButton: false });
      }
      
      handleCloseForm();
      fetchAddresses();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: `Failed to ${isEditing ? 'update' : 'add'} location` });
    }
  };

  const handleEdit = (addr) => {
    setForm({
      name: addr.name,
      addr_line1: addr.addr_line1,
      addr_line2: addr.addr_line2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      landmark: addr.landmark || '',
      is_default: !!addr.is_default
    });
    setEditId(addr.id);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setEditId(null);
    setForm({ name: '', addr_line1: '', addr_line2: '', city: '', state: '', pincode: '', landmark: '', is_default: false });
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.delete(`http://localhost:5000/api/master-addresses/${id}`, { headers });
        Swal.fire('Deleted!', 'Location has been deleted.', 'success');
        fetchAddresses();
      } catch (err) {
        Swal.fire('Error', 'Failed to delete location', 'error');
      }
    }
  };

  return (
    <div className="page-container screen-enter">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate('/dashboard')} className="btn-ghost btn-back" style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title">
              {activeSection === 'address' ? 'Master Addresses' : 'Centralized Signature'}
            </h1>
            <p className="page-header__subtitle">
              {activeSection === 'address' 
                ? 'Manage corporate and warehouse dispatch locations' 
                : 'Configure company authorization signature for transactions'}
            </p>
          </div>
        </div>
        {activeSection === 'address' && (
          <button onClick={() => { if(showForm) handleCloseForm(); else setShowForm(true); }} className="btn btn-primary">
            <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancel' : 'Add Location'}
          </button>
        )}
      </div>

      {/* Sub-navigation Breadcrumbs / Sections */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '24px',
        borderBottom: '1px solid #E5E7EB',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setActiveSection('address')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 700,
            color: activeSection === 'address' ? 'var(--primary)' : '#6B7280',
            borderBottom: activeSection === 'address' ? '3px solid var(--primary)' : '3px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>location_on</span>
          Dispatch Locations
        </button>
        <div style={{ color: '#9CA3AF', fontWeight: 500, fontSize: '16px' }}>/</div>
        <button
          onClick={() => setActiveSection('signature')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 700,
            color: activeSection === 'signature' ? 'var(--primary)' : '#6B7280',
            borderBottom: activeSection === 'signature' ? '3px solid var(--primary)' : '3px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>draw</span>
          Authorized Signature
        </button>
      </div>

      {activeSection === 'address' && (
        <>
          {showForm && (
        <div className="card card--padded animate-slide-up" style={{ marginBottom: '24px', border: '2px solid var(--primary)' }}>
          <h3 className="text-h3" style={{ marginBottom: '20px' }}>{isEditing ? 'Edit Location' : 'Add New Location'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Location Name (e.g. Hyderabad Main, Chennai Hub) *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Enter identifiable name" />
              </div>
              <div className="form-group">
                <label className="form-label">Pincode *</label>
                <input className="form-input" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} required placeholder="6-digit pincode" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Address Line 1 *</label>
                <input className="form-input" value={form.addr_line1} onChange={e => setForm({ ...form, addr_line1: e.target.value })} required placeholder="House/Plot No, Building, Street" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Address Line 2 (Optional)</label>
                <input className="form-input" value={form.addr_line2} onChange={e => setForm({ ...form, addr_line2: e.target.value })} placeholder="Area, Locality" />
              </div>
              <div className="form-group">
                <label className="form-label">City *</label>
                <input className="form-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">State *</label>
                <input className="form-input" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Landmark</label>
                <input className="form-input" value={form.landmark} onChange={e => setForm({ ...form, landmark: e.target.value })} placeholder="Near..." />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '32px' }}>
                <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                <label htmlFor="is_default" style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Set as Default Source</label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-outline" onClick={handleCloseForm}>Discard</button>
              <button type="submit" className="btn btn-primary">{isEditing ? 'Update Location' : 'Save Location'}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Loading addresses...</div>
      ) : (
        <div className="grid grid-3 animate-fade">
          {addresses.map(addr => (
            <div key={addr.id} className="card card--padded" style={{ 
              position: 'relative', 
              border: addr.is_default ? '2px solid #10B981' : '1px solid #E5E7EB',
              background: addr.is_default ? '#F0FDF4' : 'white',
              marginBottom: '20px'
            }}>
              {!!addr.is_default && (
                <div style={{ 
                  position: 'absolute', 
                  top: '12px', 
                  right: '12px', 
                  background: '#10B981', 
                  color: 'white', 
                  padding: '2px 8px', 
                  borderRadius: '12px', 
                  fontSize: '10px', 
                  fontWeight: 800 
                }}>DEFAULT</div>
              )}
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 700, color: 'var(--secondary)' }}>{addr.name}</h4>
              <div style={{ fontSize: '13px', color: '#4B5563', lineHeight: '1.6' }}>
                <div>{addr.addr_line1}</div>
                <div>{addr.addr_line2}</div>
                <div>{addr.city}, {addr.state} - {addr.pincode}</div>
                {addr.landmark && <div style={{ fontStyle: 'italic', color: '#6B7280', marginTop: '4px' }}>Landmark: {addr.landmark}</div>}
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => handleEdit(addr)} className="btn-ghost" style={{ color: 'var(--primary)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>edit</span>
                </button>
                <button onClick={() => handleDelete(addr.id)} className="btn-ghost" style={{ color: '#EF4444' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
          {addresses.length === 0 && !showForm && (
            <div className="card" style={{ gridColumn: 'span 3', padding: '60px', textAlign: 'center', background: '#F9FAFB', border: '2px dashed #E5E7EB' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#9CA3AF', marginBottom: '16px' }}>location_off</span>
              <p style={{ color: '#6B7280', fontSize: '16px' }}>No master addresses found. Add one to get started.</p>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {activeSection === 'signature' && (
        <>
          {/* Authorized Signatory settings card */}
      <div className="card card--padded animate-slide-up" style={{ marginTop: '32px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h3 className="text-h3" style={{ color: 'var(--secondary)', marginBottom: '4px' }}>Authorized Signatory Settings</h3>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>Configure the default authorized signature drawn or uploaded from your system. This will automatically fetch in Raise DC and Invoice Approval transactions.</p>
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Workspace */}
          <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid #E5E7EB', paddingRight: '24px' }}>
            {/* Signature Input Mode Selection */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                onClick={() => setSigType('draw')} 
                className={`btn ${sigType === 'draw' ? 'btn-primary' : 'btn-outline'}`}
                style={{ height: '36px', fontSize: '13px', padding: '0 16px' }}
              >
                Draw Signature
              </button>
              <button 
                type="button" 
                onClick={() => setSigType('upload')} 
                className={`btn ${sigType === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                style={{ height: '36px', fontSize: '13px', padding: '0 16px' }}
              >
                Upload from System
              </button>
            </div>

            {sigType === 'draw' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ border: '1.5px solid #D1D5DB', borderRadius: '12px', overflow: 'hidden', background: '#F9FAFB', width: '400px' }}>
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ background: 'white', display: 'block', cursor: 'crosshair' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn-outline" onClick={clearCanvas} style={{ height: '36px', fontSize: '13px' }}>Clear Canvas</button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveSignature} style={{ height: '36px', fontSize: '13px' }}>Save & Apply Signature</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ width: '400px' }}>
                  <label style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    color: '#4F46E5',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: '#F5F3FF',
                    padding: '24px 16px',
                    borderRadius: '12px',
                    border: '2.5px dashed #C7D2FE',
                    textAlign: 'center'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#6366F1' }}>cloud_upload</span>
                    <span style={{ color: '#4B5563', fontWeight: 600 }}>Drag and drop or click to upload your signature image</span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 500 }}>Supports PNG, JPG, JPEG, SVG</span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </label>
                </div>
                {globalSig && sigType === 'upload' && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" className="btn btn-primary" onClick={handleSaveSignature} style={{ height: '36px', fontSize: '13px' }}>Save & Apply Signature</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Preview */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em' }}>Active Authorized Signature</span>
            
            {globalSig ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{
                  border: '1.5px dashed #10B981',
                  borderRadius: '12px',
                  padding: '12px',
                  background: '#F0FDF4',
                  width: '280px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '120px'
                }}>
                  <img src={globalSig} alt="Authorized Signature Preview" style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }} />
                </div>
                <button type="button" className="btn" onClick={handleDeleteSignature} style={{ height: '32px', fontSize: '12px', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', padding: '0 12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '4px', verticalAlign: 'middle' }}>delete</span>
                  Remove Signature
                </button>
              </div>
            ) : (
              <div style={{
                border: '1.5px dashed #D1D5DB',
                borderRadius: '12px',
                padding: '24px 16px',
                background: '#F9FAFB',
                width: '280px',
                minHeight: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: '8px'
              }}>
                <span className="material-symbols-outlined" style={{ color: '#9CA3AF', fontSize: '28px' }}>draw</span>
                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>No signature currently set. Please draw or upload above.</span>
              </div>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
