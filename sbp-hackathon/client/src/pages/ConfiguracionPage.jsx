import React, { useEffect, useState } from 'react';
import {
  Settings, Save, Cloud, HardDrive, RefreshCw, Database, BookOpen, Shield
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../services/api.js';

export default function ConfiguracionPage() {
  const { hybridStatus, triggerRefresh, addToast } = useApp();
  const [activeTab, setActiveTab] = useState('umbrales');
  const [configMap, setConfigMap] = useState({});
  const [backups, setBackups] = useState([]);
  const [ddl, setDdl] = useState('');
  const [conflictStrategy, setConflictStrategy] = useState('local_wins');
  const [cinu, setCinu] = useState([]);
  const [sb21, setSb21] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [diccionario, setDiccionario] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try {
      const [cfg, bkp, ddlRes, cinuRes, sb21Res, bncRes, dictRes] = await Promise.all([
        api.getConfiguracion(),
        api.listBackups(),
        api.getPostgresDDL(),
        api.getCatalogoCinu(),
        api.getCatalogoSb21(),
        api.getBancos(),
        api.getDiccionario()
      ]);
      const map = Object.fromEntries((cfg.data || []).map(c => [c.clave, c.valor]));
      setConfigMap(map);
      setBackups(bkp.data || []);
      setDdl(ddlRes.data || '');
      setCinu(cinuRes.data || []);
      setSb21(sb21Res.data || []);
      setBancos(bncRes.data || []);
      setDiccionario(dictRes.data || []);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const saveConfigKey = async (clave, valor) => {
    setSaving(true);
    try {
      await api.updateConfiguracion(clave, valor);
      setConfigMap(prev => ({ ...prev, [clave]: String(valor) }));
      addToast(`Parámetro "${clave}" actualizado`, 'success');
      triggerRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    try {
      const res = await api.createBackup();
      addToast(`Respaldo local creado: ${res.data.filename}`, 'success');
      loadAll();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleSync = async () => {
    try {
      const res = await api.syncRemote(configMap.sync_autorizada === '1', conflictStrategy);
      if (res.data?.success) {
        addToast('Sincronización remota completada', 'success');
      } else {
        addToast(res.data?.error || 'Sincronización no ejecutada', 'info');
      }
      triggerRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={24} color="#00d2ff" /> Configuración, Arquitectura Híbrida y Catálogos
          </h1>
          <p className="page-subtitle">
            Administra umbrales de alertas configurables, sincronización híbrida local/remota, respaldos SQLite y catálogos oficiales congelados.
          </p>
        </div>

        <div className="tabs">
          <button className={`tab-btn ${activeTab === 'umbrales' ? 'active' : ''}`} onClick={() => setActiveTab('umbrales')}>
            Umbrales de Alertas
          </button>
          <button className={`tab-btn ${activeTab === 'hibrido' ? 'active' : ''}`} onClick={() => setActiveTab('hibrido')}>
            Híbrido y Respaldos
          </button>
          <button className={`tab-btn ${activeTab === 'catalogos' ? 'active' : ''}`} onClick={() => setActiveTab('catalogos')}>
            Catálogos Oficiales
          </button>
          <button className={`tab-btn ${activeTab === 'diccionario' ? 'active' : ''}`} onClick={() => setActiveTab('diccionario')}>
            Diccionario AT03 (61)
          </button>
        </div>
      </div>

      {activeTab === 'umbrales' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Reglas Configurables para Movimientos Significativos</div>
            <div className="card-subtitle">Se aplican dinámicamente al calcular explicaciones automáticas y alertas</div>
          </div>
          <div className="grid-3">
            <div style={{ background: 'var(--bg-navy)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Mínimo Cambio de Posición</label>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Número mínimo de puestos que debe subir o bajar un banco para generar alerta.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  min="1"
                  max="11"
                  className="input"
                  style={{ width: '90px' }}
                  value={configMap.umbral_cambio_posicion || '2'}
                  onChange={(e) => setConfigMap(prev => ({ ...prev, umbral_cambio_posicion: e.target.value }))}
                />
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveConfigKey('umbral_cambio_posicion', configMap.umbral_cambio_posicion)}>
                  <Save size={14} /> Guardar
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-navy)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Umbral Variación de Saldo (%)</label>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Porcentaje mínimo de crecimiento o caída mensual para señalarse como relevante.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="input"
                  style={{ width: '90px' }}
                  value={configMap.umbral_variacion_saldo_pct || '10'}
                  onChange={(e) => setConfigMap(prev => ({ ...prev, umbral_variacion_saldo_pct: e.target.value }))}
                />
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveConfigKey('umbral_variacion_saldo_pct', configMap.umbral_variacion_saldo_pct)}>
                  <Save size={14} /> Guardar
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-navy)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Detectar Cambios de Líder</label>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Alertar automáticamente cuando una entidad alcanza el puesto #1 en un ranking.
              </p>
              <select
                className="select"
                value={configMap.detectar_cambio_lider || '1'}
                onChange={(e) => saveConfigKey('detectar_cambio_lider', e.target.value)}
              >
                <option value="1">Habilitado (Sí)</option>
                <option value="0">Deshabilitado (No)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hibrido' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title"><Cloud size={17} color="#00d2ff" /> Estado de Modalidad Híbrida (Local + Remoto)</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Motor Financiero Local:</span>
                  <span className="badge badge-green"><HardDrive size={12} /> Activo Offline</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Persistencia SQLite:</span>
                  <span className="badge badge-green">Conectado ({hybridStatus?.totalPeriodsLocal || 0} períodos)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>PostgreSQL Remoto:</span>
                  <span className={`badge ${hybridStatus?.postgresConfigured ? 'badge-cyan' : 'badge-slate'}`}>
                    {hybridStatus?.postgresConfigured ? 'Configurado via ENV' : 'Listo (Sin DATABASE_URL)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Autorización de Envío Externo:</span>
                  <select
                    className="select"
                    value={configMap.sync_autorizada || '0'}
                    onChange={(e) => saveConfigKey('sync_autorizada', e.target.value)}
                  >
                    <option value="0">Bloqueado (Solo Local)</option>
                    <option value="1">Autorizado por Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Resolución de Conflictos:</span>
                  <select className="select" value={conflictStrategy} onChange={(e) => setConflictStrategy(e.target.value)}>
                    <option value="local_wins">Prioridad Local</option>
                    <option value="remote_wins">Prioridad Remota</option>
                    <option value="newest_wins">Corte más Reciente</option>
                  </select>
                </div>
                <div style={{ paddingTop: '10px', display: 'flex', gap: '10px' }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSync}>
                    <RefreshCw size={14} /> Intentar Sincronización Controlada
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title"><Database size={17} color="#10b981" /> Copias de Seguridad Locales</div>
                <button className="btn btn-secondary btn-sm" onClick={handleBackup}>
                  Crear Respaldo JSON
                </button>
              </div>
              {backups.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  No hay respaldos manuales creados aún. Pulsa "Crear Respaldo JSON" para guardar una instantánea de SQLite.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {backups.map(b => (
                    <div key={b.filename} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-navy)', borderRadius: '8px', fontSize: '12px' }}>
                      <span className="mono">{b.filename}</span>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>{(b.sizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><Shield size={16} color="#00d2ff" /> Esquema PostgreSQL Preparado (Modalidad B Remota)</div>
            </div>
            <pre className="mono" style={{ background: '#050912', padding: '14px', borderRadius: '10px', fontSize: '11.5px', color: '#93c5fd', overflowX: 'auto' }}>
              {ddl}
            </pre>
          </div>
        </div>
      )}

      {activeTab === 'catalogos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Bancos Ficticios ({bancos.length})</div>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead><tr><th>Código</th><th>Nombre</th><th>Licencia</th></tr></thead>
                  <tbody>
                    {bancos.map(b => (
                      <tr key={b.codigo}><td className="mono">{b.codigo}</td><td style={{ fontWeight: 600 }}>{b.nombre}</td><td>{b.licencia}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Tabla SB21 Simplificada ({sb21.length})</div>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead><tr><th>Código (Texto)</th><th>Descripción</th><th>Uso en Reto</th></tr></thead>
                  <tbody>
                    {sb21.map(s => (
                      <tr key={s.codigo}><td className="mono" style={{ color: '#00d2ff', fontWeight: 700 }}>{s.codigo}</td><td>{s.Descripcion}</td><td>{s.Uso_en_reto}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Catálogo CINU / SB109 Congelado ({cinu.length} Actividades)</div>
            </div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr><th>Código CINU</th><th>Descripción</th><th>Macroactividad</th><th>Subactividad</th><th>SB08 Ref.</th></tr>
                </thead>
                <tbody>
                  {cinu.map(c => (
                    <tr key={c.codigo}>
                      <td className="mono" style={{ color: '#00d2ff' }}>{c.codigo}</td>
                      <td>{c.Descripcion}</td>
                      <td><span className="badge badge-cyan">{c.Macroactividad_Reto}</span></td>
                      <td>{c.Subactividad_Reto}</td>
                      <td className="mono">{c.Codigo_SB08_Referencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'diccionario' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><BookOpen size={17} color="#00d2ff" /> Diccionario Oficial AT03 ({diccionario.length} Campos)</div>
          </div>
          <div className="table-wrap" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '12px' }}>
              <thead><tr><th>#</th><th>Campo</th><th>Tipo</th><th>Descripción</th><th>Regla Clave</th></tr></thead>
              <tbody>
                {diccionario.map((d, idx) => (
                  <tr key={d.Campo}>
                    <td className="mono">{idx + 1}</td>
                    <td className="mono" style={{ fontWeight: 700, color: '#00d2ff' }}>{d.Campo}</td>
                    <td><span className="badge badge-slate">{d.Tipo}</span></td>
                    <td>{d.Descripcion_reto}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{d.Regla_clave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
