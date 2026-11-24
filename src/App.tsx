import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { VayuProvider } from './context/VayuContext.tsx';
import { AppLayout } from './layouts/AppLayout.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import { AskVayuPage } from './pages/AskVayuPage.tsx';
import { CommunityPage } from './pages/CommunityPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { FamilyProtectionPage } from './pages/FamilyProtectionPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { PollutionMapPage } from './pages/PollutionMapPage.tsx';
import { RoutinePlannerPage } from './pages/RoutinePlannerPage.tsx';

function LandingOrAutostart() {
  const [params] = useSearchParams();
  if (params.get('autostart') === '1') {
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <VayuProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingOrAutostart />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/map" element={<PollutionMapPage />} />
            <Route path="/ask" element={<AskVayuPage />} />
            <Route path="/planner" element={<RoutinePlannerPage />} />
            <Route path="/family" element={<FamilyProtectionPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </VayuProvider>
  );
}
