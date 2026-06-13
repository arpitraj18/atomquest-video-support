import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as apiLogin, ApiRequestError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const { token, user } = await apiLogin(email.trim(), password);
      login(token, user);
      navigate('/console');
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Could not connect to the server.';
      toast('error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center font-body-md antialiased p-4">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]"></div>
         <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-secondary/5 blur-[140px]"></div>
      </div>

      <div className="bg-surface-container-lowest p-10 rounded-2xl border border-surface-variant/50 shadow-2xl w-full max-w-[440px] relative z-10 flex flex-col items-center">
        
        {/* Logo Header */}
        <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center shrink-0 shadow-sm border border-surface-variant/50 mb-6">
           <span className="material-symbols-outlined text-primary text-[32px]">support_agent</span>
        </div>
        
        <div className="text-center mb-10 w-full">
          <h1 className="font-display-lg text-3xl font-bold text-on-surface mb-2 tracking-tight">Atomberg Support</h1>
          <p className="font-body-lg text-on-surface-variant">Expert Portal Login</p>
        </div>

        <form className="w-full flex flex-col gap-6" onSubmit={handleSubmit}>
          
          <div className="flex flex-col gap-2">
            <label htmlFor="login-email" className="font-label-md text-on-surface-variant uppercase tracking-wider ml-1">Email Address</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">mail</span>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@atomberg.com"
                autoComplete="email"
                autoFocus
                required
                className="w-full bg-surface-container hover:bg-surface-container-high focus:bg-surface-container-high transition-colors border border-surface-variant rounded-xl py-3 pl-12 pr-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-on-surface-variant/50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="login-password" className="font-label-md text-on-surface-variant uppercase tracking-wider ml-1">Password</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">lock</span>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full bg-surface-container hover:bg-surface-container-high focus:bg-surface-container-high transition-colors border border-surface-variant rounded-xl py-3 pl-12 pr-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-on-surface-variant/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full bg-primary-container text-white font-label-md text-base font-bold py-3.5 rounded-xl mt-2 flex justify-center items-center gap-2 hover:bg-primary-container/90 hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100"
            id="btn-login"
          >
            {loading ? (
              <span className="spinner w-5 h-5 border-2" />
            ) : (
              <>
                <span>Sign In Securely</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <p className="mt-8 font-label-sm text-on-surface-variant/70 flex items-center gap-1.5 border-t border-surface-variant/50 pt-6 w-full justify-center">
          <span className="material-symbols-outlined text-[14px]">gpp_good</span>
          Authorized Atomberg Personnel Only
        </p>
      </div>
    </div>
  );
};
