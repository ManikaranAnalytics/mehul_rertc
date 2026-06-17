import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, User } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Enter your system identity and authorization key.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__backdrop" style={{ backgroundImage: 'url(/bg.png)' }} />
      <div className="login-page__overlay" />

      <div className="login-card">
        <div className="login-card__logo">
          <img src="/logo.png" alt="Manikaran Analytics" />
        </div>

        <div className="login-card__heading">
          <h1>SIGN IN</h1>
          <p>PORTAL AUTHENTICATION</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span className="login-field__label">USER NAME</span>
            <div className="login-field__input-wrap">
              <User size={16} className="login-field__icon" />
              <input
                type="text"
                autoComplete="username"
                placeholder="User name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </label>

          <label className="login-field">
            <span className="login-field__label">AUTHORIZATION KEY</span>
            <div className="login-field__input-wrap">
              <Lock size={16} className="login-field__icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="login-field__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={submitting}>
            <span>{submitting ? 'AUTHENTICATING…' : 'SIGN IN TO RE-RTC'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <p className="login-footer">SECURE ENTERPRISE GATE • 2026</p>
      </div>
    </div>
  );
}
