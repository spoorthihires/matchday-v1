import { Navigate, Route, Routes } from 'react-router-dom';
import { ComingSoon } from './components/ComingSoon.js';
import { AuthProvider } from './auth/AuthContext.js';
import { ForgotStub } from './auth/ForgotStub.js';
import { LoginPage } from './auth/LoginPage.js';
import { MfaStub } from './auth/MfaStub.js';
import { RoleRoute } from './auth/RoleRoute.js';
import { Dashboard } from './pages/Dashboard/index.js';
import { DrivesPage } from './pages/Drives/index.js';
import { ApprovalsPage } from './pages/Employers/approvals/ApprovalsPage.js';
import { EmployersPage } from './pages/Employers/index.js';
import { EvaluationsPage } from './pages/Evaluations/index.js';
import { EvalMonitorPage } from './pages/Evaluations/monitor/EvalMonitorPage.js';
import { InstituteDetail } from './pages/Institutes/detail/InstituteDetail.js';
import { InstitutesPage } from './pages/Institutes/index.js';
import { JobseekersPage } from './pages/Jobseekers/index.js';
import { Portal } from './pages/Portal/index.js';
import { SlotsPage } from './pages/Slots/index.js';
import { StreamRulesPage } from './pages/Streams/rules/StreamRulesPage.js';
import { StreamsPage } from './pages/Streams/index.js';
import { TemplatesPage } from './pages/Templates/index.js';
import { Toaster } from './toast/Toaster.js';

export default function App() {
  return (
    <AuthProvider>
      <Toaster />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaStub />} />
        <Route path="/forgot" element={<ForgotStub />} />
        <Route path="/portal" element={<RoleRoute role="jobseeker"><Portal /></RoleRoute>} />
        <Route path="/coming-soon/:slug" element={<RoleRoute role="admin"><ComingSoon /></RoleRoute>} />
        <Route path="/drives" element={<RoleRoute role="admin"><DrivesPage /></RoleRoute>} />
        <Route path="/institutes" element={<RoleRoute role="admin"><InstitutesPage /></RoleRoute>} />
        <Route path="/institutes/:id" element={<RoleRoute role="admin"><InstituteDetail /></RoleRoute>} />
        <Route path="/jobseekers" element={<RoleRoute role="admin"><JobseekersPage /></RoleRoute>} />
        <Route path="/employers" element={<RoleRoute role="admin"><EmployersPage /></RoleRoute>} />
        <Route path="/employers/approvals" element={<RoleRoute role="admin"><ApprovalsPage /></RoleRoute>} />
        <Route path="/slots" element={<RoleRoute role="admin"><SlotsPage /></RoleRoute>} />
        <Route path="/streams" element={<RoleRoute role="admin"><StreamsPage /></RoleRoute>} />
        <Route path="/streams/rules" element={<RoleRoute role="admin"><StreamRulesPage /></RoleRoute>} />
        <Route path="/templates" element={<RoleRoute role="admin"><TemplatesPage /></RoleRoute>} />
        <Route path="/evaluations" element={<RoleRoute role="admin"><EvaluationsPage /></RoleRoute>} />
        <Route path="/evaluations/monitor" element={<RoleRoute role="admin"><EvalMonitorPage /></RoleRoute>} />
        <Route path="/*" element={<RoleRoute role="admin"><Dashboard /></RoleRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
