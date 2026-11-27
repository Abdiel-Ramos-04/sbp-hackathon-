import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { GitCompare, CheckSquare, Square } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatMoney, formatPeriod, formatPeriodShort, MACROACTIVIDADES } from '../services/api.js';

const BANK_PALETTE = ['#00d2ff', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

export default function ComparadorPage() {
  const { selectedPeriod, periodos, refreshTick, addToast } = useApp();
  const [bancos, setBancos] = useState([]);
  const [selectedBanks, setSelectedBanks] = useState(['101', '102', '103']);
  const [includeAvg, setIncludeAvg] = useState(true);
  const [selectedMacro, setSelectedMacro] = useState('HIPOTECARIO');
  const [compData, setCompData] = useState({});
  const [systemMetrics, setSystemMetrics] = useState({});
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getBancos().then(res => setBancos(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedPeriod || selectedBanks.length === 0) return;
      setLoading(true);
      try {
        const res = await api.comparar(selectedPeriod, selectedBanks);
        if (active) {
          setCompData(res.data || {});
          setSystemMetrics(res.systemMetrics || {});
        }

        // Load monthly evolution across all processed periods for selectedMacro
        const sortedPeriods = [...periodos].map(p => p.fecha).sort();
        const histRows = await Promise.all(
          sortedPeriods.map(p => api.getRankings(p, selectedMacro).then(r => ({ periodo: p, rows: r.data || [] })))
        );
        if (active) {
          const chartRows = histRows.map(({ periodo, rows }) => {
            const point = { name: formatPeriodShort(periodo), periodo };
            for (const code of selectedBanks) {
              const found = rows.find(r => r.codigo_banco === code);
              point[code] = found ? Number((Number(found.saldo_actividad) / 1e6).toFixed(2)) : 0;
            }
            return point;
          });
          setMonthlyHistory(chartRows);
        }
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedPeriod, selectedBanks, selectedMacro, periodos, refreshTick]);

  const toggleBank = (code) => {
    setSelectedBanks(prev => {
      if (prev.includes(code)) {
        if (prev.length <= 2) {
          addToast('Selecciona al menos 2 bancos para comparar', 'info');
          return prev;
        }
        return prev.filter(c => c !== code);
      }
      if (prev.length >= 6) {
        addToast('Máximo 6 bancos simultáneos para mantener legibilidad', 'info');
        return prev;
      }
      return [...prev, code];
    });
  };

  // Build comparison chart by Macroactividad
  const macroChartData = MACROACTIVIDADES.map(macro => {
    const entries = compData[macro] || [];
    const obj = { macro };
    for (const e of entries) {
      if (e?.codigo_banco) {
        obj[e.nombre_banco] = Number((Number(e.saldo_actividad) / 1e6).toFixed(2));
      }
    }
    if (includeAvg && systemMetrics[macro]) {
      obj['Promedio Sistema'] = Number((Number(systemMetrics[macro].promedioSaldo) / 1e6).toFixed(2));
    }
    return obj;
  });

  const activeEntries = compData[selectedMacro] || [];
  const baseEntry = activeEntries[0];
  const avgSaldo = Number(systemMetrics[selectedMacro]?.promedioSaldo || 0);
  const totalMacro = Number(systemMetrics[selectedMacro]?.totalSaldo || 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <GitCompare size={24} color="#00d2ff" /> Comparador Multi-Entidad
          </h1>
          <p className="page-subtitle">
            Contrasta dos o más bancos en saldos, ponderación, posiciones, diferencias absolutas/porcentuales, evolución mensual y subactividades.
          </p>
        </div>

        <button
          className={`btn btn-sm ${includeAvg ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setIncludeAvg(v => !v)}
        >
          {includeAvg ? <CheckSquare size={14} /> : <Square size={14} />}
          Comparar vs Promedio del Sistema
        </button>
      </div>

      {/* Selector de bancos */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div className="card-title">Selecciona Entidades a Comparar ({selectedBanks.length}/6)</div>
          <div className="card-subtitle">El primer banco seleccionado sirve como referencia base para diferencias absolutas y porcentuales</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {bancos.map(b => {
            const active = selectedBanks.includes(b.codigo);
            const idx = selectedBanks.indexOf(b.codigo);
            const color = idx >= 0 ? BANK_PALETTE[idx % BANK_PALETTE.length] : '#64748b';
            return (
              <button
                key={b.codigo}
                onClick={() => toggleBank(b.codigo)}
                className="btn btn-sm"
                style={{
                  background: active ? `${color}22` : 'rgba(11, 19, 36, 0.7)',
                  borderColor: active ? color : 'var(--border-subtle)',
                  color: active ? '#fff' : 'var(--text-secondary)'
                }}
              >
                <span className="mono">{b.codigo}</span> {b.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de Actividad para detalle */}
      <div className="tabs" style={{ marginBottom: '18px' }}>
        {MACROACTIVIDADES.map(m => (
          <button
            key={m}
            className={`tab-btn ${selectedMacro === m ? 'active' : ''}`}
            onClick={() => setSelectedMacro(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: '18px' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Saldo por Macroactividad (B/. Millones) — {formatPeriod(selectedPeriod)}</div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={macroChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="macro" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}M`} />
                <Tooltip
                  contentStyle={{ background: '#0b1324', border: '1px solid rgba(0,210,255,0.35)', borderRadius: '10px', color: '#fff' }}
                  formatter={(v) => `B/. ${v}M`}
                />
                <Legend />
                {activeEntries.map((e, i) => e?.nombre_banco && (
                  <Bar key={e.codigo_banco} dataKey={e.nombre_banco} fill={BANK_PALETTE[i % BANK_PALETTE.length]} radius={[4, 4, 0, 0]} />
                ))}
                {includeAvg && (
                  <Bar dataKey="Promedio Sistema" fill="#64748b" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Evolución Mensual en {selectedMacro} (B/. Millones)</div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}M`} />
                <Tooltip
                  contentStyle={{ background: '#0b1324', border: '1px solid rgba(0,210,255,0.35)', borderRadius: '10px', color: '#fff' }}
                  formatter={(v) => `B/. ${v}M`}
                />
                <Legend />
                {selectedBanks.map((code, i) => {
                  const bankName = bancos.find(b => b.codigo === code)?.nombre || code;
                  return (
                    <Line
                      key={code}
                      type="monotone"
                      dataKey={code}
                      name={bankName}
                      stroke={BANK_PALETTE[i % BANK_PALETTE.length]}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabla Comparativa Detallada */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Comparativa Detallada en {selectedMacro}</div>
            <div className="card-subtitle">
              Total del sistema en {selectedMacro}: {formatMoney(totalMacro)} · Promedio por banco: {formatMoney(avgSaldo)}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Banco</th>
                <th className="text-center">Posición</th>
                <th className="text-right">Saldo {selectedMacro}</th>
                <th className="text-right">Ponderación %</th>
                <th className="text-right">Dif. vs {baseEntry?.nombre_banco || 'Base'}</th>
                <th className="text-right">Dif. % vs Base</th>
                <th className="text-right">Dif. vs Promedio</th>
                <th className="text-right">Ops. Válidas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center">Calculando comparación...</td></tr>
              ) : activeEntries.map((entry, idx) => {
                if (!entry?.codigo_banco) return null;
                const saldo = Number(entry.saldo_actividad);
                const baseSaldo = Number(baseEntry?.saldo_actividad || 0);
                const diffBase = saldo - baseSaldo;
                const diffBasePct = baseSaldo > 0 ? ((diffBase / baseSaldo) * 100).toFixed(2) : '0.00';
                const diffAvg = saldo - avgSaldo;

                return (
                  <tr key={entry.codigo_banco}>
                    <td style={{ fontWeight: 700, color: '#fff' }}>
                      <span className="mono" style={{ color: BANK_PALETTE[idx % BANK_PALETTE.length], marginRight: 6 }}>
                        [{entry.codigo_banco}]
                      </span>
                      {entry.nombre_banco}
                    </td>
                    <td className="text-center">
                      <span className={`rank-pill ${entry.posicion <= 3 ? `rank-${entry.posicion}` : 'rank-other'}`}>
                        #{entry.posicion}
                      </span>
                    </td>
                    <td className="text-right mono" style={{ fontWeight: 700 }}>{formatMoney(saldo)}</td>
                    <td className="text-right mono">{entry.ponderacion_pct}%</td>
                    <td className="text-right mono" style={{ color: idx === 0 ? '#94a3b8' : diffBase >= 0 ? '#34d399' : '#fb7185' }}>
                      {idx === 0 ? 'Base' : `${diffBase >= 0 ? '+' : ''}${formatMoney(diffBase)}`}
                    </td>
                    <td className="text-right mono" style={{ color: idx === 0 ? '#94a3b8' : diffBase >= 0 ? '#34d399' : '#fb7185' }}>
                      {idx === 0 ? '—' : `${diffBase >= 0 ? '+' : ''}${diffBasePct}%`}
                    </td>
                    <td className="text-right mono" style={{ color: diffAvg >= 0 ? '#34d399' : '#fb7185' }}>
                      {diffAvg >= 0 ? '+' : ''}{formatMoney(diffAvg)}
                    </td>
                    <td className="text-right mono">{Number(entry.operaciones_validas).toLocaleString('en-US')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subactivity comparison */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Distribución por Subactividad — {selectedMacro}</div>
        </div>
        <div className="grid-3">
          {activeEntries.map((entry, idx) => (
            <div key={entry.codigo_banco} style={{ background: 'var(--bg-navy)', borderRadius: '12px', padding: '14px', border: `1px solid ${BANK_PALETTE[idx % BANK_PALETTE.length]}44` }}>
              <div style={{ fontWeight: 700, marginBottom: '10px', color: BANK_PALETTE[idx % BANK_PALETTE.length] }}>
                {entry.nombre_banco} (#{entry.posicion})
              </div>
              {(entry.subactividades || []).map(s => (
                <div key={s.subactividad} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{s.subactividad}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{formatMoney(s.saldo)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
