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
      { path: '/master-address', label: 'Master Address', icon: 'location_on' },
      { path: '/projects', label: 'Project Site', icon: 'location_on' },
    ]);
  } else if (role === 'sales') {
    routes = routes.concat([
      { path: '/new-po', label: 'New PO', icon: 'add_shopping_cart' },
      { path: '/edit-po', label: 'Edit PO', icon: 'edit_document' },
      { path: '/invoice-request', label: 'Invoice Req', icon: 'receipt_long' },
    ]);
  } else if (role === 'projects') {
    routes = routes.concat([
      { path: '/projects', label: 'Project Site', icon: 'location_on' },
    ]);
  } else if (role === 'stores') {
    routes = routes.concat([
      { path: '/dc-request', label: 'DC Requests', icon: 'local_shipping' },
      { path: '/dispatch-confirmation', label: "Accepted DC's", icon: 'inventory' },
    ]);
  } else if (role === 'accounts') {
    routes = routes.concat([
      { path: '/po-review', label: 'PO Review', icon: 'rate_review' },
      { path: '/raise-dc', label: 'Issue DC', icon: 'local_shipping' },
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
        <h2>Enterprise O2C</h2>
        <p>Operational Suite</p>
      </div>
      <div className="sidebar__nav">
        {routes.map(r => (
          <NavLink 
            key={r.path} 
            to={r.path} 
            className={({ isActive }) => `sidebar__link ${isActive ? 'active' : ''}`}
          >
            <span className="material-symbols-outlined">{r.icon}</span>{r.label}
          </NavLink>
        ))}
      </div>
      <div className="sidebar__footer">
        <a className="sidebar__link" href="#support" onClick={e => e.preventDefault()}>
          <span className="material-symbols-outlined">contact_support</span>Support
        </a>
        <a className="sidebar__link" href="#logout" onClick={(e) => { e.preventDefault(); logout(); navigate('/'); }}>
          <span className="material-symbols-outlined">logout</span>Log Out
        </a>
      </div>
    </nav>
  );
}
