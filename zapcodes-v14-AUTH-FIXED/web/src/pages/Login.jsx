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

  // Forgot password state
  const [forgotStep, setForgotStep] = useState(null); // null | 'challenge' | 'code' | 'newpass' | 'done'
  const [forgotEmail, setForgotEmail] = useState('');
  const [challengeQuestion, setChallengeQuestion] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { login, completeVerifiedLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/auth/providers').then(({ data }) => setProviders(data)).catch(() => {});
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
        setVerifyEmail(errData.email || email);
        setError(errData.message || 'Please verify your email. Click "Resend code" if you need a new verification code.');
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
      const endpoint = verifyStep === 'admin' ? '/api/auth/verify-admin-login' : '/api/auth/verify-email';
      const { data } = await api.post(endpoint, { email: verifyEmail, code });
      if (data.adminSessionToken) {
        localStorage.setItem('admin_session', data.adminSessionToken);
      }
      completeVerifiedLogin(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
    }
    setLoading(false);
  };

  const resendCode = async () => {
    try {
      const { data } = await api.post('/api/auth/resend-code', { email: verifyEmail, type: verifyStep === 'admin' ? 'admin' : 'login' });
      if (data.devCode) setDevCode(data.devCode);
      setError('');
      alert('New verification code sent!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend code');
    }
  };

  // ── Forgot Password handlers ──────────────────────────────────────────
  const startForgotPassword = async () => {
    setError('');
    setSuccessMsg('');
    setForgotStep('challenge');
    setForgotEmail(email || '');
    setChallengeAnswer('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    // Fetch math challenge
    try {
      const { data } = await api.get('/api/auth/reset-challenge');
      setChallengeQuestion(data.question);
      setChallengeToken(data.challengeToken);
    } catch (err) {
      setError('Failed to load security question. Please try again.');
      setForgotStep(null);
    }
  };

  const refreshChallenge = async () => {
    setChallengeAnswer('');
    try {
      const { data } = await api.get('/api/auth/reset-challenge');
      setChallengeQuestion(data.question);
      setChallengeToken(data.challengeToken);
      setError('');
    } catch (err) {
      setError('Failed to load new question.');
    }
  };

  const submitForgotPassword = async () => {
    if (!forgotEmail.trim()) return setError('Please enter your email');
    if (!challengeAnswer.trim()) return setError('Please answer the security question');
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/api/auth/forgot-password', {
        email: forgotEmail,
        challengeAnswer,
        challengeToken,
      });
      setResetToken(data.resetToken || '');
      setSuccessMsg(data.message);
      setForgotStep('code');
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Request failed';
      setError(errMsg);
      // If challenge expired or wrong answer, refresh
      if (errMsg.includes('expired') || errMsg.includes('Invalid')) {
        refreshChallenge();
      }
    } finally { setLoading(false); }
  };

  const submitResetPassword = async () => {
    if (!resetCode.trim()) return setError('Please enter the reset code from your email');
    if (!newPassword.trim()) return setError('Please enter a new password');
    if (newPassword.length < 6) return setError('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return setError('Passwords do not match');
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/api/auth/reset-password', {
        email: forgotEmail,
        code: resetCode,
        newPassword,
        resetToken,
      });
      setSuccessMsg(data.message);
      setForgotStep('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. Please try again.');
    } finally { setLoading(false); }
  };

  const backToLogin = () => {
    setForgotStep(null);
    setVerifyStep(null);
    setError('');
    setSuccessMsg('');
    setCode('');
    setDevCode('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setChallengeAnswer('');
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="animate-in">
        <Link to="/" style={styles.logo}>
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>ZapCodes</span>
        </Link>

        {/* ═══ FORGOT PASSWORD FLOW ═══ */}
        {forgotStep ? (
          <>
            {/* Step 1: Email + Math Challenge */}
            {forgotStep === 'challenge' && (
              <>
                <h1 style={styles.title}>🔑 Reset Password</h1>
                <p style={styles.sub}>Enter your email and solve the security question to verify you're human.</p>

                {error && <div style={styles.error}>{error}</div>}

                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@example.com" required />
                </div>

                <div style={styles.challengeBox}>
                  <div style={styles.challengeLabel}>🛡️ Security Question</div>
                  <div style={styles.challengeQuestion}>{challengeQuestion || 'Loading...'}</div>
                  <input
                    type="text"
                    value={challengeAnswer}
                    onChange={e => setChallengeAnswer(e.target.value)}
                    placeholder="Your answer"
                    style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: 700 }}
                    onKeyDown={e => { if (e.key === 'Enter') submitForgotPassword(); }}
                  />
                  <button onClick={refreshChallenge} style={styles.refreshBtn}>🔄 Different question</button>
                </div>

                <button onClick={submitForgotPassword} className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={loading || !forgotEmail || !challengeAnswer}>
                  {loading ? <span className="spinner" /> : 'Send Reset Code'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button onClick={backToLogin} style={styles.linkBtn}>← Back to login</button>
                </div>
              </>
            )}

            {/* Step 2: Enter reset code + new password */}
            {forgotStep === 'code' && (
              <>
                <h1 style={styles.title}>📧 Enter Reset Code</h1>
                <p style={styles.sub}>A reset code was sent to <strong>{forgotEmail}</strong>. Enter it below with your new password.</p>

                {error && <div style={styles.error}>{error}</div>}
                {successMsg && <div style={styles.success}>{successMsg}</div>}

                <div className="form-group">
                  <label>Reset Code</label>
                  <input type="text" value={resetCode} onChange={e => setResetCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.4rem', fontWeight: 700 }} />
                </div>

                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
                </div>

                <div className="form-group">
                  <label>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your new password" onKeyDown={e => { if (e.key === 'Enter') submitResetPassword(); }} />
                </div>

                <button onClick={submitResetPassword} className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading || resetCode.length < 6 || !newPassword}>
                  {loading ? <span className="spinner" /> : 'Reset Password'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button onClick={backToLogin} style={styles.linkBtn}>← Back to login</button>
                </div>
              </>
            )}

            {/* Step 3: Success */}
            {forgotStep === 'done' && (
              <>
                <h1 style={styles.title}>✅ Password Updated!</h1>
                <div style={styles.success}>{successMsg || 'Your password has been reset successfully.'}</div>
                <p style={styles.sub}>You can now log in with your new password.</p>
                <button onClick={backToLogin} className="btn btn-primary" style={{ width: '100%', marginTop: 12 }}>
                  ← Back to Login
                </button>
              </>
            )}
          </>
        ) : verifyStep ? (
          /* ═══ VERIFICATION STEP ═══ */
          <>
            <h1 style={styles.title}>{verifyStep === 'admin' ? '🔐 Admin Verification' : '📧 Verify Email'}</h1>
            <p style={styles.sub}>
              {verifyStep === 'admin'
                ? 'A verification code was sent to your admin email.'
                : 'Enter the verification code sent during registration, or click "Resend code" to get a new one.'}
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
              <button onClick={resendCode} style={styles.linkBtn}>Resend code</button>
              <button onClick={backToLogin} style={{ ...styles.linkBtn, color: 'var(--text-muted)' }}>← Back to login</button>
            </div>
          </>
        ) : (
          /* ═══ NORMAL LOGIN ═══ */
          <>
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

            {/* Forgot Password Link */}
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button onClick={startForgotPassword} style={styles.forgotBtn}>Forgot password?</button>
            </div>

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
  sub: { color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 },
  error: {
    background: 'rgba(255, 68, 102, 0.1)', border: '1px solid rgba(255, 68, 102, 0.3)',
    borderRadius: 'var(--radius-sm)', padding: 12, color: 'var(--danger)',
    fontSize: '0.9rem', marginBottom: 16,
  },
  success: {
    background: 'rgba(0, 229, 160, 0.1)', border: '1px solid rgba(0, 229, 160, 0.3)',
    borderRadius: 'var(--radius-sm)', padding: 12, color: '#00e5a0',
    fontSize: '0.9rem', marginBottom: 16,
  },
  divider: {
    textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem',
    margin: '24px 0', position: 'relative',
    display: 'flex', alignItems: 'center', gap: 16,
  },
  footer: { textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: '0.9rem' },
  forgotBtn: {
    background: 'none', border: 'none', color: 'var(--accent, #00e5a0)',
    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
    padding: 0, textDecoration: 'underline', fontFamily: 'inherit',
  },
  linkBtn: {
    background: 'none', border: 'none', color: 'var(--accent, #00e5a0)',
    cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit',
  },
  challengeBox: {
    background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius: 12, padding: 16, marginBottom: 8,
  },
  challengeLabel: {
    fontSize: '0.75rem', fontWeight: 700, color: '#6366f1',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  challengeQuestion: {
    fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)',
    marginBottom: 12, textAlign: 'center',
  },
  refreshBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: '0.75rem', marginTop: 8,
    display: 'block', width: '100%', textAlign: 'center', fontFamily: 'inherit',
  },
};
