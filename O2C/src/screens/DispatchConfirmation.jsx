import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function DispatchConfirmation() {
  const [view, setView] = useState('list'); // 'list' or 'detail'
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('tracking'); // 'tracking', 'completed'
  const [trackingDCs, setTrackingDCs] = useState([]);
  const [completedDCs, setCompletedDCs] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    loadTrackingData();
  }, []);

  useEffect(() => {
    if (id) {
      handleView(id);
    } else {
      setView('list');
      setDetails(null);
    }
  }, [id]);

  const loadTrackingData = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('http://localhost:5000/api/dc', { headers });
      
      const transit = res.data.filter(d => d.status === 'in_transit');
      const completed = res.data.filter(d => d.status === 'delivery_confirmed');
      
      setTrackingDCs(transit);
      setCompletedDCs(completed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (targetId) => {
    if (typeof targetId === 'object') {
      navigate(`/dispatch-confirmation/${targetId.id}`);
      return;
    }
    
    setLoadingDetails(true);
    setView('detail');
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`http://localhost:5000/api/dc/${targetId}`, { headers });
      setDetails(res.data);
    } catch (err) {
      console.error(err);
      setView('list');
    } finally {
      setLoadingDetails(false);
    }
  };

  const columns = useMemo(() => [
    {
      header: 'DC NO',
      accessorKey: 'dc_number',
      cell: info => <span style={{ fontWeight: 700, color: '#111827', fontSize: '11px' }}>{info.getValue()}</span>,
    },
    {
      header: 'PO NO',
      accessorKey: 'po_number',
      cell: info => <span style={{ color: '#4B5563', fontSize: '11px' }}>{info.getValue()}</span>,
    },
    {
      header: 'CUSTOMER',
      accessorKey: 'customer_name',
      cell: info => <span style={{ fontSize: '11px' }}>{info.getValue()}</span>,
    },
    {
      header: 'LOGISTICS',
      accessorKey: 'vehicle_no',
      cell: info => (
        <div style={{ fontSize: '10px' }}>
          <div style={{ fontWeight: 700, color: '#065F46' }}>{info.getValue()}</div>
          <div style={{ color: '#6B7280' }}>{info.row.original.driver_name} | {info.row.original.driver_phone}</div>
        </div>
      ),
    },
    {
      header: 'STATUS',
      accessorKey: 'status',
      cell: info => {
        const val = info.getValue();
        const labels = {
          in_transit: { label: 'IN TRANSIT', bg: '#DBEAFE', text: '#1E40AF' },
          delivery_confirmed: { label: 'DELIVERED', bg: '#D1FAE5', text: '#065F46' }
        };
        const s = labels[val] || { label: val.toUpperCase(), bg: '#F3F4F6', text: '#374151' };
        return (
          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '9px', fontWeight: 800, background: s.bg, color: s.text }}>
            {s.label}
          </span>
        );
      }
    },
    {
      header: 'Action',
      cell: info => (
        <button className="btn-ghost" onClick={() => handleView(info.row.original)} style={{ padding: '4px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--primary)' }}>visibility</span>
        </button>
      )
    }
  ], []);

  const table = useReactTable({
    data: activeTab === 'tracking' ? trackingDCs : completedDCs,
    columns: columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (view === 'detail') {
    return (
      <div className="page-container screen-enter">
        <div className="page-header" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/dispatch-confirmation')} className="btn-ghost btn-back" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
            </button>
            <h1 className="text-h2" style={{ fontSize: '15px' }}>Dispatch Confirmation</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280' }}>Request:</span>
            <span style={{ padding: '2px 8px', borderRadius: '12px', background: '#F3F4F6', color: '#374151', fontSize: '10px', fontWeight: 700 }}>
              {details?.dc_request_no}
            </span>
          </div>
        </div>

        {loadingDetails ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', fontSize: '13px' }}>Loading request details...</div>
        ) : details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* STATUS HEADER */}
            <div className="card" style={{ 
              padding: '16px 24px', 
              background: details.status === 'delivery_confirmed' ? '#ECFDF5' : '#EFF6FF',
              border: `1px solid ${details.status === 'delivery_confirmed' ? '#10B981' : '#3B82F6'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                background: 'white', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '28px', color: details.status === 'delivery_confirmed' ? '#10B981' : '#3B82F6' }}>
                  {details.status === 'delivery_confirmed' ? 'task_alt' : 'local_shipping'}
                </span>
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: details.status === 'delivery_confirmed' ? '#065F46' : '#1E40AF' }}>
                  {details.status === 'delivery_confirmed' ? 'SHIPMENT DELIVERED' : 'SHIPMENT IN TRANSIT'}
                </h4>
                <p style={{ margin: 0, fontSize: '11px', color: details.status === 'delivery_confirmed' ? '#059669' : '#3B82F6', fontWeight: 600 }}>
                  {details.status === 'delivery_confirmed' ? `Confirmed at site on ${new Date(details.updated_at).toLocaleDateString()}` : `Left warehouse and currently on the way to destination.`}
                </p>
              </div>
            </div>

            {/* LOGISTICS SUMMARY */}
            <div className="card" style={{ padding: '24px', background: 'white', border: '1px solid #E5E7EB' }}>
              <h3 className="text-h3" style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--primary)', borderBottom: '2px solid #F3F4F6', paddingBottom: '8px' }}>Logistics & Shipment Evidence</h3>

              <div className="responsive-grid responsive-grid--3" style={{ marginBottom: '24px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 800 }}>Vehicle Number</label>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{details.vehicle_no || 'N/A'}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 800 }}>Driver Details</label>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{details.driver_name || 'N/A'}</div>
                  <div style={{ fontSize: '11px', color: '#6B7280' }}>{details.driver_phone}</div>
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 800 }}>LR / Bilty Number</label>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{details.lr_no || 'Pending Assignment'}</div>
                </div>
              </div>

              <div className="responsive-grid responsive-grid--2" style={{ gap: '24px', borderTop: '1px solid #F3F4F6', paddingTop: '20px' }}>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px', display: 'block' }}>Dispatch Proof</label>
                  {details.dispatch_proof_path ? (
                    <a href={`http://localhost:5000${details.dispatch_proof_path}`} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                      <img src={`http://localhost:5000${details.dispatch_proof_path}`} alt="Proof" style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                    </a>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', background: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB', fontSize: '11px', color: '#9CA3AF' }}>No image evidence available</div>
                  )}
                </div>
                <div className="info-block">
                  <label style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px', display: 'block' }}>Logistics Remarks</label>
                  <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', minHeight: '100px', fontSize: '12px', color: '#334155', lineHeight: '1.6' }}>
                    {details.logistics_remarks || 'No specific loading or transport notes provided for this shipment.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Items Summary Card */}
            <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              <div style={{ padding: '12px 20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#374151' }}>Manifest (Shipped Items)</h4>
              </div>
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#F3F4F6' }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>SL NO</th>
                      <th style={{ padding: '8px 12px' }}>REF NO</th>
                      <th style={{ padding: '8px 12px' }}>ITEM NAME</th>
                      <th style={{ padding: '8px 12px' }}>DESCRIPTION</th>
                      <th style={{ padding: '8px 12px' }}>UOM</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>TOTAL ORDERED</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', background: '#EFF6FF', color: '#1E40AF' }}>THIS SHIPMENT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(details?.items) && details.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px 12px', color: '#9CA3AF' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{it.ref_no || '-'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{it.item_name}</td>
                        <td style={{ padding: '8px 12px', color: '#6B7280', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description}</td>
                        <td style={{ padding: '8px 12px' }}>{it.uom}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{it.supply_qty}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#2563EB', background: '#EFF6FF' }}>{it.quantity_dispatched}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-container screen-enter">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="text-h2" style={{ fontSize: '18px' }}>Delivery Tracking</h1>
          <p className="text-p" style={{ fontSize: '12px' }}>Monitor real-time status of all dispatched shipments and delivery history.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="search-bar" style={{ width: '280px', background: 'white', height: '36px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder="Search tracking records..."
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          onClick={() => setActiveTab('tracking')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: 'none',
            background: activeTab === 'tracking' ? '#111827' : 'white',
            color: activeTab === 'tracking' ? 'white' : '#64748B',
            boxShadow: activeTab === 'tracking' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
          }}
        >
          Active Tracking ({trackingDCs.length})
        </button>
        <button 
          onClick={() => setActiveTab('completed')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: 'none',
            background: activeTab === 'completed' ? '#111827' : 'white',
            color: activeTab === 'completed' ? 'white' : '#64748B',
            boxShadow: activeTab === 'completed' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
          }}
        >
          Delivery History ({completedDCs.length})
        </button>
      </div>

      <div className="table-wrapper" style={{ padding: '0' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead style={{ background: '#F9FAFB' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '12px 16px', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', borderBottom: '1px solid #E5E7EB' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>Loading tracking records...</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No records found in this category.</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '12px 16px', color: '#374151' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
