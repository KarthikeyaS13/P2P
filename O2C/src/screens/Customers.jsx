import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
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
    
    axios.get('/api/customers', { headers })
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        setCustomers(data);
      })
      .catch(err => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      html: `You are about to delete <b>${name}</b>.<br/><br/><span style="color: #EF4444; font-weight: 700;">WARNING:</span> This will permanently delete all related Sales Orders, Delivery Challans, and Invoices.<br/><br/>This action is irreversible.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Yes, delete completely!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        await axios.delete(`/api/customers/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Swal.fire({
          title: 'Deleted!',
          text: 'Customer and all historical records have been purged.',
          icon: 'success',
          confirmButtonColor: '#3B82F6'
        });
        setCustomers(prev => prev.filter(c => c.id !== id));
      } catch (err) {
        Swal.fire({
          title: 'Error!',
          text: err.response?.data?.error || 'Failed to delete customer',
          icon: 'error',
          confirmButtonColor: '#3B82F6'
        });
      }
    }
  };

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
          {role === 'admin' && (
            <button 
              onClick={() => handleDelete(row.original.id, row.original.name)}
              title="Delete Customer & All Data"
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>delete</span>
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
    <div style={{ padding: '0 0 16px 0', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', marginTop: '0' }}>
        <button 
          onClick={() => navigate('/dashboard')}
          className="btn-ghost btn-back"
          style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
        </button>
        <div>
          <h2 style={{ margin: 0, color: '#111827', fontSize: '1.2rem' }}>Customer Management</h2>
          <p style={{ color: '#6B7280', margin: 0, fontSize: '0.85rem' }}>Oversee and manage your enterprise customer portfolio</p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '12px',
        background: 'white',
        padding: '10px 16px',
        borderRadius: '8px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span className="material-symbols-outlined" style={{ color: '#9CA3AF', fontSize: '18px' }}>search</span>
          <input
            type="text"
            placeholder="Search by name, ID, or any detail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '400px',
              height: '32px',
              border: 'none',
              outline: 'none',
              fontSize: '13px'
            }}
          />
        </div>
        {role === 'admin' && (
          <button
            onClick={() => navigate('/customers/new')}
            style={{
              background: '#1E40AF',
              color: 'white',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_add</span>
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
                  <th key={header.id} style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
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
                    <td key={cell.id} style={{ padding: '6px 10px', fontSize: '0.85rem', color: '#374151' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#6B7280' }}>
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
