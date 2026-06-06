import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function ManagementDashboard() {
  const navigate = useNavigate();

  // Internal Screen Navigation State ('screen1', 'screen2', 'screen3')
  const [currentScreen, setCurrentScreen] = useState('screen1');

  // Master Data State
  const [overallSummary, setOverallSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loadingOverall, setLoadingOverall] = useState(true);

  // Screen 2 Select State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSoId, setSelectedSoId] = useState('');
  const [customerOrders, setCustomerOrders] = useState([]);

  // Screen 3 Details State
  const [selectionType, setSelectionType] = useState(null); // 'customer' or 'so'
  const [customerDetail, setCustomerDetail] = useState(null);
  const [soDetail, setSoDetail] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Load initial overall statistics and customer list
  useEffect(() => {
    fetchOverallSummary();
    fetchCustomers();
  }, []);

  const fetchOverallSummary = async () => {
    setLoadingOverall(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get('/api/management/summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOverallSummary(res.data);
    } catch (err) {
      /* console.error('Error fetching overall management summary:', err); */
    } finally {
      setLoadingOverall(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get('/api/management/customers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomers(res.data);
    } catch (err) {
      /* console.error('Error fetching customer list:', err); */
    }
  };

  // Customer select handler
  const handleCustomerSelect = async (custId) => {
    setSelectedCustomerId(custId);
    setSelectedSoId('');
    setCustomerOrders([]);
    if (!custId) return;

    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`/api/management/customer/${custId}/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomerOrders(res.data.pos || []);
    } catch (err) {
      /* console.error('Error fetching customer orders:', err); */
    }
  };

  // "GO - for Customer Level Info"
  const handleGoCustomer = async () => {
    if (!selectedCustomerId) return;
    setSelectionType('customer');
    setLoadingDetails(true);
    setCurrentScreen('screen3');

    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`/api/management/customer/${selectedCustomerId}/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomerDetail(res.data.summary);
    } catch (err) {
      /* console.error('Error loading customer details:', err); */
    } finally {
      setLoadingDetails(false);
    }
  };

  // "GO - for SO Level Info"
  const handleGoSo = async () => {
    if (!selectedSoId) return;
    setSelectionType('so');
    setLoadingDetails(true);
    setCurrentScreen('screen3');

    try {
      const token = sessionStorage.getItem('token');
      const res = await axios.get(`/api/management/so/${selectedSoId}/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSoDetail(res.data);
    } catch (err) {
      /* console.error('Error loading SO details:', err); */
    } finally {
      setLoadingDetails(false);
    }
  };

  // Formatting helper
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Percentage formatting helper
  const calcPercentage = (numerator, denominator) => {
    if (!denominator || denominator === 0) return '0.0%';
    const value = (numerator / denominator) * 100;
    return `${value.toFixed(1)}%`;
  };

  // Custom inline styles for native mobile layout matching the Excel reference
  const styles = {
    wrapper: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '85vh',
      background: '#F8FAFC',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '8px'
    },
    mobileScreen: {
      width: '100%',
      maxWidth: '390px', // Strict mobile portrait width
      background: '#FFFFFF',
      border: '2px solid #E2E8F0',
      borderRadius: '16px',
      padding: '12px 12px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxSizing: 'border-box'
    },
    header: {
      textAlign: 'center',
      borderBottom: '2px solid #F1F5F9',
      paddingBottom: '6px'
    },
    headerTitle: {
      fontSize: '18px',
      fontWeight: '800',
      color: '#1E293B',
      margin: 0,
      letterSpacing: '-0.5px'
    },
    headerSub: {
      fontSize: '11px',
      color: '#64748B',
      margin: '1px 0 0 0',
      fontWeight: '500'
    },
    sectionList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    },
    rowContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 10px',
      background: '#FFFFFF',
      border: '1.5px solid #E2E8F0',
      borderRadius: '8px',
      boxSizing: 'border-box'
    },
    rowLeft: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1px'
    },
    rowTitle: {
      fontSize: '10px',
      fontWeight: '700',
      color: '#475569',
      textTransform: 'uppercase',
      letterSpacing: '0.3px'
    },
    rowAmt: {
      fontSize: '15px',
      fontWeight: '800',
      color: '#0F172A'
    },
    percentBox: {
      minWidth: '55px',
      height: '26px',
      background: '#334155', // High-contrast professional dark slate
      color: '#FFFFFF',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: '700',
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
    },
    primaryBtn: {
      width: '100%',
      height: '34px',
      background: '#2563EB',
      color: '#FFFFFF',
      borderRadius: '8px',
      border: 'none',
      fontSize: '12px',
      fontWeight: '700',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      boxShadow: '0 2px 4px rgba(37, 99, 235, 0.15)',
      marginTop: '4px'
    },
    secondaryBtn: {
      width: '100%',
      height: '34px',
      background: '#059669',
      color: '#FFFFFF',
      borderRadius: '8px',
      border: 'none',
      fontSize: '12px',
      fontWeight: '700',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      boxShadow: '0 2px 4px rgba(5, 150, 105, 0.15)'
    },
    bottomNav: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginTop: '4px'
    },
    navBtn: {
      width: '100%',
      height: '30px',
      background: '#FFFFFF',
      border: '1.5px solid #CBD5E1',
      color: '#475569',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px'
    },
    selectLabel: {
      fontSize: '10px',
      fontWeight: '800',
      color: '#475569',
      textTransform: 'uppercase',
      display: 'block',
      marginBottom: '3px',
      letterSpacing: '0.5px'
    },
    selectBox: {
      width: '100%',
      height: '32px',
      padding: '0 8px',
      borderRadius: '6px',
      border: '1.5px solid #CBD5E1',
      fontSize: '11px',
      fontWeight: '600',
      color: '#1E293B',
      background: '#FFFFFF',
      outline: 'none'
    },
    logoutBtn: {
      background: 'none',
      border: 'none',
      color: '#EF4444',
      fontSize: '11px',
      fontWeight: '700',
      cursor: 'pointer',
      marginTop: '4px',
      textDecoration: 'underline'
    }
  };

  return (
    <div className="mgmt-wrapper">
      <div className="mgmt-screen">

        {/* ==================== SCREEN 1: HOME SCREEN / DASHBOARD ==================== */}
        {currentScreen === 'screen1' && (
          <>
            <div style={styles.header}>
              <h2 style={styles.headerTitle}>Sudha Analyticals</h2>
              <p style={styles.headerSub}>O2C Live Performance Summary</p>
            </div>

            {loadingOverall ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} style={{ height: '62px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', animation: 'pulse 1.5s infinite' }}></div>
                ))}
              </div>
            ) : (
              <div style={styles.sectionList}>
                {/* 1. Total Sales Orders */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Total Sales Orders</span>
                    <span style={styles.rowAmt}>{formatCurrency(overallSummary?.total_po_value)}</span>
                  </div>
                  <div style={styles.percentBox}>100.0%</div>
                </div>

                {/* 2. Supplied To Date */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Supplied To Date</span>
                    <span style={{ ...styles.rowAmt, color: '#2563EB' }}>{formatCurrency(overallSummary?.total_supplied_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(overallSummary?.total_supplied_value, overallSummary?.total_po_value)}
                  </div>
                </div>

                {/* 3. Invoiced To Date */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Invoiced To Date</span>
                    <span style={{ ...styles.rowAmt, color: '#D97706' }}>{formatCurrency(overallSummary?.total_invoiced_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(overallSummary?.total_invoiced_value, overallSummary?.total_po_value)}
                  </div>
                </div>

                {/* 4. Collected To Date */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Collected To Date</span>
                    <span style={{ ...styles.rowAmt, color: '#059669' }}>{formatCurrency(overallSummary?.total_collected_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(overallSummary?.total_collected_value, overallSummary?.total_invoiced_value)}
                  </div>
                </div>

                {/* 5. Total Outstanding */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Total Outstanding</span>
                    <span style={{ ...styles.rowAmt, color: '#DC2626' }}>{formatCurrency(overallSummary?.total_outstanding_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(overallSummary?.total_outstanding_value, overallSummary?.total_invoiced_value)}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentScreen('screen2')}
                style={styles.primaryBtn}
              >
                Click here for Specific PO
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </button>

              <button
                onClick={() => {
                  sessionStorage.removeItem('token');
                  window.location.reload();
                }}
                style={styles.logoutBtn}
              >
                Sign Out
              </button>
            </div>
          </>
        )}

        {/* ==================== SCREEN 2: CUSTOMER / SO SELECTION ==================== */}
        {currentScreen === 'screen2' && (
          <>
            <div style={styles.header}>
              <h2 style={styles.headerTitle}>Select Level</h2>
              <p style={styles.headerSub}>Choose Customer or Sales Order</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Customer Dropdown */}
              <div>
                <label style={styles.selectLabel}>Select Customer</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  style={styles.selectBox}
                >
                  <option value="">-- Select Customer Account --</option>
                  {customers.map((c) => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.customer_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* GO Button for Customer */}
              <button
                onClick={handleGoCustomer}
                disabled={!selectedCustomerId}
                style={{
                  ...styles.primaryBtn,
                  background: selectedCustomerId ? '#2563EB' : '#94A3B8',
                  boxShadow: selectedCustomerId ? '0 4px 6px -1px rgba(37, 99, 235, 0.2)' : 'none',
                  cursor: selectedCustomerId ? 'pointer' : 'not-allowed'
                }}
              >
                GO - for Customer Level Info
              </button>

              <div style={{ height: '2px', background: '#F1F5F9', margin: '6px 0' }} />

              {/* SO Dropdown */}
              <div>
                <label style={styles.selectLabel}>Select SO</label>
                <select
                  value={selectedSoId}
                  onChange={(e) => setSelectedSoId(e.target.value)}
                  disabled={!selectedCustomerId}
                  style={{
                    ...styles.selectBox,
                    background: selectedCustomerId ? '#FFFFFF' : '#F1F5F9',
                    cursor: selectedCustomerId ? 'pointer' : 'not-allowed'
                  }}
                >
                  <option value="">-- Choose Sales Order (SO) --</option>
                  {customerOrders.map((so) => (
                    <option key={so.po_id} value={so.po_id}>
                      {so.po_number}
                    </option>
                  ))}
                </select>
              </div>

              {/* GO Button for SO */}
              <button
                onClick={handleGoSo}
                disabled={!selectedSoId}
                style={{
                  ...styles.secondaryBtn,
                  background: selectedSoId ? '#059669' : '#94A3B8',
                  boxShadow: selectedSoId ? '0 4px 6px -1px rgba(5, 150, 105, 0.2)' : 'none',
                  cursor: selectedSoId ? 'pointer' : 'not-allowed'
                }}
              >
                GO - for SO Level Info
              </button>
            </div>

            <div style={styles.bottomNav}>
              <button
                onClick={() => setCurrentScreen('screen1')}
                style={styles.navBtn}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
                Back to Dashboard
              </button>
            </div>
          </>
        )}

        {/* ==================== SCREEN 3: DISPLAY DETAILS ==================== */}
        {currentScreen === 'screen3' && (
          <>
            <div style={styles.header}>
              <h2 style={{ ...styles.headerTitle, fontSize: '18px' }}>
                {selectionType === 'customer' ? 'Customer Level Summary' : 'Sales Order Summary'}
              </h2>
              <p style={{ ...styles.headerSub, fontWeight: '700', color: '#0F172A', marginTop: '4px' }}>
                {selectionType === 'customer'
                  ? customers.find(c => String(c.customer_id) === String(selectedCustomerId))?.customer_name
                  : customerOrders.find(so => String(so.po_id) === String(selectedSoId))?.po_number}
              </p>
            </div>

            {loadingDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} style={{ height: '62px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', animation: 'pulse 1.5s infinite' }}></div>
                ))}
              </div>
            ) : selectionType === 'customer' && customerDetail ? (
              <div style={styles.sectionList}>
                {/* 1. Total Sales Orders */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Total Sales Orders</span>
                    <span style={styles.rowAmt}>{formatCurrency(customerDetail.total_po_value)}</span>
                  </div>
                  <div style={styles.percentBox}>100.0%</div>
                </div>

                {/* 2. Supplied To Date */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Supplied To Date</span>
                    <span style={{ ...styles.rowAmt, color: '#2563EB' }}>{formatCurrency(customerDetail.total_supplied_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(customerDetail.total_supplied_value, customerDetail.total_po_value)}
                  </div>
                </div>

                {/* 3. Invoiced To Date */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Invoiced To Date</span>
                    <span style={{ ...styles.rowAmt, color: '#D97706' }}>{formatCurrency(customerDetail.total_invoiced_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(customerDetail.total_invoiced_value, customerDetail.total_po_value)}
                  </div>
                </div>

                {/* 4. Collected To Date */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Collected To Date</span>
                    <span style={{ ...styles.rowAmt, color: '#059669' }}>{formatCurrency(customerDetail.total_collected_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(customerDetail.total_collected_value, customerDetail.total_invoiced_value)}
                  </div>
                </div>

                {/* 5. Total Outstanding */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Total Outstanding</span>
                    <span style={{ ...styles.rowAmt, color: '#DC2626' }}>{formatCurrency(customerDetail.total_outstanding_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(customerDetail.total_outstanding_value, customerDetail.total_invoiced_value)}
                  </div>
                </div>
              </div>
            ) : selectionType === 'so' && soDetail ? (
              <div style={styles.sectionList}>
                {/* 1. SO Value */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>SO Value</span>
                    <span style={styles.rowAmt}>{formatCurrency(soDetail.po_value)}</span>
                  </div>
                  <div style={styles.percentBox}>100.0%</div>
                </div>

                {/* 2. Supplied Value */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Supplied Value</span>
                    <span style={{ ...styles.rowAmt, color: '#2563EB' }}>{formatCurrency(soDetail.supplied_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(soDetail.supplied_value, soDetail.po_value)}
                  </div>
                </div>

                {/* 3. Invoice Value */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Invoice Value</span>
                    <span style={{ ...styles.rowAmt, color: '#D97706' }}>{formatCurrency(soDetail.invoiced_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(soDetail.invoiced_value, soDetail.po_value)}
                  </div>
                </div>

                {/* 4. Collected Amount */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Collected Amount</span>
                    <span style={{ ...styles.rowAmt, color: '#059669' }}>{formatCurrency(soDetail.collected_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(soDetail.collected_value, soDetail.invoiced_value)}
                  </div>
                </div>

                {/* 5. Outstanding Amount */}
                <div style={styles.rowContainer}>
                  <div style={styles.rowLeft}>
                    <span style={styles.rowTitle}>Outstanding Amount</span>
                    <span style={{ ...styles.rowAmt, color: '#DC2626' }}>{formatCurrency(soDetail.outstanding_value)}</span>
                  </div>
                  <div style={styles.percentBox}>
                    {calcPercentage(soDetail.outstanding_value, soDetail.invoiced_value)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textRendering: 'center', color: '#64748B', fontSize: '13px' }}>No Data Available</div>
            )}

            <div style={styles.bottomNav}>
              {/* Back to Previous Screen */}
              <button
                onClick={() => setCurrentScreen('screen2')}
                style={styles.navBtn}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
                Back to Previous Screen
              </button>

              {/* Back to Dashboard */}
              <button
                onClick={() => setCurrentScreen('screen1')}
                style={{ ...styles.navBtn, border: '1.5px solid #2563EB', color: '#2563EB' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>dashboard</span>
                Back to Dashboard
              </button>
            </div>
          </>
        )}

      </div>
      <style>{`
        .mgmt-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: #F8FAFC;
          font-family: system-ui, -apple-system, sans-serif;
          padding: 16px;
          box-sizing: border-box;
        }
        .mgmt-screen {
          width: 100%;
          max-width: 420px;
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-sizing: border-box;
        }
        @media (max-width: 480px) {
          .mgmt-wrapper {
            padding: 0 !important;
            background: #FFFFFF !important;
            align-items: flex-start !important;
            min-height: 100vh !important;
          }
          .mgmt-screen {
            max-width: 100% !important;
            min-height: 100vh !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 16px !important;
            gap: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
