import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span className="app-header__brand">O2C Command Center</span>
      </div>
      <div className="app-header__actions">
        <input className="app-header__search" placeholder="Search across modules..." type="text" id="global-search" />
        <div className="app-header__icons">
          <span className="material-symbols-outlined tooltip" data-tooltip="Notifications">notifications</span>
          <span className="material-symbols-outlined tooltip" data-tooltip="Help">help_outline</span>
          <span className="app-header__divider"></span>
          <div className="header__user" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="avatar-initials avatar-initials--primary" style={{ width: '32px', height: '32px', borderRadius: '50%', fontSize: '12px' }}>
              {user ? user.full_name?.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="header__user-info" style={{ display: 'flex', flexDirection: 'column' }}>
              {user ? (
                <>
                  <span style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '14px' }}>{user.full_name}</span>
                  <span style={{ fontSize: '12px', color: 'var(--secondary)', textTransform: 'capitalize' }}>{user.role}</span>
                </>
              ) : (
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#1a1c1a' }}>User Name</span>
              )}
            </div>
            {user && (
              <div>
                <button onClick={handleLogout} className="btn-ghost" style={{ color: 'var(--error)', fontSize: '12px', padding: '4px 8px', marginLeft: '8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
