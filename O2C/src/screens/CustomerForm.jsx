import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { INDIAN_STATES } from '../utils/states';
import CustomStateSelect from '../components/CustomStateSelect';
import CustomCitySelect from '../components/CustomCitySelect';
import { POPULAR_CITIES } from '../utils/cities';

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;

  const [isCustomCity, setIsCustomCity] = useState(false);
  const [form, setForm] = useState({
    cust_code: '',
    name: '',
    legal_name: '',
    gstin: '',
    pan: '',
    address_line1: '',
    address_line2: '',
    address_line3: '',
    city: '',
    state: '',
    pincode: '',
    contact_name: '',
    contact_department: '',
    contact_email: '',
    contact_phone: '',
    spoc2_name: '',
    spoc2_department: '',
    spoc2_email: '',
    spoc2_phone: ''
  });

  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEdit) {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      axios.get(`/api/customers/${id}`, { headers })
        .then(res => {
          setForm(res.data);
          if (res.data.city) {
            const isPop = POPULAR_CITIES.some(c => c.name.toLowerCase() === res.data.city.toLowerCase());
            setIsCustomCity(!isPop);
          } else {
            setIsCustomCity(false);
          }
        })
        .catch(err => {
          /* console.error(err); */
          Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load customer details' });
          navigate('/customers');
        })
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    let { name, value } = e.target;

    // Auto-capitalize and limit lengths
    if (name === 'gstin' || name === 'pan') {
      value = value.toUpperCase().slice(0, name === 'gstin' ? 15 : 10);
    }
    if (name === 'contact_phone' || name === 'spoc2_phone' || name === 'pincode') {
      value = value.replace(/\D/g, '').slice(0, (name === 'contact_phone' || name === 'spoc2_phone') ? 10 : 6);
    }
    if (name === 'cust_code') {
      value = value.slice(0, 10);
    }

    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const errors = [];
    if (!form.cust_code?.trim()) errors.push('Customer ID required');
    if (form.cust_code && form.cust_code.trim().length > 10) errors.push('Customer ID must not exceed 10 characters');
    if (!form.name?.trim()) errors.push('Customer name required');
    if (!form.gstin?.trim()) errors.push('GSTIN required');
    if (form.gstin?.length !== 15) errors.push('GSTIN must be 15 characters');

    // PAN validation and matching
    if (form.pan && form.pan.length !== 10) {
      errors.push('PAN must be 10 characters');
    }
    if (form.gstin && form.gstin.length === 15) {
      const panFromGstin = form.gstin.substring(2, 12);
      if (!form.pan) {
        errors.push('PAN Number is required');
      } else if (form.pan !== panFromGstin) {
        errors.push('PAN Number must match the PAN portion (characters 3-12) of the GSTIN');
      }
    }

    if (form.contact_phone && form.contact_phone.length !== 10) errors.push('Contact number must be 10 digits');
    if (!form.pincode?.trim()) errors.push('Pincode required');
    if (!form.contact_name?.trim()) errors.push('Contact Person Name (SPOC 1) is mandatory');
    if (!form.contact_phone?.trim()) errors.push('Contact Phone (SPOC 1) is mandatory');

    // Uniqueness validation between Primary and Secondary contacts
    if (form.spoc2_phone) {
      if (form.spoc2_phone.length !== 10) {
        errors.push('Secondary Contact Phone must be 10 digits');
      }
      if (form.contact_phone === form.spoc2_phone) {
        errors.push('Primary and Secondary Contact Phone numbers cannot be the same');
      }
    }
    if (form.spoc2_email && form.spoc2_email.trim() && form.contact_email?.trim().toLowerCase() === form.spoc2_email.trim().toLowerCase()) {
      errors.push('Primary and Secondary Contact Emails cannot be the same');
    }
    if (form.spoc2_name && form.spoc2_name.trim() && form.contact_name?.trim().toLowerCase() === form.spoc2_name.trim().toLowerCase()) {
      errors.push('Primary and Secondary Contact Names cannot be the same');
    }

    if (errors.length > 0) {
      Swal.fire({ icon: 'warning', title: 'Incomplete Form', html: errors.join('<br/>') });
      return;
    }

    setSubmitting(true);
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const payload = {
      cust_code: form.cust_code,
      name: form.name,
      legal_name: form.legal_name || '',
      gstin: form.gstin,
      pan: form.pan || '',
      address_line1: form.address_line1 || '',
      address_line2: form.address_line2 || '',
      address_line3: form.address_line3 || '',
      city: form.city || '',
      state: form.state || '',
      pincode: form.pincode,
      contact_name: form.contact_name || '',
      contact_department: form.contact_department || '',
      contact_email: form.contact_email || '',
      contact_phone: form.contact_phone || '',
      spoc2_name: form.spoc2_name || '',
      spoc2_department: form.spoc2_department || '',
      spoc2_email: form.spoc2_email || '',
      spoc2_phone: form.spoc2_phone || '',
      email: form.contact_email || '',
      phone: form.contact_phone || ''
    };

    if (isEdit) {
      axios.put(`/api/customers/${id}`, payload, { headers })
        .then(() => {
          Swal.fire({ icon: 'success', title: 'Updated', text: 'Customer updated successfully', timer: 2000, showConfirmButton: false });
          navigate('/customers');
        })
        .catch(err => Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to update' }))
        .finally(() => setSubmitting(false));
    } else {
      axios.post('/api/customers', payload, { headers })
        .then(res => {
          const newId = res.data.id;
          Swal.fire({ icon: 'success', title: 'Customer Created', text: 'Customer created! Now add their locations.', timer: 3000, showConfirmButton: false });
          navigate(`/customers/${newId}/locations`);
        })
        .catch(err => Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to create' }))
        .finally(() => setSubmitting(false));
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  const labelStyle = { display: 'block', marginBottom: '3px', color: '#4B5563', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.02em' };
  const inputStyle = {
    width: '100%',
    height: '32px',
    padding: '0 10px',
    borderRadius: '4px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'all 0.2s ease',
    background: 'white'
  };
  const sectionTitleStyle = { color: 'var(--primary)', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '10px', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' };

  return (
    <div style={{ padding: '0 0 16px 0', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <button
          onClick={() => navigate('/customers')}
          className="btn-ghost btn-back"
          style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
        </button>
        <h2 style={{ margin: 0, color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>{isEdit ? 'Edit Customer' : 'Onboard New Customer'}</h2>
      </div>

      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>

        {/* Section 1 - Customer Info */}
        <h3 style={sectionTitleStyle}>Customer Info</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Customer Name (Internal) *</label>
            <input className="custom-form-input" name="name" value={form.name} onChange={handleChange} placeholder="As per your books" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Customer Legal Name (as per PAN)</label>
            <input className="custom-form-input" name="legal_name" value={form.legal_name} onChange={handleChange} placeholder="As per PAN / GST" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Customer ID * (User Created, Max length 10 characters.)</label>
            <input className="custom-form-input" name="cust_code" value={form.cust_code} onChange={handleChange} style={inputStyle} placeholder="E.g. CUST001" disabled={isEdit} />
          </div>
          <div>
            <label style={labelStyle}>GSTIN *(unique-pan validated)</label>
            <input className="custom-form-input" name="gstin" value={form.gstin} onChange={handleChange} placeholder="27AADCB2230M1Z2" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>PAN Number</label>
            <input className="custom-form-input" name="pan" value={form.pan} onChange={handleChange} style={inputStyle} placeholder="10 characters" />
          </div>
        </div>

        {/* Section 2 - Corporate Address */}
        <h3 style={sectionTitleStyle}>Corporate Address</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Address Line 1 *</label>
            <input className="custom-form-input" name="address_line1" value={form.address_line1} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Address Line 2</label>
            <input className="custom-form-input" name="address_line2" value={form.address_line2} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Address Line 3</label>
            <input className="custom-form-input" name="address_line3" value={form.address_line3} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>City *</label>
            {isCustomCity ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="custom-form-input"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="Enter city name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setIsCustomCity(false)}
                  style={{
                    height: '32px',
                    padding: '0 10px',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    border: '1px solid #BFDBFE',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
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
                compact={true}
              />
            )}
          </div>
          <div>
            <label style={labelStyle}>State *</label>
            <CustomStateSelect
              value={form.state}
              onChange={handleChange}
              compact={true}
            />
          </div>
          <div>
            <label style={labelStyle}>Pincode *</label>
            <input className="custom-form-input" name="pincode" value={form.pincode} onChange={handleChange} style={inputStyle} />
          </div>
        </div>

        {/* Section 3 - Contact SPOC 1 */}
        <h3 style={sectionTitleStyle}>Customer Contact Person - Primary *</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.2fr', gap: '8px 12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Contact Person Name *</label>
            <input className="custom-form-input" name="contact_name" value={form.contact_name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Department</label>
            <input className="custom-form-input" name="contact_department" value={form.contact_department} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Official Phone (10 digits) *</label>
            <input className="custom-form-input" name="contact_phone" value={form.contact_phone} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Official Email</label>
            <input className="custom-form-input" type="email" name="contact_email" value={form.contact_email} onChange={handleChange} style={inputStyle} />
          </div>
        </div>

        {/* Section 4 - Contact SPOC 2 */}
        <h3 style={sectionTitleStyle}>Customer Contact Person - Secondary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.2fr', gap: '8px 12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Contact Person Name</label>
            <input className="custom-form-input" name="spoc2_name" value={form.spoc2_name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Department</label>
            <input className="custom-form-input" name="spoc2_department" value={form.spoc2_department} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Official Phone (10 digits)</label>
            <input className="custom-form-input" name="spoc2_phone" value={form.spoc2_phone} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Official Email</label>
            <input className="custom-form-input" type="email" name="spoc2_email" value={form.spoc2_email} onChange={handleChange} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #E5E7EB', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            style={{ height: '32px', padding: '0 16px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ height: '32px', padding: '0 16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '13px', opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Customer')}
          </button>
        </div>

      </form>
      <style>{`
        input.custom-form-input:focus {
          border-color: #3B82F6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
          transform: none !important;
        }
        input.custom-form-input:hover {
          border-color: #9CA3AF !important;
        }
        input.custom-form-input:disabled {
          background-color: #F3F4F6 !important;
          color: #9CA3AF !important;
          cursor: not-allowed !important;
          border-color: #E5E7EB !important;
        }
      `}</style>
    </div>
  );
}
