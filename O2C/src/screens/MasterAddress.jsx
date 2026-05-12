import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchAddresses();
  }, []);

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
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate('/dashboard')} className="btn-ghost btn-back" style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-h1 page-header__title">Master Addresses</h1>
            <p className="page-header__subtitle">Manage corporate and warehouse dispatch locations</p>
          </div>
        </div>
        <button onClick={() => { if(showForm) handleCloseForm(); else setShowForm(true); }} className="btn btn-primary">
          <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'Add Location'}
        </button>
      </div>

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
    </div>
  );
}
