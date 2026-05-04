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
import NewInvoice from './screens/NewInvoice';
import ARDatabase from './screens/ARDatabase';

import { useAuth } from './context/AuthContext';

function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSales = user?.role?.toLowerCase() === 'sales';

  if (!user) {
    return <Login onSuccess={() => navigate('/')} />;
  }

  return (
    <>
      <Header />
      <div className="app-layout">
        <Sidebar />
        <main className={`main-content ${isSales ? 'main-content--full' : ''}`} id="main-content">
          <div className="main-content__inner">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/new" element={<CustomerForm />} />
              <Route path="/customers/:id/edit" element={<CustomerForm />} />
              <Route path="/customers/:id/locations" element={<CustomerLocations />} />
              <Route path="/purchase-orders" element={<POManagement />} />
              <Route path="/po-review" element={<POReview />} />
              <Route path="/dc-request" element={<DCRequest />} />
              <Route path="/new-po" element={<NewPO />} />
              <Route path="/new-nt-po" element={<NewNTPO />} />
              <Route path="/pos/:id" element={<PODetails />} />
              <Route path="/new-invoice" element={<NewInvoice />} />
              <Route path="/ar-database" element={<ARDatabase />} />
              <Route path="/analytics" element={<div className="screen-enter"><h1 className="text-h1">Analytics</h1><p className="text-body" style={{marginTop: '8px'}}>Coming soon...</p></div>} />
              <Route path="/settings" element={<div className="screen-enter"><h1 className="text-h1">Settings</h1><p className="text-body" style={{marginTop: '8px'}}>Coming soon...</p></div>} />
            </Routes>
          </div>
        </main>
      </div>
    </>
  );
}

export default App;
