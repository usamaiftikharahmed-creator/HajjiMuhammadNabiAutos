import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // Import Toaster
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Loading System...</p>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
};

const ThemedToaster = () => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  return (
    <Toaster 
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: isLight ? '#ffffff' : '#0f172a',
          color: isLight ? '#0f172a' : '#fff',
          border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
          borderRadius: '12px',
          fontSize: '13px',
          boxShadow: isLight ? '0 10px 25px -5px rgba(15, 23, 42, 0.12)' : undefined,
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          {/* GLOBAL TOAST CONTAINER */}
          <ThemedToaster />

          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}