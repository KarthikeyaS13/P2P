import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './style.css'
import axios from 'axios'
import { API_BASE_URL } from './config'

// Configure Axios request interceptor to dynamically rewrite localhost:5000 requests
axios.interceptors.request.use((config) => {
  if (config.url && config.url.startsWith('http://localhost:5000')) {
    config.url = config.url.replace('http://localhost:5000', API_BASE_URL);
  }
  return config;
});

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
