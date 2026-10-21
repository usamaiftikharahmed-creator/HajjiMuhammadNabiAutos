import { createContext, useContext, useState, useEffect, useRef } from 'react';
import API from '../api/axios';

const AuthContext = createContext();
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 Minutes

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      const userInfo = localStorage.getItem('userInfo');
      if (!token && !userInfo) {
        setUser(null);
        setLoading(false);
        return;
      }

      const res = await API.get('/auth/me');
      if (res.data?.success && res.data?.user) {
        setUser(res.data.user);
        if (res.data?.token) {
          try {
            localStorage.setItem('token', res.data.token);
          } catch (e) {}
        }
      } else {
        setUser(null);
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('userInfo');
        } catch (e) {}
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const resetInactivityTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      alert('Session expired due to 30 minutes of inactivity.');
      logout();
    }, INACTIVITY_TIMEOUT);
  };

  useEffect(() => {
    if (!user) return;
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    resetInactivityTimer();

    const handleUserActivity = () => resetInactivityTimer();
    activityEvents.forEach((event) => window.addEventListener(event, handleUserActivity));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      activityEvents.forEach((event) => window.removeEventListener(event, handleUserActivity));
    };
  }, [user]);

  const login = async (username, password) => {
    const res = await API.post('/auth/login', { username, password });
    if (res.data?.user) {
      setUser(res.data.user);
    }
    if (res.data?.token) {
      try {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('userInfo', JSON.stringify(res.data));
      } catch (e) {}
    }
    return res.data;
  };

  const addUser = async (name, username, password, role = 'staff') => {
    const res = await API.post('/auth/register', { name, username, password, role });
    return res.data;
  };

  const fetchUsers = async () => {
    const res = await API.get('/auth/users');
    return res.data;
  };

  const toggleStatus = async (id) => {
    const res = await API.patch(`/auth/users/${id}/status`);
    return res.data;
  };

  const deleteStaff = async (id) => {
    const res = await API.delete(`/auth/users/${id}`);
    return res.data;
  };

  const logout = async () => {
    try {
      await API.post('/auth/logout');
    } catch (err) {
      console.error(err);
    } finally {
      setUser(null);
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        sessionStorage.removeItem('iss_dashboard_cache');
      } catch (e) {}
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, login, addUser, logout, loading, fetchUsers, toggleStatus, deleteStaff 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);