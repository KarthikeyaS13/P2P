import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { INDIAN_STATES } from '../utils/states';
import CustomStateSelect from './CustomStateSelect';
import CustomCitySelect from './CustomCitySelect';
import { POPULAR_CITIES } from '../utils/cities';

export default function LocationForm({ customerId, customer, corporateGST, location, onClose, onRefresh }) {
  const isEdit = !!location;

  const [isCustomCity, setIsCustomCity] = useState(false);
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
    is_corporate_address: false,
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

      if (location.city) {
        const isPop = POPULAR_CITIES.some(c => c.name.toLowerCase() === location.city.toLowerCase());
        setIsCustomCity(!isPop);
      } else {
        setIsCustomCity(false);
      }
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

  const handleAddressToggle = (e) => {
    const isCorporate = e.target.checked;
    setForm(prev => {
      const cityVal = isCorporate ? (customer?.city || '') : '';
      const isPop = POPULAR_CITIES.some(c => c.name.toLowerCase() === cityVal.toLowerCase());
      setIsCustomCity(cityVal ? !isPop : false);
      return {
        ...prev,
        is_corporate_address: isCorporate,
        address_line1: isCorporate ? (customer?.address_line1 || '') : '',
        address_line2: isCorporate ? (customer?.address_line2 || '') : '',
        address_line3: isCorporate ? (customer?.address_line3 || '') : '',
        city: cityVal,
        state: isCorporate ? (customer?.state || '') : '',
        pincode: isCorporate ? (customer?.pincode || '') : ''
      };
    });
  };

  const handleSubmit = (e) => {
    if (!form.label) return Swal.fire({ icon: 'error', title: 'Required', text: 'Location Name is required' });
    if (!form.address_line1) return Swal.fire({ icon: 'error', title: 'Required', text: 'Address Line 1 is required' });
    if (!form.city) return Swal.fire({ icon: 'error', title: 'Required', text: 'City is required' });
    if (!form.state) return Swal.fire({ icon: 'error', title: 'Required', text: 'State is required' });
    if (!form.pincode || form.pincode.length !== 6) return Swal.fire({ icon: 'error', title: 'Invalid Pincode', text: 'Valid 6-digit Pincode is required' });

    if (form.gst_is_different && (!form.gstin || form.gstin.length !== 15)) {
      return Swal.fire({ icon: 'error', title: 'Invalid GSTIN', text: '15-character GSTIN is required when using a different GST for this location' });
    }

    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      return Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Invalid SPOC 1 Email' });
    }
    if (form.contact_phone && form.contact_phone.length !== 10) return Swal.fire({ icon: 'error', title: 'Invalid Phone', text: 'Contact phone must be 10 digits' });

    if (showSpoc2) {
      if (form.spoc2_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.spoc2_email)) {
        return Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Invalid SPOC 2 Email' });
      }
      if (form.spoc2_phone && form.spoc2_phone.length !== 10) {
        return Swal.fire({ icon: 'error', title: 'Invalid Phone', text: 'SPOC 2 Phone must be 10 digits' });
      }
    }

    setSubmitting(true);
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const payload = { ...form, customer_id: customerId };

    if (isEdit) {
      axios.put(`/api/locations/${location.id}`, payload, { headers })
        .then(() => {
          Swal.fire({ icon: 'success', title: 'Updated', text: 'Location updated', timer: 2000, showConfirmButton: false });
          onRefresh();
          onClose();
        })
        .catch(err => Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to update location' }))
        .finally(() => setSubmitting(false));
    } else {
      axios.post('/api/locations', payload, { headers })
        .then(() => {
          Swal.fire({ icon: 'success', title: 'Success', text: 'Location added', timer: 2000, showConfirmButton: false });
          onRefresh();
          onClose();
        })
        .catch(err => Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to add location' }))
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
          <div className="responsive-grid responsive-grid--2" style={{ marginBottom: '32px' }}>
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
                placeholder={!form.gst_is_different ? corporateGST : "15-character GSTIN"}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px', marginBottom: '16px' }}>
            <h3 style={{ color: '#1F2937', margin: 0 }}>Address</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600, color: '#2563EB' }}>
              <input
                type="checkbox"
                checked={form.is_corporate_address}
                onChange={handleAddressToggle}
                style={{ width: '16px', height: '16px' }}
              />
              Same as Corporate Address
            </label>
          </div>
          <div className="responsive-grid responsive-grid--2" style={{ marginBottom: '32px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Address Line 1 *</label>
              <input
                name="address_line1"
                value={form.address_line1}
                onChange={handleChange}
                required
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Address Line 2</label>
              <input
                name="address_line2"
                value={form.address_line2}
                onChange={handleChange}
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Address Line 3</label>
              <input
                name="address_line3"
                value={form.address_line3}
                onChange={handleChange}
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>City *</label>
              {isCustomCity ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="Enter city name"
                    required
                    disabled={form.is_corporate_address}
                    style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white' }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomCity(false)}
                    disabled={form.is_corporate_address}
                    style={{
                      padding: '10px 14px',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                      borderRadius: '8px',
                      cursor: form.is_corporate_address ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>list</span>
                    Popular
                  </button>
                </div>
              ) : (
                <CustomCitySelect
                  value={form.city}
                  onChange={(cityName, stateName) => {
                    setForm(prev => ({
                      ...prev,
                      city: cityName,
                      state: stateName || prev.state
                    }));
                  }}
                  onSelectOther={() => {
                    setIsCustomCity(true);
                    setForm(prev => ({ ...prev, city: '' }));
                  }}
                  disabled={form.is_corporate_address}
                />
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>State *</label>
              <CustomStateSelect
                value={form.state}
                onChange={handleChange}
                disabled={form.is_corporate_address}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500 }}>Pincode *</label>
              <input
                name="pincode"
                value={form.pincode}
                onChange={handleChange}
                required
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white' }}
              />
            </div>


          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px', marginBottom: '16px' }}>
            <h3 style={{ color: '#1F2937', margin: 0 }}>Customer Site Contact(mandatory)</h3>
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
