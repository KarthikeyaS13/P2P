import React, { useState, useEffect, useRef } from 'react';

export default function CustomCustomerSelect({ customers, value, onChange, disabled }) {
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

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCustomer = customers.find(c => String(c.id) === String(value));

  const handleSelect = (customer) => {
    onChange({ target: { name: 'customerId', value: customer.id } });
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="compact-form-select"
        style={{
          background: disabled ? '#F9FAFB' : 'white',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: value ? '#111827' : '#6B7280',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedCustomer ? selectedCustomer.name : 'Select Customer'}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: isOpen ? '#3B82F6' : '#6B7280', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
          expand_more
        </span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'white', border: '1px solid #BFDBFE', borderRadius: '4px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 1000,
          marginTop: '4px'
        }}>
          <div style={{ padding: '8px', background: '#F9FAFB', borderBottom: '1px solid #E2E8F0' }}>
            <input
              autoFocus
              placeholder="Search customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB',
                borderRadius: '4px', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
          <div className="custom-scrollbar" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6B7280', fontSize: '12px' }}>
                No customer found
              </div>
            ) : (
              filteredCustomers.map(c => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  style={{
                    padding: '8px 12px', fontSize: '12px', cursor: 'pointer',
                    background: String(value) === String(c.id) ? '#EFF6FF' : 'white',
                    color: String(value) === String(c.id) ? '#1D4ED8' : '#374151',
                    fontWeight: String(value) === String(c.id) ? 600 : 400,
                    borderBottom: '1px solid #F1F5F9'
                  }}
                  onMouseOver={(e) => { if (String(value) !== String(c.id)) e.currentTarget.style.background = '#F8FAFC'; }}
                  onMouseOut={(e) => { if (String(value) !== String(c.id)) e.currentTarget.style.background = 'white'; }}
                >
                  {c.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
