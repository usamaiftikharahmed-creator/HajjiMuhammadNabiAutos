import axios from 'axios';

// When running in dev on localhost, use local Vite proxy /api.
// When deployed (in production), ensure it always targets the /api endpoints of the live backend.
const rawBaseUrl = import.meta.env.VITE_API_URL || 'https://hajji-muhammad-nabi-autos.vercel.app/api';
export const API_BASE_URL = import.meta.env.DEV 
  ? '/api' 
  : (rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl.replace(/\/+$/, '')}/api`);

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