import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import LocationForm from '../components/LocationForm';
import { useAuth } from '../context/AuthContext';

export default function CustomerLocations() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();

  const [customer, setCustomer] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);

  const fetchCustomerData = () => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`http://localhost:3000/api/customers/${id}`, { headers })
      .then(res => {
        setCustomer(res.data);
        setLocations(res.data.locations || []);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomerData();
  }, [id]);

  const handleDelete = (locationId) => {
    if (window.confirm('Are you sure you want to delete this location?')) {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      axios.delete(`http://localhost:3000/api/locations/${locationId}`, { headers })
        .then(() => fetchCustomerData())
        .catch(err => alert(err.response?.data?.error || 'Cannot delete location'));
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading locations...</div>;
  if (!customer) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Customer not found</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/customers')}
            style={{ padding: '8px 16px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, color: '#111827' }}>{customer.name} - Locations</h2>
        </div>
        {role === 'admin' && (
          <button
            onClick={() => { setEditingLocation(null); setShowForm(true); }}
            style={{
              background: '#059669',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            + Add New Location
          </button>
        )}
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div><strong style={{ color: '#1E3A8A' }}>GSTIN:</strong> <span style={{ color: '#1E40AF' }}>{customer.gstin || 'N/A'}</span></div>
        <div><strong style={{ color: '#1E3A8A' }}>CUST Code:</strong> <span style={{ color: '#1E40AF' }}>{customer.cust_code}</span></div>
        <div><strong style={{ color: '#1E3A8A' }}>Contact:</strong> <span style={{ color: '#1E40AF' }}>{customer.contact_name || customer.email || 'N/A'}</span></div>
      </div>

      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', color: '#92400E', fontSize: '0.9rem' }}>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>No limit on number of locations per customer</li>
          <li>One customer can have multiple locations or projects</li>
          <li><strong>Pincode is mandatory</strong> as DC will pick up this location address</li>
        </ul>
      </div>

      {locations.length === 0 ? (
        <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#6B7280', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          No locations added yet. Add a project or branch location.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
          {locations.map(loc => (
            <div key={loc.id} style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#111827', flex: 1, paddingRight: '12px' }}>{loc.label}</h3>
              </div>

              <div style={{ marginBottom: '16px', flex: 1, fontSize: '0.9rem', color: '#4B5563' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 500, color: '#374151' }}>Address:</p>
                <p style={{ margin: '0 0 2px' }}>{loc.address_line1}</p>
                {loc.address_line2 && <p style={{ margin: '0 0 2px' }}>{loc.address_line2}</p>}
                {loc.address_line3 && <p style={{ margin: '0 0 2px' }}>{loc.address_line3}</p>}
                <p style={{ margin: '0 0 8px' }}>{loc.city}{loc.city && loc.state ? ', ' : ''}{loc.state} - {loc.pincode}</p>

                {loc.gstin && (
                  <p style={{ margin: '0 0 8px' }}><strong style={{ color: '#111827' }}>GSTIN:</strong> {loc.gstin}</p>
                )}

                {(loc.contact_name || loc.contact_email || loc.contact_phone) && (
                  <>
                    <p style={{ margin: '8px 0 4px', fontWeight: 500, color: '#374151', borderTop: '1px solid #E5E7EB', paddingTop: '8px' }}>Contact:</p>
                    {loc.contact_name && <p style={{ margin: '0 0 2px' }}>{loc.contact_name}</p>}
                    {loc.contact_email && <p style={{ margin: '0 0 2px' }}>{loc.contact_email}</p>}
                    {loc.contact_phone && <p style={{ margin: '0 0 2px' }}>{loc.contact_phone}</p>}
                  </>
                )}
              </div>

              {role === 'admin' && (
                <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                  <button 
                    onClick={() => { setEditingLocation(loc); setShowForm(true); }}
                    style={{ flex: 1, padding: '8px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span> Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(loc.id)}
                    style={{ flex: 1, padding: '8px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <LocationForm 
          customerId={id} 
          corporateGST={customer.gstin}
          location={editingLocation} 
          onClose={() => setShowForm(false)} 
          onRefresh={fetchCustomerData} 
        />
      )}

    </div>
  );
}
