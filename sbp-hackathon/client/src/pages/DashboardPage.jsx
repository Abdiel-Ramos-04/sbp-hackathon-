import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import {
  Wallet, Building2, FileCheck2, Layers, ShieldCheck,
  Trophy, ArrowUpRight, ArrowDownRight, Sparkles, ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatMoney, formatPeriod, formatPeriodShort, MACROACTIVIDADES, MACRO_COLORS } from '../services/api.js';
import { AnimatedNumber } from '../components/AnimatedNumber.jsx';

export default function DashboardPage({ onNavigate, onSelectRanking }) {
  const { selectedPeriod, refreshTick } = useApp();
  const [data, setData] = useState(null);
  const [allRankings, setAllRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const dashRes = await api.getDashboard(selectedPeriod);
        const rankRes = selectedPeriod
          ? await api.getRankings(selectedPeriod)
          : { data: [] };
        if (active) {
          setData(dashRes.data);
          setAllRankings(rankRes.data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedPeriod, refreshTick]);

  if (loading) {
    return <div className="card">Cargando inteligencia bancaria y métricas del período...</div>;
  }

  if (!data) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <h3>No hay períodos procesados todavía</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '10px 0 20px' }}>
          Ve a Gestión de Datos para cargar un archivo AT03 o inicializar los tres cortes oficiales.
        </p>
        <button className="btn btn-primary" onClick={() => onNavigate('datos')}>
          Ir a Gestión de Datos
        </button>
      </div>
    );
  }

  const periodInfo = data.periodInfo || {};
  const validRate = periodInfo.total_filas > 0
    ? ((periodInfo.universo_local_valido / periodInfo.total_filas) * 100).toFixed(2)
    : '0.00';

  const evolutionData = (data.carteraEvolution || []).map(item => ({
    name: formatPeriodShort(item.periodo),
    periodo: item.periodo,
    carteraM: Number((item.totalCartera / 1e6).toFixed(2)),
    totalCartera: item.totalCartera,
    operaciones: item.universoValido
  }));

  const distData = (data.distByActivity || []).map(d => ({
    name: d.ranking,
    value: Number(d.total_saldo),
    ops: d.total_ops,
    color: MACRO_COLORS[d.ranking] || '#00d2ff'
  }));

  // Build heatmap matrix: 12 banks x 6 macroactividades (ponderacion_pct)
  const banksMap = new Map();
  for (const r of allRankings) {
    if (!banksMap.has(r.codigo_banco)) {
      banksMap.set(r.codigo_banco, { codigo: r.codigo_banco, nombre: r.nombre_banco, macros: {} });
    }
    banksMap.get(r.codigo_banco).macros[r.ranking] = {
      pond: Number(r.ponderacion_pct),
      pos: r.posicion,
      saldo: r.saldo_actividad
    };
  }
  const heatmapBanks = [...banksMap.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));

  const topMovements = (data.recentMovements || [])
    .filter(m => m.cambio_posicion !== 0)
    .sort((a, b) => Math.abs(b.cambio_posicion) - Math.abs(a.cambio_posicion))
    .slice(0, 6);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Centro de Inteligencia Bancaria
            <span className="badge badge-cyan">{formatPeriod(data.periodo)}</span>
          </h1>
          <p className="page-subtitle">
            Resumen ejecutivo determinista del universo local válido, líderes por actividad, evolución de cartera y movimientos destacados.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => onNavigate('rankings')}>
            <Trophy size={15} /> Explorar 6 Rankings
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('reportes')}>
            Generar Reporte Ejecutivo
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Total Cartera Local Válida</span>
            <Wallet size={16} color="#00d2ff" />
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={data.totalCartera} formatter={(v) => formatMoney(v, true)} />
          </div>
          <div className="kpi-foot mono">{formatMoney(data.totalCartera)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Entidades Analizadas</span>
            <Building2 size={16} color="#3b82f6" />
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={data.totalBancos} formatter={(v) => Math.round(v)} />
          </div>
          <div className="kpi-foot">Bancos de Licencia General (101–112)</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Operaciones Válidas</span>
            <FileCheck2 size={16} color="#10b981" />
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={data.totalOperaciones} formatter={(v) => Math.round(v).toLocaleString('en-US')} />
          </div>
          <div className="kpi-foot">
            De {Number(periodInfo.total_filas || 0).toLocaleString('en-US')} filas leídas ({validRate}% válido)
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Macroactividades & Calidad</span>
            <Layers size={16} color="#f59e0b" />
          </div>
          <div className="kpi-value">
            {data.totalMacroactividades} Rankings
          </div>
          <div className="kpi-foot">
            <span className={`badge ${periodInfo.reconciliacion_ok ? 'badge-green' : 'badge-red'}`}>
              <ShieldCheck size={12} />
              {periodInfo.reconciliacion_ok ? 'Reconciliación 100% Cuadrada' : 'Alerta Reconciliación'}
            </span>
          </div>
        </div>
      </div>

      {/* Líderes por Ranking */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              <Trophy size={17} color="#fbbf24" /> Bancos Líderes por Macroactividad ({formatPeriod(data.periodo)})
            </div>
            <div className="card-subtitle">Haz clic en cualquier actividad para abrir su ranking completo y desglose por subactividad</div>
          </div>
        </div>
        <div className="grid-3">
          {(data.leaders || []).map(leader => (
            <button
              key={leader.ranking}
              onClick={() => {
                onSelectRanking(leader.ranking);
                onNavigate('rankings');
              }}
              style={{
                background: 'rgba(11, 19, 36, 0.85)',
                border: `1px solid ${MACRO_COLORS[leader.ranking]}44`,
                borderRadius: '14px',
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                color: '#fff',
                transition: 'all 0.18s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge" style={{ background: `${MACRO_COLORS[leader.ranking]}22`, color: MACRO_COLORS[leader.ranking], border: `1px solid ${MACRO_COLORS[leader.ranking]}55` }}>
                  {leader.ranking}
                </span>
                <ChevronRight size={15} color="#94a3b8" />
              </div>
              <div style={{ fontSize: '15.5px', fontWeight: 700, marginTop: '2px' }}>
                #1 {leader.nombre_banco}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <span className="mono" style={{ color: '#fff', fontWeight: 600 }}>{formatMoney(leader.saldo_actividad)}</span>
                <span className="mono">{leader.ponderacion_pct}% pond.</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid-sidebar-layout" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Evolución Mensual de Cartera Local Válida</div>
              <div className="card-subtitle">Saldo total agregado en millones (B/. M) entre los períodos procesados</div>
            </div>
          </div>
          <div style={{ height: 270 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolutionData}>
                <defs>
                  <linearGradient id="carteraGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d2ff" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#00d2ff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v}M`} />
                <Tooltip
                  contentStyle={{ background: '#0b1324', border: '1px solid rgba(0,210,255,0.35)', borderRadius: '10px', color: '#fff' }}
                  formatter={(value, name, props) => [formatMoney(props.payload.totalCartera), 'Cartera Local Válida']}
                />
                <Area type="monotone" dataKey="carteraM" stroke="#00d2ff" strokeWidth={2.5} fill="url(#carteraGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Distribución por Actividad Económica</div>
              <div className="card-subtitle">Participación en la cartera local válida ({formatPeriodShort(data.periodo)})</div>
            </div>
          </div>
          <div style={{ height: 270, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie
                  data={distData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={86}
                  paddingAngle={3}
                >
                  {distData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0b1324', border: '1px solid rgba(0,210,255,0.35)', borderRadius: '10px', color: '#fff' }}
                  formatter={(v) => formatMoney(v)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '6px' }}>
              {distData.map(item => {
                const pct = data.totalCartera > 0 ? ((item.value / data.totalCartera) * 100).toFixed(1) : '0.0';
                return (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: item.color }} />
                      <span>{item.name}</span>
                    </span>
                    <span className="mono" style={{ fontWeight: 600 }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Explicaciones Automáticas & Movimientos + Heatmap */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Sparkles size={16} color="#00d2ff" /> Alertas y Explicaciones Automáticas
              </div>
              <div className="card-subtitle">
                {data.prevPeriod
                  ? `Cambios relevantes detectados entre ${formatPeriodShort(data.prevPeriod)} y ${formatPeriodShort(data.periodo)}`
                  : 'Primer período registrado (carga un corte posterior para detectar movimientos)'}
              </div>
            </div>
          </div>

          {data.explanations && data.explanations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {data.explanations.slice(0, 6).map((exp, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '11px',
                    background: 'rgba(11, 19, 36, 0.85)',
                    borderLeft: `3px solid ${exp.cambioPosicion > 0 ? '#10b981' : exp.cambioPosicion < 0 ? '#f43f5e' : '#00d2ff'}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11.5px' }}>
                    <span className="badge badge-cyan">{exp.ranking}</span>
                    <span className="mono" style={{ color: exp.cambioPosicion > 0 ? '#34d399' : '#fb7185', fontWeight: 700 }}>
                      {exp.cambioPosicion > 0 ? `+${exp.cambioPosicion}` : exp.cambioPosicion} pos.
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{exp.explicacion}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '16px 0' }}>
              {topMovements.length > 0 ? 'Movimientos dentro de umbrales normales:' : 'No hay movimientos de posición para mostrar en este corte.'}
              {topMovements.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span><strong>{m.nombre_banco}</strong> ({m.ranking})</span>
                  <span className={`badge ${m.cambio_posicion > 0 ? 'badge-green' : 'badge-red'}`}>
                    {m.cambio_posicion > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    #{m.posicion_anterior} → #{m.posicion_actual}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Heatmap Concentración */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Mapa de Calor: Ponderación por Banco y Actividad (%)</div>
              <div className="card-subtitle">Intensidad de concentración sobre la cartera local válida de cada entidad</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: '11.5px' }}>
              <thead>
                <tr>
                  <th>Banco</th>
                  {MACROACTIVIDADES.map(m => (
                    <th key={m} className="text-center">{m.slice(0, 5)}.</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapBanks.map(b => (
                  <tr key={b.codigo}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{b.nombre}</td>
                    {MACROACTIVIDADES.map(m => {
                      const info = b.macros[m] || { pond: 0, pos: 12 };
                      const intensity = Math.min(info.pond / 35, 1);
                      return (
                        <td
                          key={m}
                          className="text-center mono"
                          title={`${b.nombre} · ${m}: ${info.pond.toFixed(2)}% (Posición #${info.pos})`}
                          style={{
                            background: `rgba(0, 210, 255, ${(intensity * 0.48).toFixed(2)})`,
                            color: intensity > 0.45 ? '#fff' : 'var(--text-secondary)',
                            fontWeight: intensity > 0.45 ? 700 : 500
                          }}
                        >
                          {info.pond.toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
