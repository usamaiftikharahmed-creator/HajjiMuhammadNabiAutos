import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, ShieldCheck, Store, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // 🔄 Auto Redirect agar user logged in ho jaye
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const toastId = toast.loading('Signing in...');

    try {
      await login(username, password);
      toast.success('Login Successful!', { id: toastId });
      // 🚀 Direct Redirection Command
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Invalid username or password';
      setError(errorMsg);
      toast.error(errorMsg, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-950 text-slate-100">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 p-12 flex-col justify-between relative overflow-hidden border-r border-slate-800">
        <div className="flex items-center gap-3 z-10">
          <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
            <Store className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-wide">Hajji Mohammad Nabi Autos</span>
        </div>

        <div className="z-10 max-w-lg space-y-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-white leading-tight">
            Hajji Mohammad Nabi Autos
          </h1>
          <p className="text-slate-400 text-base">
            Installment Sales, Customer Khata & Daily Cash (Roznamcha) Management System.
          </p>

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
                <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider block">EasyPaisa Account</span>
                <p className="font-mono text-sm font-bold text-white mt-0.5">03232200325</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
                <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider block">JazzCash Account</span>
                <p className="font-mono text-sm font-bold text-white mt-0.5">03030246040</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm flex items-center gap-3.5">
              <img 
                src="/shop_location_qr.png" 
                alt="Shop Location QR" 
                className="w-12 h-12 rounded-lg bg-white p-0.5 object-contain shrink-0 shadow"
              />
              <div>
                <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider block">Shop Location</span>
                <p className="text-sm font-bold text-white mt-0.5">Shop # 14, Sector 16-B, Main Godhra Stop New Karachi</p>
                <p className="text-[11px] text-slate-400">Scan QR code for direct Google Maps directions</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 z-10">© 2026 Hajji Mohammad Nabi Autos.</p>
      </div>

      {/* Right Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-slate-950">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h2>
            <p className="text-slate-400 text-sm mt-2">Sign in to access your shop portal</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-slate-300 text-sm font-medium block mb-2 text-left">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 text-slate-500 w-5 h-5" />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-3 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" 
                  placeholder="Enter username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 text-sm font-medium block mb-2 text-left">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-slate-500 w-5 h-5" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-3 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" 
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>{isSubmitting ? 'Signing in...' : 'Sign In to Portal'}</span>
              {!isSubmitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}