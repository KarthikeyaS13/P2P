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

export default function ProjectUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    username: '',
    password: '',
    role: 'Project',
    is_active: true,
  });

  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const role = currentUser?.role?.toLowerCase();
  const isPhoneInvalid = form.phone && form.phone.trim() ? form.phone.length !== 10 : false;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/project-users', { headers });
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch project users:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to load project users',
        confirmButtonColor: '#3B82F6'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setEditId(null);
    setShowPassword(false);
    setForm({
      full_name: '',
      email: '',
      phone: '',
      username: '',
      password: '',
      role: 'Project',
      is_active: true,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Front-end validations
    if (!form.full_name.trim()) {
      return Swal.fire({ icon: 'warning', title: 'Validation Warning', text: 'Full Name is required' });
    }
    if (!form.email.trim()) {
      return Swal.fire({ icon: 'warning', title: 'Validation Warning', text: 'Email ID is required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      return Swal.fire({ icon: 'warning', title: 'Validation Warning', text: 'Invalid Email ID format' });
    }
    if (form.phone && form.phone.trim()) {
      if (form.phone.length !== 10) {
        return Swal.fire({ icon: 'warning', title: 'Validation Warning', text: 'Contact Number must be exactly 10 digits' });
      }
    }
    if (!form.username.trim()) {
      return Swal.fire({ icon: 'warning', title: 'Validation Warning', text: 'Username is required' });
    }
    if (!isEditing && !form.password.trim()) {
      return Swal.fire({ icon: 'warning', title: 'Validation Warning', text: 'Password is required' });
    }

    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (isEditing) {
        await axios.put(`/api/project-users/${editId}`, form, { headers });
        Swal.fire({
          icon: 'success',
          title: 'Updated!',
          text: 'Project user details updated successfully.',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        await axios.post('/api/project-users', form, { headers });
        Swal.fire({
          icon: 'success',
          title: 'Created!',
          text: 'New project user registered successfully.',
          timer: 1500,
          showConfirmButton: false
        });
      }

      handleCloseForm();
      fetchUsers();
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} user`,
        confirmButtonColor: '#3B82F6'
      });
    }
  };

  const handleEdit = (u) => {
    setForm({
      full_name: u.full_name,
      email: u.email || '',
      phone: u.phone || '',
      username: u.username,
      password: '', // blank by default on edit
      role: 'Project',
      is_active: u.is_active !== 0,
    });
    setEditId(u.id);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      html: `You are about to delete project user <b>${name}</b>.<br/><br/><span style="color: #EF4444; font-weight: 700;">WARNING:</span> This action is irreversible.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Yes, delete completely!'
    });

    if (result.isConfirmed) {
      try {
        const token = sessionStorage.getItem('token');
        await axios.delete(`/api/project-users/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Swal.fire({
          title: 'Deleted!',
          text: 'Project user has been deleted.',
          icon: 'success',
          confirmButtonColor: '#3B82F6'
        });
        fetchUsers();
      } catch (err) {
        Swal.fire({
          title: 'Error!',
          text: err.response?.data?.error || 'Failed to delete user',
          icon: 'error',
          confirmButtonColor: '#3B82F6'
        });
      }
    }
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'full_name',
      header: 'Full Name',
      cell: info => <span style={{ fontWeight: 600, color: '#111827' }}>{info.getValue()}</span>,
    },
    {
      accessorKey: 'username',
      header: 'Username',
    },
    {
      accessorKey: 'email',
      header: 'Email ID',
    },
    {
      accessorKey: 'phone',
      header: 'Contact Number',
      cell: info => info.getValue() || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>N/A</span>,
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: info => {
        const active = info.getValue() !== 0;
        return (
          <span style={{
            background: active ? '#F0FDF4' : '#FEF2F2',
            color: active ? '#16A34A' : '#DC2626',
            padding: '2px 10px',
            borderRadius: '12px',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'inline-block'
          }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => handleEdit(row.original)}
            title="Edit Project User"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#4B5563',
              display: 'flex',
              alignItems: 'center',
              padding: 0
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>edit</span>
          </button>
          <button
            onClick={() => handleDelete(row.original.id, row.original.full_name)}
            title="Delete Project User"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              padding: 0
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>delete</span>
          </button>
        </div>
      ),
    }
  ], []);

  const table = useReactTable({
    data: users,
    columns,
    state: {
      globalFilter: search,
    },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading project users...</div>;
  }

  return (
    <div style={{ padding: '0 0 16px 0', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', marginTop: '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-ghost btn-back"
            style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          </button>
          <div>
            <h2 style={{ margin: 0, color: '#111827', fontSize: '1.2rem' }}>Project Co-Ordinators</h2>
            <p style={{ color: '#6B7280', margin: 0, fontSize: '0.85rem' }}>Create and oversee user credentials for project execution teams</p>
          </div>
        </div>

        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setIsEditing(false); }}
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
            Create Project User
          </button>
        )}
      </div>

      {/* Form Card */}
      {showForm && (
        <div className="card animate-fade" style={{
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '16px',
          border: '2px solid var(--primary)',
          background: 'white',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}>
          <h3 className="text-h3" style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--primary)' }}>
            {isEditing ? 'Edit Project User Details' : 'Create New Project User'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Enter full name"
                  required
                  autoComplete="new-name"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email ID *</label>
                <input
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="name@company.com"
                  required
                  autoComplete="new-email"
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: isPhoneInvalid ? '#DC2626' : 'inherit' }}>Contact Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.phone}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, ''); // only allow digits
                    if (val.length <= 10) {
                      setForm({ ...form, phone: val });
                    }
                  }}
                  placeholder="e.g. 9876543210"
                  autoComplete="new-phone"
                  style={{
                    border: isPhoneInvalid ? '1.5px solid #EF4444' : undefined,
                    background: isPhoneInvalid ? '#FEF2F2' : undefined,
                    outlineColor: isPhoneInvalid ? '#EF4444' : undefined
                  }}
                />
                {isPhoneInvalid && (
                  <span style={{ color: '#EF4444', fontSize: '0.72rem', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                    Invalid format (must be exactly 10 digits)
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Username *</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="Choose username"
                  required
                  autoComplete="new-username"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Password {isEditing ? '(Leave blank to keep unchanged)' : '*'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingRight: '40px' }}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder={isEditing ? '••••••••' : 'Enter password'}
                    required={!isEditing}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#6B7280',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.role}
                  disabled
                  style={{ background: '#F3F4F6', color: '#6B7280', cursor: 'not-allowed' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label className="form-label" style={{ marginBottom: '8px' }}>Status</label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="status"
                      checked={form.is_active === true}
                      onChange={() => setForm({ ...form, is_active: true })}
                    />
                    Active
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="status"
                      checked={form.is_active === false}
                      onChange={() => setForm({ ...form, is_active: false })}
                    />
                    Inactive
                  </label>
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                onClick={handleCloseForm}
              >
                Discard
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  padding: '6px 16px',
                  fontSize: '0.85rem',
                  opacity: isPhoneInvalid ? 0.6 : 1,
                  cursor: isPhoneInvalid ? 'not-allowed' : 'pointer'
                }}
                disabled={isPhoneInvalid}
              >
                {isEditing ? 'Save Changes' : 'Register User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search Bar */}
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
            placeholder="Search by name, email, or username..."
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
      </div>

      {/* Users Table */}
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
                  <th
                    key={header.id}
                    style={{
                      padding: '8px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      color: '#4B5563',
                      textTransform: 'uppercase',
                      letterSpacing: '0.025em'
                    }}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
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
                  No project users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
