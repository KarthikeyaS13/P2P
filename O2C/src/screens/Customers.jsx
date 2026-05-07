import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    
    axios.get('http://localhost:3000/api/customers', { headers })
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        setCustomers(data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Customer Name',
      cell: info => <span style={{ fontWeight: 600, color: '#111827' }}>{info.getValue()}</span>,
    },
    {
      accessorKey: 'cust_code',
      header: 'Customer ID',
    },
    {
      accessorKey: 'location_count',
      header: 'Locations',
      cell: info => (
        <span style={{ 
          background: '#EFF6FF', 
          color: '#1D4ED8', 
          padding: '2px 10px', 
          borderRadius: '12px', 
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          {info.getValue() || 0}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => navigate(`/customers/${row.original.id}/edit`)}
            title="Edit Customer"
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: '#4B5563',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>edit</span>
          </button>
          {role === 'admin' && (
            <button 
              onClick={() => navigate(`/customers/${row.original.id}/locations`)}
              title="Add/View Locations"
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                color: '#1D4ED8',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>add_circle</span>
            </button>
          )}
        </div>
      ),
    }
  ], [navigate, role]);

  const table = useReactTable({
    data: customers,
    columns,
    state: {
      globalFilter: search,
    },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading customers...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ padding: '8px 16px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
        >
          ← Back
        </button>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>Customer Management</h2>
          <p style={{ color: '#6B7280', margin: 0 }}>Oversee and manage your enterprise customer portfolio</p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '24px',
        background: 'white',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <span className="material-symbols-outlined" style={{ color: '#9CA3AF' }}>search</span>
          <input
            type="text"
            placeholder="Search by name, ID, or any detail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '400px',
              padding: '8px 0',
              border: 'none',
              outline: 'none',
              fontSize: '14px'
            }}
          />
        </div>
        {role === 'admin' && (
          <button
            onClick={() => navigate('/customers/new')}
            style={{
              background: '#1E40AF',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>person_add</span>
            Onboard New Customer
          </button>
        )}
      </div>

      <div style={{ 
        background: 'white', 
        borderRadius: '8px', 
        border: '1px solid #E5E7EB', 
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '16px', fontSize: '0.925rem', color: '#374151' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
