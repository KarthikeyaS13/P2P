import React, { useState, useEffect, useRef } from 'react';
import { POPULAR_CITIES } from '../utils/cities';

export default function CustomCitySelect({ value, onChange, onSelectOther, disabled, style }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Filter cities by name or state
  const filteredCities = POPULAR_CITIES.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group filtered cities by category
  const categories = {};
  filteredCities.forEach(city => {
    if (!categories[city.category]) {
      categories[city.category] = [];
    }
    categories[city.category].push(city);
  });

  const handleSelect = (city) => {
    onChange(city.name, city.state);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: '8px',
          border: `2px solid ${isOpen ? '#3B82F6' : '#D1D5DB'}`,
          background: disabled ? '#F9FAFB' : 'white',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '14px',
          color: value ? '#111827' : '#6B7280',
          boxShadow: isOpen ? '0 0 0 4px rgba(59, 130, 246, 0.1)' : 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          fontWeight: value ? 500 : 400
        }}
      >
        <span>{value ? `${value} (${POPULAR_CITIES.find(c => c.name === value)?.state || ''})` || value : '-- Select City --'}</span>
        <span className="material-symbols-outlined" style={{
          fontSize: '20px',
          color: isOpen ? '#3B82F6' : '#6B7280',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.3s ease'
        }}>
          expand_more
        </span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          background: 'white',
          border: '2px solid #c9daf6ff',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: 1000,
          overflow: 'hidden',
          animation: 'fadeInScale 0.2s ease-out'
        }}>
          <div style={{ padding: '12px', background: '#F9FAFB', borderBottom: '2px solid #3B82F6' }}>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '18px',
                color: '#9CA3AF'
              }}>
                search
              </span>
              <input
                autoFocus
                placeholder="Search cities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 36px',
                  fontSize: '14px',
                  border: '1px solid #a1a3a7ff',
                  borderRadius: '6px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  background: 'white'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3B82F6'}
                onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
              />
            </div>
          </div>
          <div className="custom-scrollbar" style={{ maxHeight: '280px', overflowY: 'auto', padding: '6px' }}>
            {Object.keys(categories).map(category => (
              <div key={category}>
                <div style={{
                  padding: '8px 12px 4px',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  color: '#9CA3AF',
                  fontWeight: 600,
                  letterSpacing: '0.05em'
                }}>
                  {category}
                </div>
                {categories[category].map((city) => (
                  <div
                    key={city.name}
                    onClick={() => handleSelect(city)}
                    style={{
                      padding: '10px 12px',
                      fontSize: '14px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: value === city.name ? '#EFF6FF' : 'transparent',
                      color: value === city.name ? '#1D4ED8' : '#374151',
                      fontWeight: value === city.name ? 600 : 400,
                      marginBottom: '2px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseOver={(e) => {
                      if (value !== city.name) e.currentTarget.style.background = '#F3F4F6';
                    }}
                    onMouseOut={(e) => {
                      if (value !== city.name) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{city.name} <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 400 }}>({city.state})</span></span>
                    {value === city.name && <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check</span>}
                  </div>
                ))}
              </div>
            ))}
            
            {/* "Other" Option */}
            <div>
              <div style={{
                padding: '8px 12px 4px',
                fontSize: '11px',
                textTransform: 'uppercase',
                color: '#9CA3AF',
                fontWeight: 600,
                letterSpacing: '0.05em'
              }}>
                Not in the list?
              </div>
              <div
                onClick={() => {
                  onSelectOther();
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#2563EB',
                  fontWeight: 500,
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#EFF6FF';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                <span>Type custom city...</span>
              </div>
            </div>

            {filteredCities.length === 0 && searchTerm && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '24px', display: 'block', marginBottom: '8px', opacity: 0.5 }}>search_off</span>
                No popular city matches. Click "Type custom city" below to type.
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: translateY(-10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E7EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1D5DB;
        }
      `}</style>
    </div>
  );
}
