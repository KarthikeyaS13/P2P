import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser } from './auth';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Login from './components/Login';

import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import CustomerForm from './screens/CustomerForm';
import CustomerLocations from './screens/CustomerLocations';
import POManagement from './screens/POManagement';
import POReview from './screens/POReview';
import DCRequest from './screens/DCRequest';
import NewPO from './screens/NewPO';
import PODetails from './screens/PODetails';
import NewNTPO from './screens/NewNTPO';
import EditPO from './screens/EditPO';
import NewInvoice from './screens/NewInvoice';
import ARDatabase from './screens/ARDatabase';
import RaiseDC from './screens/RaiseDC';
import InvoiceRequest from './screens/InvoiceRequest';
import InvoiceApproval from './screens/InvoiceApproval';
import DispatchConfirmation from './screens/DispatchConfirmation';
import ProjectsModule from './screens/ProjectsModule';
import MasterAddress from './screens/MasterAddress';

import { useAuth } from './context/AuthContext';

function RoleGate({ allowedRoles, children }) {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase();

  if (allowedRoles.includes(userRole) || userRole === 'admin') {
    return children;
  }
  return <Navigate to="/dashboard" replace />;
}

function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // const isSales = user?.role?.toLowerCase() === 'sales';

  if (!user) {
    return <Login onSuccess={() => navigate('/')} />;
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar />

        <main className="main-content" id="main-content">
          <Header />

          <div className="main-content__inner">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/master-address" element={<MasterAddress />} />

              {/* Sales / Admin */}
              <Route path="/customers" element={<RoleGate allowedRoles={['sales']}><Customers /></RoleGate>} />
              <Route path="/customers/new" element={<RoleGate allowedRoles={['sales']}><CustomerForm /></RoleGate>} />
              <Route path="/customers/:id" element={<RoleGate allowedRoles={['sales']}><CustomerForm /></RoleGate>} />
              <Route path="/customers/:id/edit" element={<RoleGate allowedRoles={['sales']}><CustomerForm /></RoleGate>} />
              <Route path="/customers/:id/locations" element={<RoleGate allowedRoles={['sales']}><CustomerLocations /></RoleGate>} />
              <Route path="/new-po" element={<RoleGate allowedRoles={['sales']}><NewPO /></RoleGate>} />
              <Route path="/new-nt-po" element={<RoleGate allowedRoles={['sales']}><NewNTPO /></RoleGate>} />
              <Route path="/edit-po" element={<RoleGate allowedRoles={['sales']}><EditPO /></RoleGate>} />
              <Route path="/invoice-request" element={<RoleGate allowedRoles={['sales']}><InvoiceRequest /></RoleGate>} />
              <Route path="/invoice-request/:id" element={<RoleGate allowedRoles={['sales']}><InvoiceRequest /></RoleGate>} />

              {/* Shared Access */}
              <Route path="/purchase-orders" element={<POManagement />} />
              <Route path="/pos/:id" element={<PODetails />} />

              {/* Accounts / Admin */}
              <Route path="/po-review" element={<RoleGate allowedRoles={['accounts']}><POReview /></RoleGate>} />
              <Route path="/po-review/:id" element={<RoleGate allowedRoles={['accounts']}><POReview /></RoleGate>} />
              <Route path="/raise-dc" element={<RoleGate allowedRoles={['accounts']}><RaiseDC /></RoleGate>} />
              <Route path="/raise-dc/:id" element={<RoleGate allowedRoles={['accounts']}><RaiseDC /></RoleGate>} />
              <Route path="/invoice-approval" element={<RoleGate allowedRoles={['accounts']}><InvoiceApproval /></RoleGate>} />
              <Route path="/invoice-approval/:id" element={<RoleGate allowedRoles={['accounts']}><InvoiceApproval /></RoleGate>} />
              <Route path="/new-invoice" element={<RoleGate allowedRoles={['sales']}><NewInvoice /></RoleGate>} />
              <Route path="/ar-database" element={<RoleGate allowedRoles={['accounts', 'sales']}><ARDatabase /></RoleGate>} />

              {/* Stores / Admin */}
              <Route path="/dc-request" element={<RoleGate allowedRoles={['stores']}><DCRequest /></RoleGate>} />
              <Route path="/dispatch-confirmation" element={<RoleGate allowedRoles={['stores']}><DispatchConfirmation /></RoleGate>} />
              <Route path="/dispatch-confirmation/:id" element={<RoleGate allowedRoles={['stores']}><DispatchConfirmation /></RoleGate>} />

              {/* Projects */}
              <Route path="/projects" element={<RoleGate allowedRoles={['projects', 'sales']}><ProjectsModule /></RoleGate>} />

              {/* Management / Auditor */}
              <Route path="/analytics" element={
                <RoleGate allowedRoles={['management', 'auditor']}>
                  <div className="screen-enter">
                    <div className="page-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button onClick={() => navigate('/dashboard')} className="btn-ghost" style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid var(--outline-variant)' }}>
                          <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                          <h1 className="text-h1 page-header__title">Analytics</h1>
                          <p className="page-header__subtitle">Coming soon...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </RoleGate>
              } />

              <Route path="/settings" element={
                <div className="screen-enter">
                  <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <button onClick={() => navigate('/dashboard')} className="btn-ghost" style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid var(--outline-variant)' }}>
                        <span className="material-symbols-outlined">arrow_back</span>
                      </button>
                      <div>
                        <h1 className="text-h1 page-header__title">Settings</h1>
                        <p className="page-header__subtitle">Coming soon...</p>
                      </div>
                    </div>
                  </div>
                </div>
              } />
            </Routes>
          </div>
        </main>
      </div>
    </>
  );
}

export default App;
