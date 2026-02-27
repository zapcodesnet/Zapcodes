import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState({ github: false, google: false });

  // Verification state
  const [verifyStep, setVerifyStep] = useState(null); // null | 'email' | 'admin'
  const [verifyEmail, setVerifyEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');

  const { login, completeVerifiedLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/providers').then(({ data }) => setProviders(data)).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setError('OAuth login failed. Please try email/password instead.');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.needsVerification) {
        setVerifyStep('email');
        setVerifyEmail(data.email);
        if (data.devCode) setDevCode(data.devCode);
      } else if (data.needsAdminVerification) {
        setVerifyStep('admin');
        setVerifyEmail(data.email);
        if (data.devCode) setDevCode(data.devCode);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.needsVerification) {
        setVerifyStep('email');
        setVerifyEmail(errData.email);
        if (errData.devCode) setDevCode(errData.devCode);
        setError(errData.message || 'Please verify your email.');
      } else {
        setError(errData?.error || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError(''); setLoading(true);
    try {
      const endpoint = verifyStep === 'admin' ? '/auth/verify-admin-login' : '/auth/verify-email';
      const { data } = await api.post(endpoint, { email: verifyEmail, code });
      completeVerifiedLogin(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
    }
    setLoading(false);
  };

  const resendCode = async () => {
    try {
      const { data } = await api.post('/auth/resend-code', { email: verifyEmail, type: verifyStep === 'admin' ? 'admin' : 'login' });
      if (data.devCode) setDevCode(data.devCode);
      setError('');
      alert('New verification code sent!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend code');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="animate-in">
        <Link to="/" style={styles.logo}>
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>ZapCodes</span>
        </Link>

        {/* Verification Step */}
        {verifyStep ? (
          <>
            <h1 style={styles.title}>{verifyStep === 'admin' ? '🔐 Admin Verification' : '📧 Verify Email'}</h1>
            <p style={styles.sub}>
              {verifyStep === 'admin'
                ? 'A verification code was sent to your admin email.'
                : 'A verification code was sent to your email.'}
            </p>

            {error && <div style={styles.error}>{error}</div>}
            {devCode && <div style={{ ...styles.error, background: 'rgba(0,229,160,0.1)', borderColor: 'rgba(0,229,160,0.3)', color: '#00e5a0' }}>Dev mode — code: <strong>{devCode}</strong></div>}

            <div className="form-group">
              <label>Verification Code</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.4rem', fontWeight: 700 }} />
            </div>
            <button onClick={verifyCode} className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading || code.length < 6}>
              {loading ? <span className="spinner" /> : 'Verify'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button onClick={resendCode} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem' }}>Resend code</button>
              <button onClick={() => { setVerifyStep(null); setCode(''); setDevCode(''); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>← Back to login</button>
            </div>
          </>
        ) : (
          <>
            {/* Normal Login */}
            <h1 style={styles.title}>Welcome back</h1>
            <p style={styles.sub}>Sign in to your account</p>

            {error && <div style={styles.error}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Sign In'}
              </button>
            </form>

            {(providers.github || providers.google) && (
              <>
                <div style={styles.divider}><span>or continue with</span></div>
                <div className="flex gap-2">
                  {providers.github && (
                    <a href={`${API_URL}/auth/github`} className="btn btn-secondary" style={{ flex: 1 }}>
                      GitHub
                    </a>
                  )}
                  {providers.google && (
                    <a href={`${API_URL}/auth/google`} className="btn btn-secondary" style={{ flex: 1 }}>
                      Google
                    </a>
                  )}
                </div>
              </>
            )}

            <p style={styles.footer}>
              Don't have an account? <Link to="/register">Create one</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, position: 'relative', zIndex: 1,
    background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(0, 229, 160, 0.04) 0%, transparent 60%)',
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    padding: 40, width: '100%', maxWidth: 420,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, color: 'var(--text-primary)' },
  title: { fontSize: '1.8rem', fontWeight: 800, marginBottom: 4 },
  sub: { color: 'var(--text-secondary)', marginBottom: 24 },
  error: {
    background: 'rgba(255, 68, 102, 0.1)', border: '1px solid rgba(255, 68, 102, 0.3)',
    borderRadius: 'var(--radius-sm)', padding: 12, color: 'var(--danger)',
    fontSize: '0.9rem', marginBottom: 16,
  },
  divider: {
    textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem',
    margin: '24px 0', position: 'relative',
    display: 'flex', alignItems: 'center', gap: 16,
  },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: '0.9rem' },
};
