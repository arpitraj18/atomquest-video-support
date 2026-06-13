import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { Login } from './pages/Login';
import { AgentConsole } from './pages/AgentConsole';
import { CallRoom } from './pages/CallRoom';
import { Join } from './pages/Join';
import { AdminDashboard } from './pages/AdminDashboard';
import { CustomerHome } from './pages/CustomerHome';

/** Route guard: redirects to /login when there is no auth token. */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <span className="spinner" />
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/console" replace />} />
            <Route path="/support" element={<CustomerHome />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/console"
              element={<ProtectedRoute><AgentConsole /></ProtectedRoute>}
            />
            <Route
              path="/call/:sessionId"
              element={<CallRoom />}
            />
            <Route path="/join/:inviteCode" element={<Join />} />
            <Route
              path="/admin"
              element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>}
            />
            <Route
              path="*"
              element={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', flexDirection: 'column', gap: '1rem' }}>
                  <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>404</h1>
                  <p className="text-muted">Page not found</p>
                  <a href="/login" className="btn btn-primary">Go to login</a>
                </div>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
