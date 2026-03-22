import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import RepoDetail from './pages/RepoDetail';
import Pricing from './pages/Pricing';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Build from './pages/Build';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import AuthCallback from './pages/AuthCallback';
import HelpAI from './components/HelpAI';
import MyProjects from './pages/MyProjects';
import WidgetDashboard from './pages/WidgetDashboard';
import RepairCode from './pages/RepairCode';
import useVisitorTracking from './hooks/useVisitorTracking';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  return children;
}

// Inject CSS to move HelpAI ? button to bottom-LEFT on mobile
// so it never blocks the Navbar hamburger (which is top-right)
if (typeof document !== 'undefined' && !document.getElementById('zc-helpai-mobile-fix')) {
  const style = document.createElement('style');
  style.id = 'zc-helpai-mobile-fix';
  style.textContent = `
    @media (max-width: 900px) {
      #help-ai-root, .help-ai-container,
      div[style*="position: fixed"][style*="right: 2"][style*="bottom"],
      div[style*="position:fixed"][style*="right:2"][style*="bottom"],
      div[style*="position: fixed"][style*="right: 1"][style*="bottom"],
      div[style*="position:fixed"][style*="right:1"][style*="bottom"] {
        right: auto !important;
        left: 12px !important;
        z-index: 50 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default function App() {
  useVisitorTracking();
  const location = useLocation();
  const isAdminPage = location.pathname === '/admin';

  // Extra safety: force-move HelpAI button on mobile via JS
  useEffect(() => {
    if (window.innerWidth > 900) return;
    const moveHelpAI = () => {
      // Find any fixed-position element in bottom-right that looks like HelpAI
      document.querySelectorAll('div[style]').forEach(el => {
        const s = el.style;
        if (s.position === 'fixed' && s.bottom && s.right && !s.left) {
          const r = parseInt(s.right);
          const b = parseInt(s.bottom);
          if (r < 40 && b < 40 && el.querySelector('button')) {
            el.style.right = 'auto';
            el.style.left = '12px';
            el.style.zIndex = '50';
          }
        }
      });
    };
    const timer = setTimeout(moveHelpAI, 1000);
    const timer2 = setTimeout(moveHelpAI, 3000);
    return () => { clearTimeout(timer); clearTimeout(timer2); };
  }, [location.pathname]);

  return (
    <>
      {!isAdminPage && <Navbar />}
      <Routes>
        <Route path="/"              element={<Landing />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/register"      element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pricing"       element={<Pricing />} />
        <Route path="/privacy"       element={<Privacy />} />
        <Route path="/terms"         element={<Terms />} />
        <Route path="/build"         element={<ProtectedRoute><Build /></ProtectedRoute>} />
        <Route path="/settings"      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/admin"         element={<Admin />} />
        <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/projects"      element={<ProtectedRoute><MyProjects /></ProtectedRoute>} />
        <Route path="/widget-dashboard" element={<ProtectedRoute><WidgetDashboard /></ProtectedRoute>} />
        <Route path="/repair"        element={<ProtectedRoute><RepairCode /></ProtectedRoute>} />
        <Route path="/repo/:repoId"  element={<ProtectedRoute><RepoDetail /></ProtectedRoute>} />
        <Route path="*"              element={<Navigate to="/" />} />
      </Routes>
      {!isAdminPage && <HelpAI />}
    </>
  );
}
