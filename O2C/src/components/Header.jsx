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
          const res = await axios.get(`/api/search?q=${searchQuery}`, {
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

  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentDateTime.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour12: true
  });
  const formattedTime = currentDateTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <span className="app-header__brand">Order To Cash</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '6px 10px', background: 'var(--primary-light)', borderRadius: '14px', fontSize: '13px', fontWeight: 600 }}>
            <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center' }}>calendar_today</span>
              <span style={{ position: 'relative', top: '1px' }}>{formattedDate}</span>
            </div>
            <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center' }}>schedule</span>
              <span style={{ position: 'relative', top: '1px', fontVariantNumeric: 'tabular-nums' }}>{formattedTime}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
