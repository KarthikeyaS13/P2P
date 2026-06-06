import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role?.toLowerCase();
  const isSales = role === 'sales';

  const [branding, setBranding] = useState({
    logo_path: null,
    department_name: '',
    organization_name: ''
  });

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters');
      return;
    }

    setPwLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      await axios.post('/api/change-password', {
        currentPassword,
        newPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPwSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPwSuccess('');
      }, 1500);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password. Please verify current password.');
    } finally {
      setPwLoading(false);
    }
  };

  const fetchBranding = async () => {
    try {
      const res = await axios.get('/api/branding');
      setBranding(res.data);
    } catch (err) {
      /* console.error("Failed to fetch branding:", err); */
    }
  };

  useEffect(() => {
    fetchBranding();

    const handleUpdate = () => {
      fetchBranding();
    };

    window.addEventListener('branding-updated', handleUpdate);
    return () => {
      window.removeEventListener('branding-updated', handleUpdate);
    };
  }, []);

  let routes = [];

  if (role === 'management') {
    routes = [
      { path: '/management-dashboard', label: 'Dashboard', icon: 'dashboard' },
    ];
  } else {
    if (['admin', 'sales', 'stores', 'accounts'].includes(role)) {
      routes.push({ path: '/dashboard', label: 'Dashboard', icon: 'dashboard' });
    }

    if (role === 'admin') {
      routes = routes.concat([
        { path: '/customers', label: 'Customers', icon: 'group' },
        { path: '/po-flow', label: 'Status of Sales Order', icon: 'account_tree' },
        { path: '/project-users', label: 'User Management', icon: 'manage_accounts' },
        { path: '/scr', label: 'SCR', icon: 'assignment_turned_in' },
      ]);
    } else if (role === 'sales') {
      routes = routes.concat([
        { path: '/new-po', label: 'New Sales Order', icon: 'add_shopping_cart' },
        { path: '/new-nt-po', label: 'New NT Sales Order', icon: 'post_add' },
        { path: '/edit-po', label: 'Edit Sales Order', icon: 'edit_document' },
        { path: '/invoice-request', label: 'Sales Invoice Request', icon: 'receipt_long' },
        { path: '/reports', label: 'Reports', icon: 'analytics' },
      ]);
    } else if (role === 'projects') {
      routes = routes.concat([
        { path: '/projects', label: 'Project Site', icon: 'location_on' },
        { path: '/scr', label: 'SCR', icon: 'assignment_turned_in' },
      ]);
    } else if (role === 'stores') {
      routes = routes.concat([
        { path: '/dc-request', label: 'Delivery Challan Requests', icon: 'local_shipping' },
        { path: '/dispatch-confirmation', label: "Accepted Delivery Challans", icon: 'inventory' },
      ]);
    } else if (role === 'accounts') {
      routes = routes.concat([
        { path: '/verify', label: 'Verify Document', icon: 'gpp_good' },
        { path: '/po-review', label: 'Sales Order Review', icon: 'rate_review' },
        { path: '/raise-dc', label: 'Raise Delivery Challan', icon: 'local_shipping' },
        { path: '/invoice-approval', label: 'Invoice Approval', icon: 'receipt_long' },
        { path: '/ar-database', label: 'AR Database', icon: 'payments' },
      ]);
    }
  }

  const logoSrc = branding.logo_path
    ? (branding.logo_path.startsWith('http') || branding.logo_path.startsWith('blob:')
      ? branding.logo_path
      : `${API_BASE_URL}${branding.logo_path}`)
    : null;

  return (
    <nav className="sidebar">
      <div className="sidebar__brand" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px 0px 4px 0px', marginTop: '0px' }}>
        {logoSrc ? (
          <img 
            src={logoSrc} 
            alt="Company Logo" 
            style={{ 
              width: '100%',
              maxHeight: '64px',
              objectFit: 'contain', 
              display: 'block',
              paddingLeft: '16px',
              paddingRight: '16px',
              boxSizing: 'border-box'
            }} 
          />
        ) : (
          <div style={{ padding: '0 24px', width: '100%', boxSizing: 'border-box' }}>
            <div 
              onClick={() => { if (role === 'admin') navigate('/master-address', { state: { activeSection: 'branding' } }); }}
              style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '6px', 
                background: '#F8FAFC',
                border: '1.5px dashed #CBD5E1',
                padding: '10px 14px',
                borderRadius: '8px',
                color: '#64748B',
                cursor: role === 'admin' ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                width: '100%',
                boxSizing: 'border-box',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                if (role === 'admin') {
                  e.currentTarget.style.borderColor = '#3B82F6';
                  e.currentTarget.style.background = '#EFF6FF';
                  e.currentTarget.style.color = '#1D4ED8';
                }
              }}
              onMouseLeave={(e) => {
                if (role === 'admin') {
                  e.currentTarget.style.borderColor = '#CBD5E1';
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.color = '#64748B';
                }
              }}
              title={role === 'admin' ? "Click to upload company logo" : "Upload your company logo"}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>add_photo_alternate</span>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>[ Your Logo Here ]</span>
            </div>
          </div>
        )}
        {branding.organization_name && (
          <div style={{ padding: '0 24px', width: '100%', boxSizing: 'border-box' }}>
            <h3 className="sidebar__text" style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0 0 0', color: '#0F172A', lineHeight: 1.2, letterSpacing: '0.2px', textAlign: 'center', width: '100%' }}>
              {branding.organization_name}
            </h3>
          </div>
        )}

        {/* Compact User profile section */}
        <div style={{ padding: '0 24px', width: '100%', boxSizing: 'border-box' }}>
          <div
            className="header__user"
            onClick={() => { if (role === 'admin') navigate('/master-address'); }}
            style={{
              marginTop: '8px',
              marginBottom: '0px',
              marginLeft: '-8px',
              marginRight: '-8px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: role === 'admin' ? 'pointer' : 'default',
              padding: '4px 8px',
              borderRadius: '8px',
              transition: 'all 0.2s',
              border: '1px solid transparent'
            }}
            onMouseEnter={(e) => { 
              if (role === 'admin') {
                e.currentTarget.style.background = '#F1F5F9'; 
                e.currentTarget.style.borderColor = '#E2E8F0';
              } 
            }}
            onMouseLeave={(e) => { 
              if (role === 'admin') {
                e.currentTarget.style.background = 'transparent'; 
                e.currentTarget.style.borderColor = 'transparent';
              } 
            }}
            data-tooltip={user && role === 'admin' ? 'View My Profile' : (user ? `${user.full_name} (${user.role})` : 'User Profile')}
          >
            <div className="avatar-initials avatar-initials--primary" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
              {user ? user.full_name?.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="header__user-info sidebar__text" style={{ textAlign: 'left' }}>
              {user ? (
                <>
                  <span className="user-name" style={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.1 }}>{user.full_name}</span>
                  <span className="user-role" style={{ fontSize: '0.72rem', color: '#6B7280', lineHeight: 1.1 }}>{user.role}</span>
                </>
              ) : (
                <span className="user-name">User Name</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="sidebar__nav">
        {routes.map(r => (
          <NavLink
            key={r.path}
            to={r.path}
            className={({ isActive }) => `sidebar__link ${isActive ? 'active' : ''}`}
            data-tooltip={r.label}
          >
            <span className="material-symbols-outlined">{r.icon}</span>
            <span className="sidebar__text">{r.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="sidebar__footer" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <a className="sidebar__link" href="#change-pw" onClick={(e) => { e.preventDefault(); setShowChangePassword(true); }} data-tooltip="Change Password">
          <span className="material-symbols-outlined">lock_reset</span>
          <span className="sidebar__text">Change Password</span>
        </a>
        <a className="sidebar__link" href="#logout" onClick={(e) => { e.preventDefault(); logout(); navigate('/'); }} data-tooltip="Log Out">
          <span className="material-symbols-outlined">logout</span>
          <span className="sidebar__text">Log Out</span>
        </a>
      </div>
      {showChangePassword && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => setShowChangePassword(false)}
        >
          <div 
            style={{
              background: '#ffffff',
              width: '100%',
              maxWidth: '380px',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'pwModalEnter 0.2s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: '#4F46E5', fontSize: '24px' }}>lock_reset</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>Change Password</h3>
              </div>
              <button 
                onClick={() => setShowChangePassword(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span className="material-symbols-outlined" style={{ color: '#64748B', fontSize: '20px' }}>close</span>
              </button>
            </div>

            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {pwError && (
                <div style={{ background: '#FEF2F2', borderLeft: '4px solid #EF4444', color: '#991B1B', padding: '10px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500 }}>
                  {pwError}
                </div>
              )}
              
              {pwSuccess && (
                <div style={{ background: '#ECFDF5', borderLeft: '4px solid #10B981', color: '#065F46', padding: '10px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500 }}>
                  {pwSuccess}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 650, color: '#475569', textAlign: 'left' }}>Current Password</label>
                <input 
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter current password"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = '#4F46E5'}
                  onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 650, color: '#475569', textAlign: 'left' }}>New Password</label>
                <input 
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  placeholder="Minimum 6 characters"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = '#4F46E5'}
                  onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 650, color: '#475569', textAlign: 'left' }}>Confirm New Password</label>
                <input 
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = '#4F46E5'}
                  onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                />
              </div>

              <button 
                type="submit" 
                disabled={pwLoading}
                className="btn-primary"
                style={{
                  marginTop: '6px',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  border: 'none',
                  cursor: pwLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
          <style>{`
            @keyframes pwModalEnter {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </nav>
  );
}
