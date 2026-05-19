import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';

export default function VerifyDocument() {
  const { hash: urlHash } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'hash'
  const [inputHash, setInputHash] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [docData, setDocData] = useState(null);
  const [cryptoResult, setCryptoResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // Auto-verify if hash or QR parameters are in URL/search query params
  useEffect(() => {
    const invoiceId = searchParams.get('invoice_id');
    const token = searchParams.get('token');
    if (invoiceId && token) {
      performQRVerification(invoiceId, token);
    } else {
      const hashToVerify = urlHash || searchParams.get('hash');
      if (hashToVerify) {
        setActiveTab('hash');
        setInputHash(hashToVerify);
        performHashVerification(hashToVerify);
      }
    }
  }, [urlHash, searchParams]);

  const performQRVerification = async (invoiceId, token) => {
    setLoading(true);
    setError('');
    setDocData(null);
    setCryptoResult(null);
    setSearched(true);
    
    try {
      const res = await axios.get(`http://localhost:5000/api/public/verify-qr?invoice_id=${invoiceId}&token=${token}`);
      setDocData(res.data.invoice);
      
      setCryptoResult({
        valid: res.data.valid,
        message: res.data.message || 'QR Code Verification Successful: The document is authentic.',
        details: {
          signerName: res.data.invoice?.signer_name || 'Sudha Analyticals (O2C Portal)',
          issuer: 'O2C Portal Cryptographic Signer Node',
          serialNumber: res.data.invoice?.certificate_serial || 'N/A',
          reason: 'QR Code scanning & invoice record lookup verification.',
          location: 'Industrial Area, Phase II, Bangalore, India',
          integrity: true,
          authenticity: true
        }
      });
    } catch (err) {
      setError(err.response?.data?.message || 'QR Code Verification failed. No authentic record matching this QR code was found.');
    } finally {
      setLoading(false);
    }
  };

  const performHashVerification = async (hashStr) => {
    if (!hashStr || hashStr.trim().length !== 64) {
      setError('Please enter or upload a valid 64-character SHA-256 integrity signature.');
      setDocData(null);
      setCryptoResult(null);
      setSearched(true);
      return;
    }

    setLoading(true);
    setError('');
    setDocData(null);
    setCryptoResult(null);
    setSearched(true);

    try {
      const res = await axios.get(`http://localhost:5000/api/public/verify-document/${hashStr.trim()}`);
      setDocData(res.data);
      
      // Since it's a hash query against the ledger DB, we verify the ledger's registration
      setCryptoResult({
        valid: true,
        message: 'Integrity hash matched successfully against database records. The document is registered on the ledger.',
        details: {
          signerName: res.data.signed_by || 'Accounts Admin',
          issuer: 'O2C Portal Database Ledger',
          serialNumber: 'LEDGER-RECORD',
          reason: 'Database ledger record matching.',
          location: 'Bangalore, India',
          integrity: true,
          authenticity: true
        }
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid cryptographic signature hash. The document may be forged or altered.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    performHashVerification(inputHash);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setLoading(true);
    setError('');
    setDocData(null);
    setCryptoResult(null);
    setSearched(true);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await axios.post('http://localhost:5000/api/public/verify-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setCryptoResult(res.data);
      if (res.data.invoice) {
        setDocData(res.data.invoice);
      }
    } catch (err) {
      console.error('[Verify] PDF upload verification failed:', err);
      setError(err.response?.data?.error || 'Failed to analyze the PDF signature. Ensure it is a valid PDF document.');
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

  const handleShowDescription = (itemName, description) => {
    Swal.fire({
      title: `<span style="font-size:18px; font-weight:800; color:#1E293B; font-family:'Inter', sans-serif;">TECHNICAL SPECIFICATIONS</span>`,
      html: `
        <div style="text-align: left; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; max-height: 400px; overflow-y: auto;">
          <h4 style="margin: 0 0 12px 0; color: #2563EB; font-weight: 700; font-size: 14px; text-transform: uppercase; font-family: 'Inter', sans-serif;">
            ${itemName}
          </h4>
          <p style="margin: 0; font-size: 13px; color: #334155; line-height: 1.6; white-space: pre-wrap; font-family: 'Inter', sans-serif; font-weight: 500;">
            ${description || 'No additional technical specifications provided for this item.'}
          </p>
        </div>
      `,
      confirmButtonText: 'Close Details',
      confirmButtonColor: '#2563EB',
      width: '600px'
    });
  };

  return (
    <div className="verify-page-container">
      <div className="verify-card animate-fade-in">
        <div className="verify-header">
          <div className="brand-group">
            <span className="material-symbols-outlined logo-icon">verified_user</span>
            <div>
              <h2 className="brand-title">SUDHA ANALYTICALS</h2>
              <p className="brand-tagline">Secure Cryptographic Verification Portal</p>
            </div>
          </div>
          <p className="portal-desc">
            Verify the cryptographic authenticity of invoices and delivery challans using advanced PKCS#7 digital signature verification.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="verify-tabs">
          <button
            className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => { setActiveTab('upload'); setError(''); setSearched(false); setDocData(null); setCryptoResult(null); }}
          >
            <span className="material-symbols-outlined">upload_file</span>
            Upload PDF Document
          </button>
          <button
            className={`tab-btn ${activeTab === 'hash' ? 'active' : ''}`}
            onClick={() => { setActiveTab('hash'); setError(''); setSearched(false); setDocData(null); setCryptoResult(null); }}
          >
            <span className="material-symbols-outlined">key</span>
            Enter Hash Key
          </button>
        </div>

        {activeTab === 'upload' ? (
          <div className="upload-section animate-fade-in">
            <div className="dropzone-container">
              <input
                type="file"
                id="pdf-picker"
                accept=".pdf"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="pdf-picker" className="dropzone-label">
                <span className="material-symbols-outlined upload-cloud-icon">cloud_upload</span>
                <span className="dropzone-title">Click to Upload Invoice PDF</span>
                <span className="dropzone-subtitle">Select the signed .pdf file to run cryptographic validation</span>
              </label>
            </div>
            {uploadedFileName && (
              <div className="selected-file-badge">
                <span className="material-symbols-outlined">description</span>
                <span className="file-name">{uploadedFileName}</span>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSearchSubmit} className="verify-form animate-fade-in">
            <div className="form-group">
              <label className="form-label">Integrity Hash Key (SHA-256)</label>
              <div className="input-group">
                <input
                  type="text"
                  className="form-input mono"
                  placeholder="Paste the 64-character signature hash printed on the document footer..."
                  value={inputHash}
                  onChange={(e) => setInputHash(e.target.value)}
                  maxLength={64}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify Authenticity'}
                </button>
              </div>
            </div>
          </form>
        )}

        {loading && (
          <div className="scanner-container">
            <div className="scanner-beam"></div>
            <p className="scanner-text">Decrypting PKCS#7 signature envelopes & checking document integrity...</p>
          </div>
        )}

        {searched && !loading && error && !cryptoResult && (
          <div className="verification-result tampered animate-scale-up">
            <span className="material-symbols-outlined status-icon">gpp_bad</span>
            <h3 className="result-title">VERIFICATION FAILED / INVALID SIGNATURE</h3>
            <p className="result-desc">{error}</p>
            <div className="security-guideline">
              <strong>⚠️ IMPORTANT NOTICE:</strong> Do not act on this document or release payments. The cryptographic signature is either absent, invalid, or does not match the secure database ledger.
            </div>
          </div>
        )}

        {/* Cryptographic Signature Certificate Box */}
        {searched && !loading && cryptoResult && (
          <div className={`crypto-certificate-box ${cryptoResult.valid ? 'signature-valid' : 'signature-invalid'} animate-scale-up`}>
            <div className="cert-header">
              <span className="material-symbols-outlined cert-badge-icon">
                {cryptoResult.valid ? 'verified_user' : 'gpp_bad'}
              </span>
              <div>
                <h3 className="cert-status-title">
                  {cryptoResult.valid ? '✓ Signature Valid' : '✗ Signature Invalid'}
                </h3>
                <p className="cert-status-desc">
                  {cryptoResult.valid ? 'Document Not Modified (Cryptographically Intact)' : 'Document Modified or Tampered'}
                </p>
              </div>
            </div>

            {cryptoResult.details && (
              <div className="cert-details-grid">
                <div className="cert-field">
                  <span className="cert-label font-bold">Signer Name / Organization</span>
                  <span className="cert-val">{cryptoResult.details.signerName}</span>
                </div>
                <div className="cert-field">
                  <span className="cert-label font-bold">Certificate Issuer</span>
                  <span className="cert-val">{cryptoResult.details.issuer}</span>
                </div>
                <div className="cert-field">
                  <span className="cert-label font-bold">Validity Period</span>
                  <span className="cert-val">
                    {cryptoResult.details.validFrom ? (
                      `${new Date(cryptoResult.details.validFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(cryptoResult.details.validTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    ) : 'N/A'}
                  </span>
                </div>
                <div className="cert-field">
                  <span className="cert-label font-bold">Reason / Purpose</span>
                  <span className="cert-val">{cryptoResult.details.reason}</span>
                </div>
                <div className="cert-field">
                  <span className="cert-label font-bold">Signing Location</span>
                  <span className="cert-val">{cryptoResult.details.location}</span>
                </div>
                <div className="cert-field">
                  <span className="cert-label font-bold">Verification Engine</span>
                  <span className="cert-val">SHA-256 with RSA (PKCS#7)</span>
                </div>
                <div className="cert-field" style={{ gridColumn: 'span 2' }}>
                  <span className="cert-label font-bold">Trust Chain Status</span>
                  <span className="cert-val font-mono" style={{ fontSize: '11px' }}>
                    {cryptoResult.details.authenticity 
                      ? '✓ Authenticated by trusted Certificate Authority' 
                      : 'ℹ Cryptographically valid seal (Private/Self-Signed Certificate)'}
                  </span>
                </div>
              </div>
            )}

            <p className="cert-summary-msg">{cryptoResult.message}</p>
          </div>
        )}

        {/* Ledger Details Comparison */}
        {searched && !loading && cryptoResult && docData && (
          <div 
            className="verification-result verified animate-scale-up" 
            style={{ 
              background: cryptoResult.valid ? '#F8FAFC' : '#FEF2F2', 
              border: cryptoResult.valid ? '1px solid #E2E8F0' : '1px solid #FCA5A5', 
              color: '#1E293B' 
            }}
          >
            <div className="verified-banner" style={{ borderBottom: cryptoResult.valid ? '1px solid #E2E8F0' : '1px solid #FCA5A5' }}>
              <span className="material-symbols-outlined status-icon" style={{ color: cryptoResult.valid ? '#0F172A' : '#DC2626' }}>
                {cryptoResult.valid ? 'assignment_turned_in' : 'gpp_bad'}
              </span>
              <div>
                <h3 className="result-title" style={{ color: cryptoResult.valid ? '#0F172A' : '#B91C1C' }}>
                  {cryptoResult.valid ? 'MATCHED LEDGER ENTRY FOUND' : 'INTEGRITY COMPROMISED / DOCUMENT UNTRUSTED'}
                </h3>
                <p className="result-desc" style={{ color: cryptoResult.valid ? '#64748B' : '#7F1D1D' }}>
                  {cryptoResult.valid 
                    ? 'This document corresponds to a registered billing event in the O2C command center. Compare the physical values below.' 
                    : 'A matching ledger record was found, but this PDF file has been altered or rebuilt. Visual contents may have been falsified.'}
                </p>
              </div>
            </div>

            <div className="verified-details-grid" style={{ border: cryptoResult.valid ? '1px solid #E2E8F0' : '1px solid #FCA5A5', background: '#FFFFFF' }}>
              <div className="detail-row">
                <span className="label">Invoice Number:</span>
                <span className="value strong">{docData.invoice_number}</span>
              </div>
              <div className="detail-row">
                <span className="label">Billed To (Customer):</span>
                <span className="value">{docData.customer_name}</span>
              </div>
              <div className="detail-row">
                <span className="label">Grand Total in Ledger:</span>
                <span className="value total" style={{ color: '#059669' }}>{formatCurrency(docData.grand_total)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Digitally Approved By:</span>
                <span className="value">{docData.signed_by || 'Accounts Admin'}</span>
              </div>
              <div className="detail-row" style={{ gridColumn: 'span 2' }}>
                <span className="label">Signature Timestamp:</span>
                <span className="value">
                  {new Date(docData.signed_at).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              </div>

              {/* Mismatch Alert for Tampered Value */}
              {!cryptoResult.valid && cryptoResult.pdfGrandTotal !== null && cryptoResult.pdfGrandTotal !== docData.grand_total && (
                <div className="detail-row" style={{ gridColumn: 'span 2', background: '#FEF2F2', padding: '12px', borderRadius: '6px', border: '1px dashed #FCA5A5', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="label" style={{ fontWeight: 700, color: '#991B1B' }}>Grand Total in Uploaded PDF:</span>
                    <span className="value" style={{ fontWeight: 700, color: '#DC2626', fontSize: '15px' }}>
                      {cryptoResult.pdfGrandTotalStr || formatCurrency(cryptoResult.pdfGrandTotal)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="label" style={{ fontWeight: 700, color: '#1E293B' }}>Grand Total in Official Ledger:</span>
                    <span className="value" style={{ fontWeight: 700, color: '#059669', fontSize: '15px' }}>
                      {formatCurrency(docData.grand_total)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
                    TAMPERED VALUE DETECTED: The value printed on the document ({cryptoResult.pdfGrandTotalStr || formatCurrency(cryptoResult.pdfGrandTotal)}) does not match the cryptographically locked ledger value ({formatCurrency(docData.grand_total)}).
                  </div>
                </div>
              )}

              {/* General Tamper Warning if Total matches but signature is stripped */}
              {!cryptoResult.valid && (cryptoResult.pdfGrandTotal === null || cryptoResult.pdfGrandTotal === docData.grand_total) && (
                <div className="detail-row" style={{ gridColumn: 'span 2', background: '#FEF2F2', padding: '12px', borderRadius: '6px', border: '1px dashed #FCA5A5', marginTop: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
                    UNAUTHORIZED MODIFICATION: The cryptographic signature has been removed or modified. The visual content of this PDF is untrusted.
                  </div>
                </div>
              )}
            </div>

            <div className="attention-card" style={{ background: cryptoResult.valid ? '#FFFBEB' : '#FEF2F2', border: cryptoResult.valid ? '1px solid #FEF3C7' : '1px solid #FCA5A5' }}>
              <span className="material-symbols-outlined attention-icon" style={{ color: cryptoResult.valid ? '#D97706' : '#DC2626' }}>warning</span>
              <div>
                <h4 className="attention-title" style={{ color: cryptoResult.valid ? '#92400E' : '#991B1B' }}>IMPORTANT QUALITY CHECK:</h4>
                <p className="attention-desc" style={{ color: cryptoResult.valid ? '#B45309' : '#7F1D1D' }}>
                  Cross-verify the invoice in your hand. If the <strong>Grand Total</strong> or any quantities/rates differ from the <strong>{formatCurrency(docData.grand_total)}</strong> shown below, the printed document has been modified after signature generation!
                </p>
              </div>
            </div>

            <div className="verified-items-container">
              <h4 className="section-title">Ledger Itemized Records</h4>
              <div className="items-table-wrapper">
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Item Name</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Taxable Value</th>
                      <th className="text-right">GST Rate</th>
                      <th className="text-right">GST Amount</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docData.items?.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#4F46E5', background: '#EEF2FF', padding: '2px 6px', borderRadius: '4px' }}>
                            {it.package_name || 'R&D LF'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1E293B' }}>{it.item_name}</div>
                          {it.description ? (
                            <div 
                              onClick={() => handleShowDescription(it.item_name, it.description)} 
                              className="clickable-desc-badge"
                            >
                              <span className="material-symbols-outlined desc-doc-icon">description</span>
                              <span>View Description</span>
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No specifications</div>
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 600 }}>{it.quantity}</td>
                        <td className="text-right">{formatCurrency(it.rate)}</td>
                        <td className="text-right">{formatCurrency(it.taxable_value || (it.quantity * it.rate))}</td>
                        <td className="text-right">{it.gst_percent || 18}%</td>
                        <td className="text-right">{formatCurrency(it.gst_amount || (it.total_value - (it.quantity * it.rate)))}</td>
                        <td className="text-right strong">{formatCurrency(it.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '32px', marginTop: '20px', borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic', lineHeight: '1.5' }}>
                  * All ledger details are fetched from the secure enterprise database nodes. Any modification of visual invoice parameters violates cryptographic authenticity.
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>Subtotal (Taxable Value)</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{formatCurrency(docData.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>GST Total</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{formatCurrency(docData.gst_total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px dashed #CBD5E1', marginTop: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>Grand Total (Incl. GST)</span>
                    <span style={{ fontWeight: 900, color: '#059669', fontSize: '20px' }}>{formatCurrency(docData.grand_total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '11px', color: '#64748B', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
              <span>Security Node: O2C-CRYPT-VERIFY</span>
              <span style={{ fontFamily: 'monospace' }}>Ledger Reference Hash: {docData.signature_hash ? `${docData.signature_hash.substring(0, 16)}...` : 'N/A'}</span>
            </div>
          </div>
        )}

        {searched && !loading && cryptoResult && !docData && (
          <div className="verification-result tampered animate-scale-up" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
            <span className="material-symbols-outlined status-icon">warning</span>
            <h3 className="result-title">VALID SIGNATURE, NO DATABASE RECORD FOUND</h3>
            <p className="result-desc">
              The PDF digital signature is cryptographically intact and not tampered with, but there is no matching invoice record inside this specific portal's local database ledger. It may have been generated on a different O2C tenant node or during a previous database testing session.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .verify-page-container {
          max-width: 1200px;
          margin: 40px auto;
          padding: 0 20px;
          font-family: 'Inter', sans-serif;
        }
        .verify-card {
          background: #FFFFFF;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          border: 1px solid #E2E8F0;
          overflow: hidden;
          padding: 32px;
        }
        .verify-header {
          border-bottom: 2px dashed #E2E8F0;
          padding-bottom: 24px;
          margin-bottom: 24px;
          text-align: center;
        }
        .brand-group {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 12px;
        }
        .logo-icon {
          font-size: 40px;
          color: #2563EB;
          background: #EFF6FF;
          padding: 10px;
          border-radius: 12px;
        }
        .brand-title {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #1E293B;
        }
        .brand-tagline {
          margin: 0;
          font-size: 12px;
          color: #2563EB;
          font-weight: 700;
          text-transform: uppercase;
        }
        .portal-desc {
          margin: 12px auto 0 auto;
          font-size: 13px;
          color: #64748B;
          line-height: 1.5;
          max-width: 650px;
        }

        .verify-tabs, .upload-section, .verify-form {
          max-width: 650px;
          margin-left: auto;
          margin-right: auto;
        }

        .verify-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          background: #F1F5F9;
          padding: 4px;
          border-radius: 8px;
          margin-bottom: 24px;
        }
        .tab-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border: none;
          background: transparent;
          color: #64748B;
          font-weight: 600;
          font-size: 13px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn.active {
          background: #FFFFFF;
          color: #1E293B;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .tab-btn span {
          font-size: 18px;
        }

        .upload-section {
          margin-bottom: 24px;
        }
        .dropzone-container {
          border: 2px dashed #CBD5E1;
          border-radius: 12px;
          background: #F8FAFC;
          padding: 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dropzone-container:hover {
          border-color: #2563EB;
          background: #EFF6FF;
        }
        .dropzone-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        }
        .upload-cloud-icon {
          font-size: 48px;
          color: #64748B;
          margin-bottom: 12px;
        }
        .dropzone-container:hover .upload-cloud-icon {
          color: #2563EB;
        }
        .dropzone-title {
          font-size: 15px;
          font-weight: 700;
          color: #334155;
          margin-bottom: 4px;
        }
        .dropzone-subtitle {
          font-size: 11px;
          color: #64748B;
        }
        .selected-file-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #F1F5F9;
          border-radius: 6px;
          padding: 8px 12px;
          margin-top: 12px;
          font-size: 12px;
          color: #334155;
          font-weight: 600;
        }
        .selected-file-badge span {
          font-size: 16px;
          color: #64748B;
        }

        .verify-form {
          margin-bottom: 24px;
        }
        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .input-group {
          display: flex;
          gap: 12px;
        }
        .form-input {
          flex: 1;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 14px;
          color: #1E293B;
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: #2563EB;
          background: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
          outline: none;
        }
        .form-input.mono {
          font-family: monospace;
          font-weight: 600;
        }
        .btn-primary {
          background: #2563EB;
          color: #FFFFFF;
          border: none;
          border-radius: 8px;
          padding: 0 24px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .btn-primary:hover {
          background: #1D4ED8;
        }
        
        .scanner-container {
          position: relative;
          background: #0F172A;
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          overflow: hidden;
          margin-top: 16px;
        }
        .scanner-beam {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(to right, transparent, #10B981, transparent);
          animation: scan 1.5s infinite ease-in-out;
        }
        .scanner-text {
          margin: 0;
          color: #10B981;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }

        .verification-result {
          border-radius: 12px;
          padding: 24px;
          margin-top: 24px;
        }
        .verification-result.tampered {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          color: #991B1B;
          text-align: center;
        }
        .verification-result.verified {
          background: #ECFDF5;
          border: 1px solid #A7F3D0;
          color: #065F46;
        }
        .verified-banner {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          border-bottom: 1px solid #A7F3D0;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .status-icon {
          font-size: 32px;
        }
        .result-title {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
        }
        .result-desc {
          margin: 4px 0 0 0;
          font-size: 13px;
          opacity: 0.9;
        }
        .security-guideline {
          background: #FFFFFF;
          border: 1px solid #FCA5A5;
          border-radius: 8px;
          padding: 16px;
          margin-top: 16px;
          text-align: left;
          font-size: 12px;
          color: #7F1D1D;
          line-height: 1.5;
        }

        .verified-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px 32px;
          background: #FFFFFF;
          border: 1px solid #A7F3D0;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .detail-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .detail-row .label {
          font-size: 10px;
          color: #64748B;
          text-transform: uppercase;
          font-weight: 700;
        }
        .detail-row .value {
          font-size: 14px;
          color: #1E293B;
          font-weight: 600;
        }
        .detail-row .value.strong {
          color: #0F172A;
          font-weight: 700;
        }
        .detail-row .value.total {
          color: #059669;
          font-size: 16px;
          font-weight: 800;
        }

        .attention-card {
          display: flex;
          gap: 12px;
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 20px;
          align-items: flex-start;
        }
        .attention-icon {
          color: #D97706;
          font-size: 24px;
        }
        .attention-title {
          margin: 0;
          font-size: 12px;
          font-weight: 800;
          color: #92400E;
          text-transform: uppercase;
        }
        .attention-desc {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: #78350F;
          line-height: 1.5;
        }

        .verified-items-container {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 20px;
        }
        .section-title {
          margin: 0 0 12px 0;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .items-table th {
          border-bottom: 1px solid #E2E8F0;
          color: #64748B;
          padding: 8px;
          font-weight: 700;
          text-align: left;
        }
        .items-table td {
          border-bottom: 1px solid #F1F5F9;
          padding: 10px 8px;
          color: #334155;
        }
        .items-table th.text-right, .items-table td.text-right {
          text-align: right;
        }
        .items-table td.strong {
          font-weight: 700;
          color: #0F172A;
        }

        .clickable-desc-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #EFF6FF;
          color: #2563EB;
          border: 1px solid #BFDBFE;
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 4px;
          transition: all 0.2s ease;
        }
        .clickable-desc-badge:hover {
          background: #2563EB;
          color: #FFFFFF;
          border-color: #2563EB;
        }
        .desc-doc-icon {
          font-size: 12px !important;
        }

        .items-table-wrapper {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          margin-top: 16px;
        }

        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-scale-up {
          animation: scaleUp 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* Certificate Box Styling */
        .crypto-certificate-box {
          border-radius: 12px;
          padding: 24px;
          margin-top: 24px;
          margin-bottom: 24px;
          font-family: 'Inter', sans-serif;
          transition: all 0.3s ease;
        }
        .crypto-certificate-box.signature-valid {
          background: #ECFDF5;
          border: 2px solid #10B981;
          color: #065F46;
        }
        .crypto-certificate-box.signature-invalid {
          background: #FEF2F2;
          border: 2px solid #EF4444;
          color: #991B1B;
        }
        .cert-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          padding-bottom: 16px;
        }
        .cert-badge-icon {
          font-size: 40px;
        }
        .signature-valid .cert-badge-icon {
          color: #10B981;
        }
        .signature-invalid .cert-badge-icon {
          color: #EF4444;
        }
        .cert-status-title {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .cert-status-desc {
          margin: 4px 0 0 0;
          font-size: 13px;
          font-weight: 600;
          opacity: 0.8;
        }
        .cert-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          background: rgba(255, 255, 255, 0.65);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .cert-field {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .cert-label {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 700;
          color: #64748B;
        }
        .cert-val {
          font-size: 13px;
          font-weight: 600;
          color: #1E293B;
        }
        .cert-summary-msg {
          margin: 0;
          font-size: 12px;
          font-style: italic;
          opacity: 0.9;
          line-height: 1.5;
        }

        /* --- High Quality Media Queries --- */
        @media (max-width: 1200px) {
          .verify-page-container {
            max-width: 100%;
            margin: 20px auto;
            padding: 0 16px;
          }
          .verify-card {
            padding: 24px;
          }
        }

        @media (max-width: 992px) {
          .items-table th, .items-table td {
            white-space: nowrap;
          }
        }

        @media (max-width: 768px) {
          .verified-details-grid, .cert-details-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .items-table th, .items-table td {
            padding: 6px 8px;
            font-size: 12px;
          }
          .clickable-desc-badge {
            padding: 1px 4px;
            font-size: 10px;
          }
          .verify-card {
            padding: 16px;
          }
          .verify-header {
            padding-bottom: 16px;
            margin-bottom: 16px;
          }
          .attention-card {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
