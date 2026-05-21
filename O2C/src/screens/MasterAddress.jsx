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
    <div className="page-container screen-enter" style={{ padding: '0 0 16px 0' }}>
      <div className="page-header" style={{ marginBottom: '12px', marginTop: '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} className="btn-ghost btn-back" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title" style={{ fontSize: '1.2rem', margin: 0 }}>
              {activeSection === 'address' ? 'Master Addresses' : 'Centralized Signature'}
            </h1>
            <p className="page-header__subtitle" style={{ fontSize: '0.85rem', margin: 0 }}>
              {activeSection === 'address' 
                ? 'Manage corporate and warehouse dispatch locations' 
                : 'Configure company authorization signature for transactions'}
            </p>
          </div>
        </div>
        {activeSection === 'address' && (
          <button onClick={() => { if(showForm) handleCloseForm(); else setShowForm(true); }} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem', height: '32px' }}>
            <span className="material-symbols-outlined" style={{ marginRight: '6px', fontSize: '16px' }}>{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancel' : 'Add Location'}
          </button>
        )}
      </div>

      {/* Sub-navigation Breadcrumbs / Sections */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        borderBottom: '1px solid #E5E7EB',
        paddingBottom: '8px'
      }}>
        <button
          onClick={() => setActiveSection('address')}
          style={{
            background: 'none',
            border: 'none',
            padding: '6px 12px',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: activeSection === 'address' ? 'var(--primary)' : '#6B7280',
            borderBottom: activeSection === 'address' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>location_on</span>
          Dispatch Locations
        </button>
        <div style={{ color: '#9CA3AF', fontWeight: 500, fontSize: '14px' }}>/</div>
        <button
          onClick={() => setActiveSection('signature')}
          style={{
            background: 'none',
            border: 'none',
            padding: '6px 12px',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: activeSection === 'signature' ? 'var(--primary)' : '#6B7280',
            borderBottom: activeSection === 'signature' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>draw</span>
          Authorized Signature
        </button>
      </div>

      {activeSection === 'address' && (
        <>
          {showForm && (
            <div className="card animate-slide-up" style={{ padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '2px solid var(--primary)' }}>
              <h3 className="text-h3" style={{ marginBottom: '12px', fontSize: '1.1rem' }}>{isEditing ? 'Edit Location' : 'Add New Location'}</h3>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Location Name (e.g. Hyderabad Main, Chennai Hub) *</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Enter identifiable name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Pincode *</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} required placeholder="6-digit pincode" />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Address Line 1 *</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.addr_line1} onChange={e => setForm({ ...form, addr_line1: e.target.value })} required placeholder="House/Plot No, Building, Street" />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Address Line 2 (Optional)</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.addr_line2} onChange={e => setForm({ ...form, addr_line2: e.target.value })} placeholder="Area, Locality" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>City *</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>State *</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Landmark</label>
                    <input className="form-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={form.landmark} onChange={e => setForm({ ...form, landmark: e.target.value })} placeholder="Near..." />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
                    <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                    <label htmlFor="is_default" style={{ fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Set as Default Source</label>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                  <button type="button" className="btn btn-outline" style={{ padding: '5px 12px', fontSize: '0.85rem' }} onClick={handleCloseForm}>Discard</button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '5px 12px', fontSize: '0.85rem' }}>{isEditing ? 'Update Location' : 'Save Location'}</button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>Loading addresses...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }} className="animate-fade">
              {addresses.map(addr => (
                <div key={addr.id} className="card" style={{ 
                  position: 'relative', 
                  border: addr.is_default ? '2px solid #10B981' : '1px solid #E5E7EB',
                  background: addr.is_default ? '#F0FDF4' : 'white',
                  padding: '12px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '150px'
                }}>
                  {!!addr.is_default && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '8px', 
                      right: '8px', 
                      background: '#10B981', 
                      color: 'white', 
                      padding: '2px 6px', 
                      borderRadius: '12px', 
                      fontSize: '9px', 
                      fontWeight: 800 
                    }}>DEFAULT</div>
                  )}
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--secondary)' }}>{addr.name}</h4>
                  <div style={{ fontSize: '0.85rem', color: '#4B5563', lineHeight: '1.4', flex: 1 }}>
                    <div>{addr.addr_line1}</div>
                    {addr.addr_line2 && <div>{addr.addr_line2}</div>}
                    <div>{addr.city}, {addr.state} - {addr.pincode}</div>
                    {addr.landmark && <div style={{ fontStyle: 'italic', color: '#6B7280', marginTop: '2px' }}>Landmark: {addr.landmark}</div>}
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #E5E7EB', paddingTop: '8px' }}>
                    <button onClick={() => handleEdit(addr)} className="btn-ghost" style={{ padding: '4px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                    </button>
                    <button onClick={() => handleDelete(addr.id)} className="btn-ghost" style={{ padding: '4px', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {addresses.length === 0 && !showForm && (
                <div className="card" style={{ gridColumn: 'span 3', padding: '40px', textAlign: 'center', background: '#F9FAFB', border: '2px dashed #E5E7EB', borderRadius: '12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#9CA3AF', marginBottom: '12px' }}>location_off</span>
                  <p style={{ color: '#6B7280', fontSize: '14px' }}>No master addresses found. Add one to get started.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeSection === 'signature' && (
        <>
          {/* Authorized Signatory settings card */}
          <div className="card animate-slide-up" style={{ padding: '16px', borderRadius: '12px', marginTop: '16px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 className="text-h3" style={{ color: 'var(--secondary)', marginBottom: '4px', fontSize: '1.1rem' }}>Authorized Signatory Settings</h3>
              <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Configure the default authorized signature drawn or uploaded from your system. This will automatically fetch in Raise DC and Invoice Approval transactions.</p>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {/* Workspace */}
              <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid #E5E7EB', paddingRight: '16px' }}>
                {/* Signature Input Mode Selection */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setSigType('draw')} 
                    className={`btn ${sigType === 'draw' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ height: '32px', fontSize: '12px', padding: '0 12px' }}
                  >
                    Draw Signature
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setSigType('upload')} 
                    className={`btn ${sigType === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ height: '32px', fontSize: '12px', padding: '0 12px' }}
                  >
                    Upload from System
                  </button>
                </div>

                {sigType === 'draw' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ border: '1.5px solid #D1D5DB', borderRadius: '8px', overflow: 'hidden', background: '#F9FAFB', width: '360px' }}>
                      <canvas
                        ref={canvasRef}
                        width={360}
                        height={120}
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-outline" onClick={clearCanvas} style={{ height: '32px', fontSize: '12px', padding: '0 12px' }}>Clear Canvas</button>
                      <button type="button" className="btn btn-primary" onClick={handleSaveSignature} style={{ height: '32px', fontSize: '12px', padding: '0 12px' }}>Save & Apply Signature</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ width: '360px' }}>
                      <label style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#4F46E5',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: '#F5F3FF',
                        padding: '16px 12px',
                        borderRadius: '8px',
                        border: '2.5px dashed #C7D2FE',
                        textAlign: 'center'
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#6366F1' }}>cloud_upload</span>
                        <span style={{ color: '#4B5563', fontWeight: 600 }}>Drag and drop or click to upload signature image</span>
                        <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500 }}>PNG, JPG, JPEG, SVG</span>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                      </label>
                    </div>
                    {globalSig && sigType === 'upload' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="btn btn-primary" onClick={handleSaveSignature} style={{ height: '32px', fontSize: '12px', padding: '0 12px' }}>Save & Apply Signature</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Active Preview */}
              <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em' }}>Active Authorized Signature</span>
                
                {globalSig ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{
                      border: '1.5px dashed #10B981',
                      borderRadius: '8px',
                      padding: '8px',
                      background: '#F0FDF4',
                      width: '240px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '80px'
                    }}>
                      <img src={globalSig} alt="Authorized Signature Preview" style={{ maxWidth: '100%', maxHeight: '60px', objectFit: 'contain' }} />
                    </div>
                    <button type="button" className="btn" onClick={handleDeleteSignature} style={{ height: '28px', fontSize: '11px', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', padding: '0 8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }}>delete</span>
                      Remove Signature
                    </button>
                  </div>
                ) : (
                  <div style={{
                    border: '1.5px dashed #D1D5DB',
                    borderRadius: '8px',
                    padding: '16px 12px',
                    background: '#F9FAFB',
                    width: '240px',
                    minHeight: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '6px'
                  }}>
                    <span className="material-symbols-outlined" style={{ color: '#9CA3AF', fontSize: '20px' }}>draw</span>
                    <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>No signature set. Draw or upload above.</span>
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
