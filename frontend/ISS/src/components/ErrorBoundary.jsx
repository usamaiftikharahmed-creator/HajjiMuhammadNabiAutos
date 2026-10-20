import React from 'react';
import { AlertCircle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL UI RENDER ERROR CAUGHT BY ERRORBOUNDARY:', error, errorInfo);
    this.setState({ errorInfo });
    // Clear potentially corrupted dashboard cache so reload fetches fresh state
    try {
      sessionStorage.removeItem('iss_dashboard_cache');
    } catch (e) {}
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem('iss_dashboard_cache');
    } catch (e) {}
    window.location.reload();
  };

  handleResetToLogin = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      sessionStorage.clear();
    } catch (e) {}
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-white">System Display Notice</h2>
              <p className="text-xs text-rose-300 font-semibold">
                اسکرین رینڈر کرنے میں عارضی مسئلہ پیش آیا ہے
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                A temporary component render exception was prevented from crashing the system. You can instantly reload or clear cache below.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-left space-y-2">
                <p className="text-[11px] font-mono text-rose-400 break-words font-semibold">
                  {this.state.error.message || String(this.state.error)}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <details className="text-left pt-1 border-t border-slate-900">
                    <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">Technical Details / Stack</summary>
                    <pre className="text-[9px] font-mono text-slate-400 overflow-x-auto p-2 bg-slate-900 rounded-lg max-h-36 mt-1 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Reload System
              </button>

              <button
                type="button"
                onClick={this.handleResetToLogin}
                className="w-full sm:flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-2.5 px-4 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
              >
                <Home className="w-4 h-4" /> Go to Login
              </button>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
