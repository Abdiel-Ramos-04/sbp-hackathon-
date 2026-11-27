import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RankingsPage from './pages/RankingsPage.jsx';
import ComparadorPage from './pages/ComparadorPage.jsx';
import EvolucionPage from './pages/EvolucionPage.jsx';
import AsistentePage from './pages/AsistentePage.jsx';
import ReportesPage from './pages/ReportesPage.jsx';
import DatosPage from './pages/DatosPage.jsx';
import CalidadPage from './pages/CalidadPage.jsx';
import ConfiguracionPage from './pages/ConfiguracionPage.jsx';

function AppInner() {
  const { canAccess, profile } = useApp();
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedRanking, setSelectedRanking] = useState('HIPOTECARIO');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect automatically to dashboard if profile changes and current page becomes restricted
  useEffect(() => {
    if (!canAccess(activePage)) {
      setActivePage('dashboard');
    }
  }, [profile, activePage, canAccess]);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActivePage} onSelectRanking={setSelectedRanking} />;
      case 'rankings':
        return <RankingsPage initialRanking={selectedRanking} />;
      case 'comparador':
        return <ComparadorPage />;
      case 'evolucion':
        return <EvolucionPage />;
      case 'asistente':
        return <AsistentePage />;
      case 'reportes':
        return <ReportesPage />;
      case 'datos':
        return <DatosPage />;
      case 'calidad':
        return <CalidadPage />;
      case 'configuracion':
        return <ConfiguracionPage />;
      default:
        return <DashboardPage onNavigate={setActivePage} onSelectRanking={setSelectedRanking} />;
    }
  };

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
