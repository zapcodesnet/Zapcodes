import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="animate-in">
        <Link to="/" style={styles.logo}>
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>RepairBot</span>
        </Link>
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

        <div style={styles.divider}><span>or continue with</span></div>

        <div className="flex gap-2">
          <a href={`${API_URL}/auth/github`} className="btn btn-secondary" style={{ flex: 1 }}>
            GitHub
          </a>
          <a href={`${API_URL}/auth/google`} className="btn btn-secondary" style={{ flex: 1 }}>
            Google
          </a>
        </div>

        <p style={styles.footer}>
          Don't have an account? <Link to="/register">Create one</Link>
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
    margin: '24px 0', position: 'relative',
    display: 'flex', alignItems: 'center', gap: 16,
  },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: '0.9rem' },
};
