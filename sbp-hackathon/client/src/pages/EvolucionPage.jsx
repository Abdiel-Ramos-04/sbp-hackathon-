import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Award, Download, Sparkles
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatMoney, formatPeriod, formatPeriodShort, MACROACTIVIDADES } from '../services/api.js';

const LINE_COLORS = [
  '#00d2ff', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6',
  '#14b8a6', '#f97316', '#a855f7', '#22c55e', '#eab308', '#ef4444'
];

export default function EvolucionPage() {
  const { periodos, refreshTick, addToast } = useApp();
  const sortedPeriods = [...periodos].map(p => p.fecha).sort();

  const [periodoAnterior, setPeriodoAnterior] = useState('');
  const [periodoActual, setPeriodoActual] = useState('');
  const [selectedMacro, setSelectedMacro] = useState('HIPOTECARIO');
  const [filterTipo, setFilterTipo] = useState('TODOS');
  const [movements, setMovements] = useState([]);
  const [explanations, setExplanations] = useState([]);
  const [bumpData, setBumpData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sortedPeriods.length >= 2) {
      setPeriodoAnterior(prev => prev && sortedPeriods.includes(prev) ? prev : sortedPeriods[sortedPeriods.length - 2]);
      setPeriodoActual(prev => prev && sortedPeriods.includes(prev) ? prev : sortedPeriods[sortedPeriods.length - 1]);
    }
  }, [periodos]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!periodoAnterior || !periodoActual) return;
      setLoading(true);
      try {
        const [movRes, expRes] = await Promise.all([
          api.getMovimientos(periodoAnterior, periodoActual, selectedMacro),
          api.getExplicaciones(periodoAnterior, periodoActual, selectedMacro)
        ]);
        if (active) {
          setMovements(movRes.data || []);
          setExplanations(expRes.data || []);
        }

        // Load positions across all periods for the selected ranking
        const allRankings = await Promise.all(
          sortedPeriods.map(p => api.getRankings(p, selectedMacro).then(r => ({ periodo: p, rows: r.data || [] })))
        );
        if (active) {
          const chartPoints = allRankings.map(({ periodo, rows }) => {
            const pt = { name: formatPeriodShort(periodo), periodo };
            for (const r of rows) {
              pt[r.nombre_banco] = r.posicion;
            }
            return pt;
          });
          setBumpData(chartPoints);
        }
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [periodoAnterior, periodoActual, selectedMacro, refreshTick]);

  const filteredMovements = movements.filter(m =>
    filterTipo === 'TODOS' ? true : m.tipo === filterTipo
  );

  const leaderChange = movements.find(m => m.posicion_actual === 1 && m.posicion_anterior !== 1);
  const currentLeader = movements.find(m => m.posicion_actual === 1);
  const bankNames = movements.map(m => m.nombre_banco);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <TrendingUp size={24} color="#00d2ff" /> Evolución Histórica y Movimientos
          </h1>
          <p className="page-subtitle">
            Línea temporal de los cortes procesados, cambios de posición (`Cambio_Posicion = Pos_anterior − Pos_actual`), liderazgo y variaciones de saldo.
          </p>
        </div>

        {periodoAnterior && periodoActual && (
          <a
            className="btn btn-secondary btn-sm"
            href={api.exportUrl('movimientos', { periodoAnterior, periodoActual, ranking: selectedMacro })}
            download
          >
            <Download size={15} /> Exportar Movimientos CSV
          </a>
        )}
      </div>

      {/* Línea temporal de períodos */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Línea Temporal de Períodos Procesados</div>
            <div className="card-subtitle">Selecciona dos cortes para comparar (consecutivos o acumulado inicial → final)</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="select" value={periodoAnterior} onChange={(e) => setPeriodoAnterior(e.target.value)}>
              {sortedPeriods.map(p => <option key={p} value={p}>Base: {formatPeriod(p)}</option>)}
            </select>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>→</span>
            <select className="select" value={periodoActual} onChange={(e) => setPeriodoActual(e.target.value)}>
              {sortedPeriods.map(p => <option key={p} value={p}>Actual: {formatPeriod(p)}</option>)}
            </select>
            {sortedPeriods.length >= 3 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setPeriodoAnterior(sortedPeriods[0]);
                  setPeriodoActual(sortedPeriods[sortedPeriods.length - 1]);
                }}
              >
                Comparar {formatPeriodShort(sortedPeriods[0])} → {formatPeriodShort(sortedPeriods[sortedPeriods.length - 1])}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[...periodos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((p, idx) => (
            <div
              key={p.fecha}
              style={{
                flex: '1 1 220px',
                background: 'var(--bg-navy)',
                border: (p.fecha === periodoAnterior || p.fecha === periodoActual) ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="badge badge-cyan">Corte #{idx + 1}</span>
                <span className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{p.fecha}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>{formatPeriod(p.fecha)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Universo válido: <strong className="mono" style={{ color: '#fff' }}>{p.universo_local_valido.toLocaleString('en-US')}</strong> ops.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Macroactividad & Tipo filtro */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div className="tabs">
          {MACROACTIVIDADES.map(m => (
            <button key={m} className={`tab-btn ${selectedMacro === m ? 'active' : ''}`} onClick={() => setSelectedMacro(m)}>
              {m}
            </button>
          ))}
        </div>

        <div className="tabs">
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'SUBE', label: 'Suben' },
            { id: 'BAJA', label: 'Bajan' },
            { id: 'SIN_CAMBIO', label: 'Se mantienen' }
          ].map(f => (
            <button key={f.id} className={`tab-btn ${filterTipo === f.id ? 'active' : ''}`} onClick={() => setFilterTipo(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cambio de liderazgo & Explicaciones */}
      <div className="grid-2" style={{ marginBottom: '18px' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Award size={17} color="#fbbf24" /> Liderazgo en {selectedMacro}
            </div>
          </div>
          {leaderChange ? (
            <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
              <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>Cambio de Liderazgo Detectado</div>
              <div>
                <strong>{leaderChange.nombre_banco}</strong> ascendió del puesto #{leaderChange.posicion_anterior} al <strong>#1</strong> con un crecimiento de saldo del <span className="mono">{leaderChange.variacion_saldo_pct}%</span>.
              </div>
            </div>
          ) : currentLeader ? (
            <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>Liderazgo Sostenido</div>
              <div>
                <strong>{currentLeader.nombre_banco}</strong> mantiene el puesto <strong>#1</strong> en {selectedMacro} con saldo de <span className="mono">{formatMoney(currentLeader.saldo_actual)}</span> ({currentLeader.variacion_saldo_pct}%).
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Selecciona dos períodos distintos para analizar cambios.</div>
          )}

          {explanations.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} /> Explicaciones Automáticas ({selectedMacro})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {explanations.map((exp, i) => (
                  <div key={i} style={{ fontSize: '12.5px', color: 'var(--text-secondary)', padding: '8px 10px', background: 'var(--bg-navy)', borderRadius: '8px' }}>
                    {exp.explicacion}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gráfico de Evolución de Posiciones */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Trayectoria de Posiciones ({selectedMacro})</div>
              <div className="card-subtitle">Posición #1 arriba hasta #12 abajo en los tres cortes</div>
            </div>
          </div>
          <div style={{ height: 270 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bumpData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis reversed domain={[1, 12]} ticks={[1, 3, 6, 9, 12]} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#0b1324', border: '1px solid rgba(0,210,255,0.35)', borderRadius: '10px', color: '#fff' }}
                  formatter={(v) => `#${v}`}
                />
                <Legend wrapperStyle={{ fontSize: '10.5px' }} />
                {bankNames.slice(0, 6).map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i]} strokeWidth={2.2} dot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabla de Movimientos */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            Matriz Comparativa: {formatPeriod(periodoAnterior)} → {formatPeriod(periodoActual)} ({selectedMacro})
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Banco</th>
                <th className="text-center">Pos. Ant.</th>
                <th className="text-center">Pos. Act.</th>
                <th className="text-center">Cambio Pos.</th>
                <th className="text-right">Saldo Anterior</th>
                <th className="text-right">Saldo Actual</th>
                <th className="text-right">Var. Saldo</th>
                <th className="text-right">Var. %</th>
                <th className="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="text-center">Calculando variaciones...</td></tr>
              ) : filteredMovements.map(m => {
                const posDelta = m.cambio_posicion || 0;
                const saldoDelta = Number(m.variacion_saldo || 0);
                return (
                  <tr key={m.codigo_banco}>
                    <td style={{ fontWeight: 600, color: '#fff' }}>
                      <span className="mono" style={{ color: 'var(--text-muted)', marginRight: 6 }}>{m.codigo_banco}</span>
                      {m.nombre_banco}
                    </td>
                    <td className="text-center mono">#{m.posicion_anterior}</td>
                    <td className="text-center mono" style={{ fontWeight: 700 }}>#{m.posicion_actual}</td>
                    <td className="text-center">
                      {posDelta > 0 && (
                        <span className="badge badge-green mono"><ArrowUpRight size={13} /> +{posDelta}</span>
                      )}
                      {posDelta < 0 && (
                        <span className="badge badge-red mono"><ArrowDownRight size={13} /> {posDelta}</span>
                      )}
                      {posDelta === 0 && (
                        <span className="badge badge-slate mono"><Minus size={12} /> 0</span>
                      )}
                    </td>
                    <td className="text-right mono">{formatMoney(m.saldo_anterior)}</td>
                    <td className="text-right mono" style={{ fontWeight: 700 }}>{formatMoney(m.saldo_actual)}</td>
                    <td className="text-right mono" style={{ color: saldoDelta >= 0 ? '#34d399' : '#fb7185' }}>
                      {saldoDelta >= 0 ? '+' : ''}{formatMoney(saldoDelta)}
                    </td>
                    <td className="text-right mono" style={{ color: saldoDelta >= 0 ? '#34d399' : '#fb7185', fontWeight: 600 }}>
                      {saldoDelta >= 0 ? '+' : ''}{m.variacion_saldo_pct}%
                    </td>
                    <td className="text-center">
                      <span className={`badge ${m.tipo === 'SUBE' ? 'badge-green' : m.tipo === 'BAJA' ? 'badge-red' : 'badge-slate'}`}>
                        {m.tipo.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
