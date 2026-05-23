import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role?.toLowerCase();
  const isSales = role === 'sales';

  let routes = [];

  if (['admin', 'sales', 'stores', 'accounts', 'management', 'auditor'].includes(role)) {
    routes.push({ path: '/dashboard', label: 'Dashboard', icon: 'dashboard' });
  }

  if (role === 'admin') {
    routes = routes.concat([
      { path: '/customers', label: 'Customers', icon: 'group' },
      { path: '/project-users', label: 'Project User Management', icon: 'manage_accounts' },
      { path: '/po-flow', label: 'Status of Sales Order', icon: 'account_tree' },
    ]);
  } else if (role === 'sales') {
    routes = routes.concat([
      { path: '/new-po', label: 'New Sales Order', icon: 'add_shopping_cart' },
      { path: '/new-nt-po', label: 'New NT Sales Order', icon: 'post_add' },
      { path: '/edit-po', label: 'Edit Sales Order', icon: 'edit_document' },
      { path: '/invoice-request', label: 'Invoice Req', icon: 'receipt_long' },
    ]);
  } else if (role === 'projects') {
    routes = routes.concat([
      { path: '/projects', label: 'Project Site', icon: 'location_on' },
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
  } else if (role === 'management') {
    routes = routes.concat([
      { path: '/analytics', label: 'Reports', icon: 'analytics' },
    ]);
  } else if (role === 'auditor') {
    routes = routes.concat([
      { path: '/analytics', label: 'Audit Logs', icon: 'analytics' },
    ]);
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <div
          className="header__user"
          onClick={() => { if (role === 'admin') navigate('/master-address'); }}
          style={{
            marginTop: '0',
            marginBottom: '16px',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: role === 'admin' ? 'pointer' : 'default',
            padding: '6px 8px',
            borderRadius: '8px',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => { if (role === 'admin') e.currentTarget.style.background = '#F3F4F6'; }}
          onMouseLeave={(e) => { if (role === 'admin') e.currentTarget.style.background = 'transparent'; }}
          data-tooltip={user && role === 'admin' ? 'View My Profile' : (user ? `${user.full_name} (${user.role})` : 'User Profile')}
        >
          <div className="avatar-initials avatar-initials--primary">
            {user ? user.full_name?.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="header__user-info sidebar__text" style={{ textAlign: 'left' }}>
            {user ? (
              <>
                <span className="user-name">{user.full_name}</span>
                <span className="user-role">{user.role}</span>
              </>
            ) : (
              <span className="user-name">User Name</span>
            )}
          </div>
        </div>
        <h3 className="sidebar__text" style={{ fontSize: '18px', fontWeight: 800, margin: '6px 0 0 0', color: 'var(--text-primary)' }}>Enterprise O2C</h3>
        <p className="sidebar__text" style={{ fontSize: '10px', fontWeight: 700, margin: '2px 0 0 0', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Operational Suite</p>
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
      <div className="sidebar__footer">
        <a className="sidebar__link" href="#logout" onClick={(e) => { e.preventDefault(); logout(); navigate('/'); }} data-tooltip="Log Out">
          <span className="material-symbols-outlined">logout</span>
          <span className="sidebar__text">Log Out</span>
        </a>
      </div>
    </nav>
  );
}
