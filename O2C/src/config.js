export const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : window.location.origin);

export const getFileUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (path.startsWith('/uploads')) {
    return isLocal ? `http://localhost:5000${path}` : `${window.location.origin}/api${path}`;
  }
  
  return isLocal ? `http://localhost:5000${path}` : `${window.location.origin}${path}`;
};
