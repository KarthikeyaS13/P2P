import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function LocationForm({ customerId, corporateGST, location, onClose, onRefresh }) {
  const isEdit = !!location;
  
  const [form, setForm] = useState({
    label: '',
    address_line1: '',
    address_line2: '',
    address_line3: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    gst_is_different: false,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    spoc2_name: '',
    spoc2_department: '',
    spoc2_email: '',
    spoc2_phone: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [showSpoc2, setShowSpoc2] = useState(false);

  useEffect(() => {
    if (location) {
      setForm({
        label: location.label || '',
        address_line1: location.address_line1 || '',
        address_line2: location.address_line2 || '',
        address_line3: location.address_line3 || '',
        city: location.city || '',
        state: location.state || '',
        pincode: location.pincode || '',
        gstin: location.gstin || '',
        gst_is_different: !!location.gst_is_different,
        contact_name: location.contact_name || '',
        contact_email: location.contact_email || '',
        contact_phone: location.contact_phone || '',
        spoc2_name: location.spoc2_name || '',
        spoc2_department: location.spoc2_department || '',
        spoc2_email: location.spoc2_email || '',
        spoc2_phone: location.spoc2_phone || ''
      });
      if (location.spoc2_name || location.spoc2_phone) setShowSpoc2(true);
    }
  }, [location]);

  const handleChange = (e) => {
    let { name, value, type, checked } = e.target;
    
    if (name === 'gstin') {
      value = value.toUpperCase().slice(0, 15);
    }
    if (name === 'contact_phone' || name === 'spoc2_phone' || name === 'pincode') {
      value = value.replace(/\D/g, '').slice(0, (name === 'contact_phone' || name === 'spoc2_phone') ? 10 : 6);
    }

    setForm(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleGstModeChange = (isDifferent) => {
    setForm(prev => ({ 
      ...prev, 
      gst_is_different: isDifferent,
      gstin: isDifferent ? prev.gstin : corporateGST
    }));
  };

  const handleSubmit = (e) => {
    if (!form.label) return alert('Location Name is required');
    if (!form.address_line1) return alert('Address Line 1 is required');
    if (!form.city) return alert('City is required');
    if (!form.state) return alert('State is required');
    if (!form.pincode || form.pincode.length !== 6) return alert('Valid 6-digit Pincode is required');
    
    if (form.gst_is_different && (!form.gstin || form.gstin.length !== 15)) {
      return alert('15-character GSTIN is required when using a different GST for this location');
    }
    
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      return alert('Invalid SPOC 1 Email');
    }
    if (form.contact_phone && form.contact_phone.length !== 10) return alert('Contact phone must be 10 digits');

    if (showSpoc2) {
      if (form.spoc2_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.spoc2_email)) {
        return alert('Invalid SPOC 2 Email');
      }
      if (form.spoc2_phone && form.spoc2_phone.length !== 10) {
        return alert('SPOC 2 Phone must be 10 digits');
      }
    }

    setSubmitting(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const payload = { ...form, customer_id: customerId };

    if (isEdit) {
      axios.put(`http://localhost:3000/api/locations/${location.id}`, payload, { headers })
        .then(() => {
          alert('Location updated');
          onRefresh();
          onClose();
        })
        .catch(err => alert(err.response?.data?.error || 'Failed to update location'))
        .finally(() => setSubmitting(false));
    } else {
      axios.post('http://localhost:3000/api/locations', payload, { headers })
        .then(() => {
          alert('Location added');
          onRefresh();
          onClose();
        })
        .catch(err => alert(err.response?.data?.error || 'Failed to add location'))
        .finally(() => setSubmitting(false));
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '50px', zIndex: 1000, overflowY: 'auto' }}>
      <div style={{ background: 'white', width: '100%', maxWidth: '800px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '50px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
          <h2 style={{ margin: 0, color: '#111827' }}>{isEdit ? 'Edit Location' : 'Add New Location'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          
          <h3 style={{ color: '#1F2937', marginTop: 0, borderBottom: '1px solid #E5E7EB', paddingBottom: '8px', marginBottom: '16px' }}>Location Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Location Name / Project Name *</label>
              <input name="label" value={form.label} onChange={handleChange} placeholder="e.g. Hyderabad Site, Chennai Factory" required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#4B5563', fontWeight: 500 }}>GST Information</label>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="gst_mode" checked={!form.gst_is_different} onChange={() => handleGstModeChange(false)} />
                  Same as Corporate GST
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="gst_mode" checked={form.gst_is_different} onChange={() => handleGstModeChange(true)} />
                  Different GST for this location
                </label>
              </div>
              <input 
                name="gstin" 
                value={form.gstin} 
                onChange={handleChange} 
                placeholder="15-character GSTIN" 
                disabled={!form.gst_is_different}
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  borderRadius: '4px', 
                  border: '1px solid #D1D5DB',
                  background: !form.gst_is_different ? '#F9FAFB' : 'white',
                  cursor: !form.gst_is_different ? 'not-allowed' : 'text'
                }} 
              />
            </div>
          </div>

          <h3 style={{ color: '#1F2937', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px', marginBottom: '16px' }}>Address</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Address Line 1 *</label>
              <input name="address_line1" value={form.address_line1} onChange={handleChange} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Address Line 2</label>
              <input name="address_line2" value={form.address_line2} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Address Line 3</label>
              <input name="address_line3" value={form.address_line3} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Pincode *</label>
              <input name="pincode" value={form.pincode} onChange={handleChange} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>City *</label>
              <input name="city" value={form.city} onChange={handleChange} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>State *</label>
              <input name="state" value={form.state} onChange={handleChange} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px', marginBottom: '16px' }}>
            <h3 style={{ color: '#1F2937', margin: 0 }}>Site Contacts</h3>
            {!showSpoc2 && (
              <button 
                type="button" 
                onClick={() => setShowSpoc2(true)}
                style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Add Second SPOC
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: showSpoc2 ? '24px' : '32px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Contact Person Name (SPOC 1)</label>
              <input name="contact_name" value={form.contact_name} onChange={handleChange} placeholder="Full Name" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Contact Email</label>
              <input type="email" name="contact_email" value={form.contact_email} onChange={handleChange} placeholder="email@example.com" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Contact Phone (10 digits)</label>
              <input name="contact_phone" value={form.contact_phone} onChange={handleChange} placeholder="9876543210" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
            </div>
          </div>

          {showSpoc2 && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: '#374151' }}>Second SPOC Details</h4>
                <button type="button" onClick={() => setShowSpoc2(false)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontSize: '0.85rem' }}>Name</label>
                  <input name="spoc2_name" value={form.spoc2_name} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontSize: '0.85rem' }}>Phone</label>
                  <input name="spoc2_phone" value={form.spoc2_phone} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontSize: '0.85rem' }}>Email</label>
                  <input name="spoc2_email" value={form.spoc2_email} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }} />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 24px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={{ padding: '10px 24px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Location')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
