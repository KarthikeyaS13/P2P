import React, { useState, useEffect, useRef } from 'react';
import { INDIAN_STATES } from '../utils/states';

export default function CustomStateSelect({ value, onChange, disabled, style }) {
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

  const filteredStates = INDIAN_STATES.filter(s =>
    s.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (state) => {
    onChange({ target: { name: 'state', value: state } });
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
        <span>{value || '-- Select State --'}</span>
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
                placeholder="Search states..."
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
            {filteredStates.map((s) => (
              <div
                key={s}
                onClick={() => handleSelect(s)}
                style={{
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: value === s ? '#EFF6FF' : 'transparent',
                  color: value === s ? '#1D4ED8' : '#374151',
                  fontWeight: value === s ? 600 : 400,
                  marginBottom: '2px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseOver={(e) => {
                  if (value !== s) e.currentTarget.style.background = '#F3F4F6';
                }}
                onMouseOut={(e) => {
                  if (value !== s) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>{s}</span>
                {value === s && <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check</span>}
              </div>
            ))}
            {filteredStates.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.5 }}>search_off</span>
                No matches found
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
