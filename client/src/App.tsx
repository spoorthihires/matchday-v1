import { Navigate, Route, Routes } from 'react-router-dom';
import { ComingSoon } from './components/ComingSoon.js';
import { AuthProvider } from './auth/AuthContext.js';
import { ForgotStub } from './auth/ForgotStub.js';
import { LoginPage } from './auth/LoginPage.js';
import { MfaStub } from './auth/MfaStub.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { Dashboard } from './pages/Dashboard/index.js';
import { DrivesPage } from './pages/Drives/index.js';
import { InstituteDetail } from './pages/Institutes/detail/InstituteDetail.js';
import { InstitutesPage } from './pages/Institutes/index.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaStub />} />
        <Route path="/forgot" element={<ForgotStub />} />
        <Route path="/coming-soon/:slug" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
        <Route path="/drives" element={<ProtectedRoute><DrivesPage /></ProtectedRoute>} />
        <Route path="/institutes" element={<ProtectedRoute><InstitutesPage /></ProtectedRoute>} />
        <Route path="/institutes/:id" element={<ProtectedRoute><InstituteDetail /></ProtectedRoute>} />
        <Route path="/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
