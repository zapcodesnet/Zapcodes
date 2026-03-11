import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import RepairCode from './pages/RepairCode';
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><div className="spinner" style={{ width: 40, height: 40 }} /></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}
export default function App() {
  return (
    <>
      {/* #5: Persistent top navigation bar */}
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/build" element={<ProtectedRoute><Build /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        {/* #3: My Projects page */}
        <Route path="/projects" element={<ProtectedRoute><MyProjects /></ProtectedRoute>} />
        {/* #5: Repair Code page — directly accessible */}
        <Route path="/repair" element={<ProtectedRoute><RepairCode /></ProtectedRoute>} />
        <Route path="/repo/:repoId" element={<ProtectedRoute><RepoDetail /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <HelpAI />
    </>
  );
}
