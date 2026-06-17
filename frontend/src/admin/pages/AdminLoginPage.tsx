import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import '../styles/admin.css';

export default function AdminLoginPage() {
  const { isAdminAuthenticated, adminLogin } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/admin/dashboard';

  useEffect(() => {
    if (isAdminAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAdminAuthenticated, navigate, redirectTo]);

  if (isAdminAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter admin username and password.');
      return;
    }
    setSubmitting(true);
    try {
      await adminLogin(username, password);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-page__backdrop" style={{ backgroundImage: 'url(/admin_bg.png)' }} />
      <div className="admin-login-page__overlay" />

      <div className="admin-login-card">
        <div className="admin-login-card__badge">
          <ShieldCheck size={28} />
        </div>

        <div className="admin-login-card__heading">
          <h1>Admin Access</h1>
          <p>RE-RTC Administration Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label className="admin-login-field">
            <span className="admin-login-field__label">Admin Username</span>
            <div className="admin-login-field__input-wrap">
              <User size={16} className="admin-login-field__icon" />
              <input
                type="text"
                autoComplete="username"
                placeholder="Enter admin username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </label>

          <label className="admin-login-field">
            <span className="admin-login-field__label">Admin Password</span>
            <div className="admin-login-field__input-wrap">
              <Lock size={16} className="admin-login-field__icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="admin-login-field__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error && <div className="admin-login-error">{error}</div>}

          <button type="submit" className="admin-login-submit" disabled={submitting}>
            {submitting ? 'Signing In…' : 'Sign In'}
          </button>
        </form>

        <p className="admin-login-footer">AUTHORIZED PERSONNEL ONLY • 2026</p>
      </div>
    </div>
  );
}
