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
    e.preventDefault();
    if (!form.label) return Swal.fire({ icon: 'error', title: 'Required', text: 'Location Name is required' });
    if (!form.address_line1) return Swal.fire({ icon: 'error', title: 'Required', text: 'Address Line 1 is required' });
    if (!form.city) return Swal.fire({ icon: 'error', title: 'Required', text: 'City is required' });
    if (!form.state) return Swal.fire({ icon: 'error', title: 'Required', text: 'State is required' });
    if (!form.pincode || form.pincode.length !== 6) return Swal.fire({ icon: 'error', title: 'Invalid Pincode', text: 'Valid 6-digit Pincode is required' });

    if (form.gst_is_different && (!form.gstin || form.gstin.length !== 15)) {
      return Swal.fire({ icon: 'error', title: 'Invalid GSTIN', text: '15-character GSTIN is required when using a different GST for this location' });
    }

    if (!form.contact_name || !form.contact_name.trim()) {
      return Swal.fire({ icon: 'error', title: 'Required', text: 'Contact Person Name (SPOC 1) is required' });
    }
    if (!form.contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      return Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Valid SPOC 1 Email is required' });
    }
    if (!form.contact_phone || form.contact_phone.length !== 10) {
      return Swal.fire({ icon: 'error', title: 'Invalid Phone', text: 'Contact phone must be exactly 10 digits' });
    }

    if (showSpoc2) {
      if (!form.spoc2_name || !form.spoc2_name.trim()) {
        return Swal.fire({ icon: 'error', title: 'Required', text: 'Second SPOC Name is required when enabled' });
      }
      if (!form.spoc2_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.spoc2_email)) {
        return Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Valid Second SPOC Email is required when enabled' });
      }
      if (!form.spoc2_phone || form.spoc2_phone.length !== 10) {
        return Swal.fire({ icon: 'error', title: 'Invalid Phone', text: 'Second SPOC Phone must be exactly 10 digits' });
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
      <div style={{ background: 'white', width: '100%', maxWidth: '700px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #E5E7EB' }}>
          <h3 style={{ margin: 0, color: '#111827', fontSize: '1.1rem' }}>{isEdit ? 'Edit Location' : 'Add New Location'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '12px 18px', overflowY: 'auto', flex: 1 }}>

          <h4 style={{ color: '#1F2937', marginTop: 0, borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '10px', fontSize: '0.9rem' }}>Location Details</h4>
          <div className="responsive-grid responsive-grid--2" style={{ marginBottom: '12px', rowGap: '6px', columnGap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Location Name / Project Name *</label>
              <input name="label" value={form.label} onChange={handleChange} placeholder="e.g. Hyderabad Site, Chennai Factory" required style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>GST Information</label>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '6px', fontSize: '0.8rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="radio" name="gst_mode" checked={!form.gst_is_different} onChange={() => handleGstModeChange(false)} style={{ margin: 0 }} />
                  Same as Corporate GST
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="radio" name="gst_mode" checked={form.gst_is_different} onChange={() => handleGstModeChange(true)} style={{ margin: 0 }} />
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
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid #D1D5DB',
                  background: !form.gst_is_different ? '#F9FAFB' : 'white',
                  cursor: !form.gst_is_different ? 'not-allowed' : 'text',
                  fontSize: '0.85rem',
                  height: '30px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '10px' }}>
            <h4 style={{ color: '#1F2937', margin: 0, fontSize: '0.9rem' }}>Address</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, color: '#2563EB' }}>
              <input
                type="checkbox"
                checked={form.is_corporate_address}
                onChange={handleAddressToggle}
                style={{ width: '14px', height: '14px', margin: 0 }}
              />
              Same as Corporate Address
            </label>
          </div>
          <div className="responsive-grid responsive-grid--2" style={{ marginBottom: '12px', rowGap: '6px', columnGap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Address Line 1 *</label>
              <input
                name="address_line1"
                value={form.address_line1}
                onChange={handleChange}
                required
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Address Line 2</label>
              <input
                name="address_line2"
                value={form.address_line2}
                onChange={handleChange}
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Address Line 3</label>
              <input
                name="address_line3"
                value={form.address_line3}
                onChange={handleChange}
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>City *</label>
              {isCustomCity ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="Enter city name"
                    required
                    disabled={form.is_corporate_address}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomCity(false)}
                    disabled={form.is_corporate_address}
                    style={{
                      padding: '0 12px',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                      borderRadius: '4px',
                      cursor: form.is_corporate_address ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      height: '30px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>list</span>
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
                  compact={true}
                />
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>State *</label>
              <CustomStateSelect
                value={form.state}
                onChange={handleChange}
                disabled={form.is_corporate_address}
                compact={true}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Pincode *</label>
              <input
                name="pincode"
                value={form.pincode}
                onChange={handleChange}
                required
                disabled={form.is_corporate_address}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', background: form.is_corporate_address ? '#F3F4F6' : 'white', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '10px' }}>
            <h4 style={{ color: '#1F2937', margin: 0, fontSize: '0.9rem' }}>Customer Site Contact (mandatory)</h4>
            {!showSpoc2 && (
              <button
                type="button"
                onClick={() => setShowSpoc2(true)}
                style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                Add Second SPOC
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: showSpoc2 ? '10px' : '12px', rowGap: '6px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Contact Person Name (SPOC 1) *</label>
              <input name="contact_name" value={form.contact_name} onChange={handleChange} placeholder="Full Name" style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Contact Email *</label>
              <input type="email" name="contact_email" value={form.contact_email} onChange={handleChange} placeholder="email@example.com" style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '2px', color: '#4B5563', fontWeight: 500, fontSize: '0.8rem' }}>Contact Phone (10 digits) *</label>
              <input name="contact_phone" value={form.contact_phone} onChange={handleChange} placeholder="9876543210" style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '30px', boxSizing: 'border-box' }} />
            </div>
          </div>

          {showSpoc2 && (
            <div style={{ background: '#F9FAFB', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E5E7EB', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h5 style={{ margin: 0, color: '#374151', fontSize: '0.8rem' }}>Second SPOC Details</h5>
                <button type="button" onClick={() => setShowSpoc2(false)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.75rem' }}>Remove</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', rowGap: '4px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '1px', color: '#4B5563', fontSize: '0.75rem' }}>Name</label>
                  <input name="spoc2_name" value={form.spoc2_name} onChange={handleChange} style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '26px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '1px', color: '#4B5563', fontSize: '0.75rem' }}>Phone</label>
                  <input name="spoc2_phone" value={form.spoc2_phone} onChange={handleChange} style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '26px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '1px', color: '#4B5563', fontSize: '0.75rem' }}>Email</label>
                  <input name="spoc2_email" value={form.spoc2_email} onChange={handleChange} style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem', height: '26px', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '10px' }}>
            <button type="button" onClick={onClose} style={{ padding: '4px 16px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', height: '30px' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={{ padding: '4px 16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: submitting ? 0.7 : 1, fontSize: '0.8rem', height: '30px' }}>
              {submitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Location')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
