import React from 'react';
import {
  LayoutDashboard, Trophy, GitCompare, TrendingUp, Bot,
  FileBarChart2, DatabaseZap, ShieldCheck, Settings,
  Wifi, WifiOff, HardDrive, Cloud, Lock, UserCheck, Menu, X
} from 'lucide-react';
import { useApp, PROFILES } from '../context/AppContext.jsx';
import { formatPeriod } from '../services/api.js';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio / Dashboard', icon: LayoutDashboard, group: 'Principal' },
  { id: 'rankings', label: 'Rankings Bancarios', icon: Trophy, group: 'Principal' },
  { id: 'comparador', label: 'Comparador de Entidades', icon: GitCompare, group: 'Análisis' },
  { id: 'evolucion', label: 'Evolución Histórica', icon: TrendingUp, group: 'Análisis' },
  { id: 'asistente', label: 'Análisis Inteligente (IA)', icon: Bot, group: 'Análisis' },
  { id: 'reportes', label: 'Reportes y Exportación', icon: FileBarChart2, group: 'Salidas' },
  { id: 'datos', label: 'Gestión de Datos', icon: DatabaseZap, group: 'Administración' },
  { id: 'calidad', label: 'Auditoría y Calidad', icon: ShieldCheck, group: 'Administración' },
  { id: 'configuracion', label: 'Configuración', icon: Settings, group: 'Administración' }
];

export default function Layout({ activePage, onNavigate, sidebarOpen, setSidebarOpen, children }) {
  const {
    profile, profileMeta, setProfile, canAccess,
    periodos, selectedPeriod, setSelectedPeriod,
    hybridStatus, isOnline, toasts
  } = useApp();

  const groups = ['Principal', 'Análisis', 'Salidas', 'Administración'];
  const currentPeriodObj = periodos.find(p => p.fecha === selectedPeriod);

  const hybridBadge = () => {
    if (hybridStatus?.status === 'remoto' && isOnline) {
      return (
        <span className="badge badge-cyan" title="Conectado y sincronizado con servicio remoto">
          <Cloud size={13} /> Modo Remoto
        </span>
      );
    }
    return (
      <span className="badge badge-green" title="Motor determinista y SQLite ejecutándose localmente">
        <HardDrive size={13} /> Modo Local {isOnline ? '· Híbrido Listo' : '· Sin Internet'}
      </span>
    );
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">SBP</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="brand-title">SBP Analytics</div>
            <div className="brand-sub">Hackathon 2026</div>
          </div>
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {groups.map(group => {
            const items = NAV_ITEMS.filter(item => item.group === group);
            return (
              <div key={group}>
                <div className="nav-section-label">{group}</div>
                {items.map(item => {
                  const Icon = item.icon;
                  const allowed = canAccess(item.id);
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`nav-item ${isActive ? 'active' : ''} ${!allowed ? 'locked' : ''}`}
                      onClick={() => {
                        if (!allowed) return;
                        onNavigate(item.id);
                        setSidebarOpen(false);
                      }}
                      title={allowed ? item.label : `Bloqueado para perfil ${profileMeta.label}`}
                    >
                      <Icon size={17} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {!allowed && <Lock size={13} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={13} color={profileMeta.color} />
            <span>Selector de Perfil Local</span>
          </div>
          <select
            className="select"
            style={{ width: '100%', fontWeight: 600 }}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            aria-label="Selector de perfil"
          >
            {Object.values(PROFILES).map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '7px', lineHeight: 1.35 }}>
            {profileMeta.description}
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Superintendencia de Bancos de Panamá · Motor Determinista AT03
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                {NAV_ITEMS.find(n => n.id === activePage)?.label}
              </div>
            </div>
          </div>

          <div className="topbar-right">
            {periodos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Período:</span>
                <select
                  className="select"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  aria-label="Selector de período"
                >
                  {periodos.map(p => (
                    <option key={p.fecha} value={p.fecha}>
                      {formatPeriod(p.fecha)} ({p.fecha})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hybridBadge()}

            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${profileMeta.color}55`, color: profileMeta.color }}>
              {profileMeta.badge}
            </span>

            <span className="badge badge-slate" title={isOnline ? 'Red disponible' : 'Sin conexión a Internet'}>
              {isOnline ? <Wifi size={12} color="#10b981" /> : <WifiOff size={12} color="#f59e0b" />}
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </header>

        <div className="disclaimer-bar">
          <div>
            <strong>AVISO OBLIGATORIO:</strong> Los datos presentados son ficticios y se utilizan exclusivamente con fines demostrativos. No representan la estructura real del sistema bancario panameño ni constituyen información oficial de la Superintendencia de Bancos de Panamá.
          </div>
          <div className="disclaimer-meta">
            <span>Fuente: {currentPeriodObj?.archivo_origen || 'AT03 Sintético'}</span>
            <span>·</span>
            <span>Corte: {selectedPeriod ? `${formatPeriod(selectedPeriod)} (${selectedPeriod})` : 'Sin corte'}</span>
          </div>
        </div>

        <main className="page-content">
          {children}
        </main>
      </div>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
