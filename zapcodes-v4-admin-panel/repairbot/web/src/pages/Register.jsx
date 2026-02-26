import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState({ github: false, google: false });
  const { register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/providers').then(({ data }) => {
      setProviders(data);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="animate-in">
        <Link to="/" style={styles.logo}>
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>ZapCodes</span>
        </Link>
        <h1 style={styles.title}>Create your account</h1>
        <p style={styles.sub}>Start fixing bugs with AI — free</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account'}
          </button>
        </form>

        {(providers.github || providers.google) && (
          <>
            <div style={styles.divider}><span>or continue with</span></div>
            <div className="flex gap-2">
              {providers.github && (
                <a href={`${API_URL}/auth/github`} className="btn btn-secondary" style={{ flex: 1 }}>GitHub</a>
              )}
              {providers.google && (
                <a href={`${API_URL}/auth/google`} className="btn btn-secondary" style={{ flex: 1 }}>Google</a>
              )}
            </div>
          </>
        )}

        <p style={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
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
    margin: '24px 0', display: 'flex', alignItems: 'center', gap: 16,
  },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: '0.9rem' },
};
