import axios from 'axios';

// When running locally on desktop (localhost, 127.0.0.1, or LAN), always route to local Express server (/api).
// When explicitly configured via VITE_API_URL or hosted on cloud, route accordingly.
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    const raw = import.meta.env.VITE_API_URL;
    return raw.endsWith('/api') ? raw : `${raw.replace(/\/+$/, '')}/api`;
  }
  // If running in browser on localhost / desktop app:
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return '/api';
    }
  }
  return '/api';
};

export const API_BASE_URL = getApiBaseUrl();

const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

// Auto-attach JWT Bearer token to all outgoing API requests
API.interceptors.request.use((config) => {
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const token = userInfo?.token || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    // ignore parse error
  }
  return config;
});

export default API;