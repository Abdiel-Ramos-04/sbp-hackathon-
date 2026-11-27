import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setApiProfile } from '../services/api.js';

const AppContext = createContext(null);

export const PROFILES = {
  publico: {
    id: 'publico',
    label: 'Público / Consultivo',
    badge: 'Consulta',
    color: '#00d2ff',
    description: 'Consulta rankings, aplica filtros, explora gráficos y descarga datos oficiales.',
    allowedRoutes: ['dashboard', 'rankings', 'calidad']
  },
  analista: {
    id: 'analista',
    label: 'Analista Financiero',
    badge: 'Análisis',
    color: '#10b981',
    description: 'Incluye comparador de entidades, evolución histórica, análisis complementario, reportes e IA.',
    allowedRoutes: ['dashboard', 'rankings', 'comparador', 'evolucion', 'asistente', 'reportes', 'calidad']
  },
  administrador: {
    id: 'administrador',
    label: 'Administrador SBP',
    badge: 'Control Total',
    color: '#f59e0b',
    description: 'Control completo: ingesta AT03, catálogos, umbrales, auditoría, respaldos y sincronización híbrida.',
    allowedRoutes: ['dashboard', 'rankings', 'comparador', 'evolucion', 'asistente', 'reportes', 'datos', 'calidad', 'configuracion']
  }
};

export function AppProvider({ children }) {
  const [profile, setProfileState] = useState(() => {
    const saved = localStorage.getItem('sbp_profile') || 'administrador';
    const valid = PROFILES[saved] ? saved : 'publico';
    setApiProfile(valid);
    return valid;
  });

  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [hybridStatus, setHybridStatus] = useState({
    mode: 'local',
    status: 'local',
    localEngineReady: true,
    remoteReachable: false,
    syncAuthorized: false
  });
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [toasts, setToasts] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const setProfile = useCallback((newProfile) => {
    if (!PROFILES[newProfile]) return;
    setApiProfile(newProfile);
    setProfileState(newProfile);
    localStorage.setItem('sbp_profile', newProfile);
    addToast(`Perfil cambiado a: ${PROFILES[newProfile].label}`, 'info');
  }, [addToast]);

  const loadGlobalMeta = useCallback(async () => {
    try {
      const [perRes, hybRes] = await Promise.all([
        api.getPeriodos(),
        api.getHybridStatus().catch(() => ({ data: null }))
      ]);
      const list = perRes.data || [];
      setPeriodos(list);
      if (list.length > 0) {
        setSelectedPeriod(prev => (prev && list.some(p => p.fecha === prev) ? prev : list[0].fecha));
      }
      if (hybRes?.data) {
        setHybridStatus(hybRes.data);
      }
    } catch (err) {
      console.error('Error loading global metadata:', err);
    }
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTick(t => t + 1);
    loadGlobalMeta();
  }, [loadGlobalMeta]);

  useEffect(() => {
    loadGlobalMeta();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadGlobalMeta]);

  const canAccess = useCallback((routeId) => {
    return PROFILES[profile]?.allowedRoutes.includes(routeId) ?? false;
  }, [profile]);

  return (
    <AppContext.Provider
      value={{
        profile,
        profileMeta: PROFILES[profile],
        setProfile,
        canAccess,
        periodos,
        selectedPeriod,
        setSelectedPeriod,
        hybridStatus,
        setHybridStatus,
        isOnline,
        toasts,
        addToast,
        refreshTick,
        triggerRefresh
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
