import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Login({ onSuccess }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await axios.post('http://localhost:5000/api/login', { username, password });
      const data = res.data;
      login(data.token, data.user);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--background)' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 className="text-h1" style={{ color: 'var(--primary)', marginBottom: '8px' }}>O2C Portal</h1>
          <p className="text-body" style={{ color: 'var(--secondary)' }}>Sign in to access the command center</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-control"
              required
              placeholder="admin or sales"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              required
              placeholder="qwe123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div style={{ color: 'var(--error)', fontSize: '14px', marginTop: '12px' }}>{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '24px', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--secondary)', textAlign: 'center' }}>
          Available test accounts:<br />
          admin / qwe123 (Admin Role)<br />
          sales / qwe123 (Sales Role)<br />
          accounts / qwe123 (Accounts Role)<br />
          stores / qwe123 (Stores Role)<br />
          projects / qwe123 (Projects Role)<br />
          {/* auditor / qwe123 (Auditor Role) */}
        </div>
      </div>
    </div>
  );
}
