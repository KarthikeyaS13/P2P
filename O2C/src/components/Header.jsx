import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        try {
          const token = sessionStorage.getItem('token');
          const res = await axios.get(`http://localhost:5000/api/search?q=${searchQuery}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSearchResults(res.data);
          setShowResults(true);
        } catch (err) {
          console.error('Search error:', err);
        }
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleResultClick = (link) => {
    navigate(link);
    setSearchQuery('');
    setShowResults(false);
  };

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span className="app-header__brand">O2C Command Center</span>
      </div>
      <div className="app-header__actions">
        <div className="search-container" ref={searchRef} style={{ position: 'relative' }}>
          <input
            className="app-header__search"
            placeholder="Search across modules..."
            type="text"
            id="global-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
          />
          {showResults && searchResults.length > 0 && (
            <div className="search-results-dropdown">
              {searchResults.map((result, idx) => (
                <div
                  key={idx}
                  className="search-result-item"
                  onClick={() => handleResultClick(result.link)}
                >
                  <div className="search-result-info">
                    <span className="search-result-title">{result.title}</span>
                    <span className="search-result-type">{result.type}</span>
                  </div>
                  <span className="material-symbols-outlined search-result-icon">chevron_right</span>
                </div>
              ))}
            </div>
          )}
          {showResults && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="search-results-dropdown">
              <div className="search-result-item" style={{ cursor: 'default', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No results found for "{searchQuery}"
              </div>
            </div>
          )}
        </div>
        <div className="app-header__icons">
          <span className="material-symbols-outlined tooltip" data-tooltip="Notifications">notifications</span>
          <span className="material-symbols-outlined tooltip" data-tooltip="Help">help_outline</span>
          <span className="app-header__divider"></span>
          <div className="header__user">
            <div className="avatar-initials avatar-initials--primary">
              {user ? user.full_name?.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="header__user-info">
              {user ? (
                <>
                  <span className="user-name">{user.full_name}</span>
                  <span className="user-role">{user.role}</span>
                </>
              ) : (
                <span className="user-name">User Name</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
