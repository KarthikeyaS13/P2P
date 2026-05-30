import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AuditTrailModal({ isOpen, onClose, moduleName, referenceId, isTampered }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, moduleName, referenceId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/audit-logs/${moduleName}/${referenceId}`, { headers });
      // Sort logs by ID ascending for sequence numbering
      setLogs(res.data.sort((a, b) => a.id - b.id));
    } catch (err) {
      /* console.error('Audit Log Fetch Error:', err); */
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  };

  const numberToIndianWords = (num) => {
    if (isNaN(num) || num === '') return '';
    let n = parseFloat(num);
    if (n <= 0) return '';
    
    const single = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const double = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    
    const formatThreeDigit = (val) => {
      let str = "";
      if (val >= 100) {
        str += single[Math.floor(val / 100)] + " Hundred ";
        val %= 100;
      }
      if (val >= 10 && val < 20) {
        str += double[val - 10] + " ";
      } else if (val >= 20) {
        str += tens[Math.floor(val / 10)] + " " + single[val % 10] + " ";
      } else if (val > 0) {
        str += single[val] + " ";
      }
      return str;
    };

    let rupee = Math.floor(n);
    let paise = Math.round((n - rupee) * 100);
    
    let res = "";
    
    if (rupee === 0) {
      res = "Zero Rupees";
    } else {
      if (rupee >= 10000000) {
        let cr = Math.floor(rupee / 10000000);
        res += formatThreeDigit(cr) + "Crore ";
        rupee %= 10000000;
      }
      if (rupee >= 100000) {
        let lk = Math.floor(rupee / 100000);
        res += formatThreeDigit(lk) + "Lakh ";
        rupee %= 100000;
      }
      if (rupee >= 1000) {
        let th = Math.floor(rupee / 1000);
        res += formatThreeDigit(th) + "Thousand ";
        rupee %= 1000;
      }
      if (rupee > 0) {
        res += formatThreeDigit(rupee);
      }
      res += "Rupees";
    }
    
    if (paise > 0) {
      res += " and " + formatThreeDigit(paise) + "Paise";
    }
    
    return res.replace(/\s+/g, ' ').trim() + " Only";
  };

  const truncateHash = (hash) => {
    if (!hash) return '-';
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // Silent copy or could add a small toast if needed
  };

  const getActionBadgeStyle = (type) => {
    switch (type) {
      case 'APPROVE': return { bg: '#DCFCE7', text: '#166534', icon: 'verified' };
      case 'PAYMENT': return { bg: '#DBEAFE', text: '#1E40AF', icon: 'payments' };
      case 'SIGN': return { bg: '#F3E8FF', text: '#6B21A8', icon: 'edit_square' };
      case 'CREATE': return { bg: '#F0F9FF', text: '#075985', icon: 'add_circle' };
      case 'UPDATE': return { bg: '#FEF3C7', text: '#92400E', icon: 'edit' };
      case 'TAMPER_DETECTED': return { bg: '#FEE2E2', text: '#991B1B', icon: 'security' };
      case 'EDIT ATTEMPT': return { bg: '#FFEDD5', text: '#9A3412', icon: 'block' };
      default: return { bg: '#F1F5F9', text: '#475569', icon: 'history' };
    }
  };

  const renderDetails = (log) => {
    let oldData = {};
    let newData = {};
    try {
      oldData = log.old_value ? JSON.parse(log.old_value) : {};
      newData = log.new_value ? JSON.parse(log.new_value) : {};
    } catch (e) {
      return <span style={{ color: '#64748B', fontSize: '12px' }}>{log.new_value || log.old_value}</span>;
    }

    if (log.action_type === 'PAYMENT') {
      const data = newData;
      return (
        <div className="audit-details-grid">
          <div className="audit-detail-item"><span className="label">Amount:</span> <span className="value strong">{formatCurrency(data.amount)}</span></div>
          <div className="audit-detail-item"><span className="label">Payment Mode:</span> <span className="value">{data.payment_mode}</span></div>
          <div className="audit-detail-item"><span className="label">Transaction Ref:</span> <span className="value">{data.transaction_ref || '-'}</span></div>
          <div className="audit-detail-item"><span className="label">Payment Date:</span> <span className="value">{data.payment_date ? new Date(data.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</span></div>
        </div>
      );
    }

    if (log.action_type === 'APPROVE') {
      const data = newData;
      return (
        <div className="audit-details-grid">
          <div className="audit-detail-item"><span className="label">Invoice Number:</span> <span className="value strong">{data.invoice_number}</span></div>
          <div className="audit-detail-item">
            <span className="label">Integrity Hash:</span> 
            <span className="value mono">
              {truncateHash(data.hash)}
              <button className="btn-icon-sm" onClick={() => copyToClipboard(data.hash)} title="Copy Full Hash">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>content_copy</span>
              </button>
              <button className="btn-icon-sm" onClick={() => window.open(`/verify/${data.hash}`, '_blank')} title="Verify on Secure Portal" style={{ marginLeft: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#10B981' }}>open_in_new</span>
              </button>
            </span>
          </div>
          <div className="audit-detail-item"><span className="label">Status:</span> <span className="value badge-inline success">Approved</span></div>
        </div>
      );
    }

    if (log.action_type === 'TAMPER_DETECTED') {
      const data = oldData;
      return (
        <div className="audit-alert-danger">
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>SECURITY ALERT: Integrity Breach Detected</div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.8 }}>
            Current Hash: {truncateHash(data.current)}<br />
            Stored Hash: {truncateHash(data.stored)}
          </div>
        </div>
      );
    }

    // Default JSON-like but clean display
    const data = { ...oldData, ...newData };
    const financialKeys = ['grand_total', 'subtotal', 'gst_total', 'grandTotal', 'amount', 'balance', 'amount_received'];
    
    return (
      <div style={{ fontSize: '12px', color: '#334155' }}>
        {Object.entries(data).map(([key, val]) => {
          const isFinancial = financialKeys.includes(key) || key.toLowerCase().includes('total') || key.toLowerCase().includes('amount') || key.toLowerCase().includes('balance');
          const displayVal = (isFinancial && !isNaN(parseFloat(val)))
            ? `${formatCurrency(parseFloat(val))} (${numberToIndianWords(parseFloat(val))})`
            : typeof val === 'object' ? '[Data]' : String(val);
          return (
            <div key={key} style={{ marginBottom: '2px' }}>
              <span style={{ color: '#64748B', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}:</span> <span style={{ fontWeight: isFinancial ? 700 : 'normal' }}>{displayVal}</span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="enterprise-modal-overlay">
      <div className="enterprise-audit-card animate-scale-up">
        <div className="enterprise-audit-header">
          <div className="header-main">
            <div className="header-title-group">
              <span className="material-symbols-outlined header-icon">verified_user</span>
              <div>
                <h3 className="text-h3">Enterprise Audit Trail</h3>
                <p className="header-subtitle">{moduleName} Verification History • REF: {referenceId}</p>
              </div>
            </div>
            <div className="header-actions">
              <div className={`integrity-status-badge ${isTampered ? 'tampered' : 'verified'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {isTampered ? 'gpp_bad' : 'gpp_good'}
                </span>
                {isTampered ? 'Tampering Detected' : 'Integrity Verified'}
              </div>
              <button className="btn-close-circle" onClick={onClose}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
          <div className="immutable-notice">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>info</span>
            This audit trail is immutable and cannot be modified once recorded in the secure ledger.
          </div>
        </div>

        <div className="enterprise-audit-body">
          {loading ? (
            <div className="audit-loading-state">
              <div className="spinner"></div>
              <p>Retrieving secure audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="audit-empty-state">
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#CBD5E1' }}>history</span>
              <p>No audit history recorded for this transaction.</p>
            </div>
          ) : (
            <div className="audit-timeline">
              {logs.map((log, index) => {
                const style = getActionBadgeStyle(log.action_type);
                return (
                  <div key={log.id} className="timeline-item">
                    <div className="timeline-marker">
                      <div className="marker-line"></div>
                      <div className="marker-dot" style={{ background: style.bg, color: style.text }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{style.icon}</span>
                      </div>
                    </div>
                    <div className="timeline-content-card">
                      <div className="card-header">
                        <div className="action-info">
                          <span className="sequence-no">#{index + 1}</span>
                          <span className="action-badge" style={{ background: style.bg, color: style.text }}>{log.action_type}</span>
                          <span className="performed-by">by {log.performed_by}</span>
                        </div>
                        <span className="timestamp">
                          {new Date(log.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="card-body">
                        {renderDetails(log)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="enterprise-audit-footer">
          <div className="system-stamp">System Ledger Node: O2C-PROD-01</div>
          <button className="btn btn-primary" onClick={onClose} style={{ minWidth: '120px' }}>Done</button>
        </div>
      </div>

      <style>{`
        .enterprise-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; backdrop-filter: blur(8px);
          padding: 24px;
        }
        .enterprise-audit-card {
          background: #FFFFFF;
          width: 100%; max-width: 850px;
          max-height: 90vh;
          border-radius: 16px;
          display: flex; flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 1px solid #E2E8F0;
          overflow: hidden;
        }
        .enterprise-audit-header {
          padding: 24px;
          border-bottom: 1px solid #F1F5F9;
          background: #F8FAFC;
        }
        .header-main {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 16px;
        }
        .header-title-group {
          display: flex; gap: 16px; align-items: center;
        }
        .header-icon {
          font-size: 32px; color: #3B82F6;
          background: #EFF6FF; padding: 10px; border-radius: 12px;
        }
        .header-subtitle {
          margin: 0; font-size: 13px; color: #64748B; font-weight: 500;
        }
        .header-actions {
          display: flex; gap: 12px; align-items: center;
        }
        .integrity-status-badge {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px; border-radius: 30px;
          font-size: 13px; font-weight: 700;
        }
        .integrity-status-badge.verified { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
        .integrity-status-badge.tampered { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; animation: pulse 2s infinite; }
        
        .immutable-notice {
          display: flex; align-items: center; gap: 8px;
          background: #F1F5F9; color: #475569;
          padding: 8px 16px; border-radius: 8px;
          font-size: 11px; font-weight: 600;
          border-left: 4px solid #94A3B8;
        }

        .enterprise-audit-body {
          flex: 1; overflow-y: auto; padding: 32px 24px;
          background: #FFFFFF;
        }
        .audit-timeline {
          display: flex; flex-direction: column; gap: 0;
        }
        .timeline-item {
          display: flex; gap: 20px;
        }
        .timeline-marker {
          display: flex; flex-direction: column; align-items: center;
          width: 32px;
        }
        .marker-line {
          width: 2px; flex: 1; background: #F1F5F9;
        }
        .marker-dot {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          z-index: 1; border: 3px solid #FFF;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .timeline-content-card {
          flex: 1; background: #FFF;
          border: 1px solid #F1F5F9;
          border-radius: 12px; padding: 16px;
          margin-bottom: 24px;
          transition: all 0.2s;
        }
        .timeline-content-card:hover {
          border-color: #3B82F6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.05);
        }
        
        .card-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 12px; border-bottom: 1px solid #F8FAFC;
          padding-bottom: 8px;
        }
        .action-info {
          display: flex; align-items: center; gap: 10px;
        }
        .sequence-no {
          font-size: 11px; color: #94A3B8; font-weight: 800; font-family: monospace;
        }
        .action-badge {
          font-size: 10px; font-weight: 800; padding: 2px 10px;
          border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .performed-by {
          font-size: 13px; font-weight: 700; color: #1E293B;
        }
        .timestamp {
          font-size: 11px; color: #94A3B8; font-weight: 600;
        }

        .audit-details-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px;
        }
        .audit-detail-item {
          display: flex; flex-direction: column; gap: 2px;
        }
        .audit-detail-item .label {
          font-size: 10px; color: #94A3B8; text-transform: uppercase; font-weight: 700;
        }
        .audit-detail-item .value {
          font-size: 13px; color: #334155; font-weight: 500;
        }
        .audit-detail-item .value.strong { font-weight: 700; color: #0F172A; }
        .audit-detail-item .value.mono { font-family: monospace; display: flex; align-items: center; gap: 6px; }
        
        .badge-inline {
          padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;
        }
        .badge-inline.success { background: #DCFCE7; color: #166534; }

        .audit-alert-danger {
          background: #FEF2F2; color: #991B1B;
          padding: 12px; border-radius: 8px;
          border: 1px solid #FEE2E2;
        }

        .enterprise-audit-footer {
          padding: 16px 24px; border-top: 1px solid #F1F5F9;
          display: flex; justify-content: space-between; align-items: center;
          background: #F8FAFC;
        }
        .system-stamp {
          font-size: 10px; color: #94A3B8; font-weight: 700; text-transform: uppercase;
        }
        
        .btn-close-circle {
          background: #F1F5F9; border: none; width: 32px; height: 32px;
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s; color: #64748B;
        }
        .btn-close-circle:hover { background: #E2E8F0; color: #0F172A; }
        
        .btn-icon-sm {
          background: transparent; border: none; padding: 2px; cursor: pointer;
          color: #3B82F6; display: flex; align-items: center;
        }
        .btn-icon-sm:hover { color: #2563EB; }

        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .spinner {
          width: 24px; height: 24px; border: 3px solid #F1F5F9; border-top-color: #3B82F6;
          border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .audit-loading-state, .audit-empty-state {
          padding: 64px 0; text-align: center; color: #64748B;
        }
      `}</style>
    </div>
  );
}
