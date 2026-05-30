import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
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
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`/api/customers/${id}`, { headers })
      .then(res => {
        setCustomer(res.data);
        setLocations(res.data.locations || []);
      })
      .catch(err => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomerData();
  }, [id]);

  const handleDelete = async (locationId) => {
    const result = await Swal.fire({
      title: 'Delete Location?',
      text: "Are you sure you want to delete this location?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.delete(`/api/locations/${locationId}`, { headers });
        fetchCustomerData();
        Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Location has been deleted.', timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Cannot delete location' });
      }
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading locations...</div>;
  if (!customer) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Customer not found</div>;

  return (
    <div style={{ padding: '0 0 16px 0', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      <div className="page-header" style={{ marginBottom: '12px', marginTop: '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate('/customers')}
            className="btn-ghost btn-back"
            style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          </button>
          <h2 style={{ margin: 0, color: '#111827', fontSize: '1.2rem' }}>{customer.name} - Locations</h2>
        </div>
        {role === 'admin' && (
          <div className="page-header__actions">
            <button
              onClick={() => { setEditingLocation(null); setShowForm(true); }}
              className="btn btn-primary"
              style={{
                background: '#059669',
                color: 'white',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem'
              }}
            >
              + Add New Location
            </button>
          </div>
        )}
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px 14px', borderRadius: '6px', marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        <div><strong style={{ color: '#1E3A8A' }}>GSTIN:</strong> <span style={{ color: '#1E40AF' }}>{customer.gstin || 'N/A'}</span></div>
        <div><strong style={{ color: '#1E3A8A' }}>CUST Code:</strong> <span style={{ color: '#1E40AF' }}>{customer.cust_code}</span></div>
        <div><strong style={{ color: '#1E3A8A' }}>Contact:</strong> <span style={{ color: '#1E40AF' }}>{customer.contact_name || customer.email || 'N/A'}</span></div>
      </div>

      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', color: '#92400E', fontSize: '0.82rem' }}>
        <ul style={{ margin: 0, paddingLeft: '16px' }}>
          <li>No limit on number of locations per customer</li>
          <li>One customer can have multiple locations or projects</li>
          <li><strong>Pincode is mandatory</strong> as DC will pick up this location address</li>
        </ul>
      </div>

      {locations.length === 0 ? (
        <div style={{ background: 'white', padding: '24px', borderRadius: '6px', textAlign: 'center', color: '#6B7280', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          No locations added yet. Add a project or branch location.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {locations.map(loc => (
            <div key={loc.id} style={{ background: 'white', padding: '12px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', minHeight: '170px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#111827', fontWeight: '600', flex: 1, paddingRight: '8px' }}>{loc.label}</h3>
              </div>

              <div style={{ marginBottom: '8px', flex: 1, fontSize: '0.85rem', color: '#4B5563' }}>
                <p style={{ margin: '0 0 2px', fontWeight: 500, color: '#374151' }}>Address:</p>
                <p style={{ margin: '0 0 1px' }}>{loc.address_line1}</p>
                {loc.address_line2 && <p style={{ margin: '0 0 1px' }}>{loc.address_line2}</p>}
                {loc.address_line3 && <p style={{ margin: '0 0 1px' }}>{loc.address_line3}</p>}
                <p style={{ margin: '0 0 4px' }}>{loc.city}{loc.city && loc.state ? ', ' : ''}{loc.state} - {loc.pincode}</p>

                {loc.gstin && (
                  <p style={{ margin: '0 0 4px' }}><strong style={{ color: '#111827' }}>GSTIN:</strong> {loc.gstin}</p>
                )}

                {(loc.contact_name || loc.contact_email || loc.contact_phone) && (
                  <div style={{ marginTop: '6px', borderTop: '1px solid #E5E7EB', paddingTop: '6px' }}>
                    <span style={{ fontWeight: 500, color: '#374151', display: 'block', marginBottom: '2px' }}>Contact:</span>
                    {loc.contact_name && <p style={{ margin: '0 0 1px' }}>{loc.contact_name}</p>}
                    {loc.contact_email && <p style={{ margin: '0 0 1px' }}>{loc.contact_email}</p>}
                    {loc.contact_phone && <p style={{ margin: '0 0 1px' }}>{loc.contact_phone}</p>}
                  </div>
                )}
              </div>

              {role === 'admin' && (
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #E5E7EB', paddingTop: '8px', marginTop: 'auto' }}>
                  <button 
                    onClick={() => { setEditingLocation(loc); setShowForm(true); }}
                    style={{ flex: 1, padding: '5px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span> Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(loc.id)}
                    style={{ flex: 1, padding: '5px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span> Delete
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
          customer={customer}
          corporateGST={customer.gstin}
          location={editingLocation} 
          onClose={() => setShowForm(false)} 
          onRefresh={fetchCustomerData} 
        />
      )}

    </div>
  );
}
