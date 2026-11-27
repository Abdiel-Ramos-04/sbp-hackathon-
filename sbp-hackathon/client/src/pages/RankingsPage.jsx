import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import {
  Trophy, Download, Search, ChevronDown, ChevronUp, Info, FileSpreadsheet, FileText
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatMoney, formatPeriod, MACROACTIVIDADES, MACRO_COLORS } from '../services/api.js';
import { exportExecutivePDF } from '../services/pdfExporter.js';

export default function RankingsPage({ initialRanking = 'HIPOTECARIO' }) {
  const { selectedPeriod, refreshTick, addToast, periodos } = useApp();
  const [selectedRanking, setSelectedRanking] = useState(initialRanking);
  const [rows, setRows] = useState([]);
  const [subRows, setSubRows] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState({ key: 'posicion', dir: 'asc' });
  const [expandedBank, setExpandedBank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialRanking) setSelectedRanking(initialRanking);
  }, [initialRanking]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedPeriod) return;
      setLoading(true);
      try {
        const [rankRes, subRes] = await Promise.all([
          api.getRankings(selectedPeriod, selectedRanking),
          api.getSubactividades(selectedPeriod, selectedRanking)
        ]);
        if (active) {
          setRows(rankRes.data || []);
          setSubRows(subRes.data || []);
          setExpandedBank(null);
        }
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedPeriod, selectedRanking, refreshTick]);

  const maxSaldo = useMemo(() => {
    return Math.max(...rows.map(r => Number(r.saldo_actividad)), 1);
  }, [rows]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter(r => r.nombre_banco.toLowerCase().includes(q) || r.codigo_banco.includes(q))
      : [...rows];

    list.sort((a, b) => {
      const { key, dir } = sortBy;
      let cmp = 0;
      if (key === 'nombre_banco' || key === 'codigo_banco') {
        cmp = String(a[key]).localeCompare(String(b[key]));
      } else {
        cmp = Number(a[key]) - Number(b[key]);
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [rows, search, sortBy]);

  const toggleSort = (key) => {
    setSortBy(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExportPDF = () => {
    const qualityInfo = periodos.find(p => p.fecha === selectedPeriod) || null;
    exportExecutivePDF({
      periodo: selectedPeriod,
      rankings: rows,
      subactividades: subRows,
      qualityInfo,
      selectedRanking
    });
    addToast(`PDF de ${selectedRanking} exportado`, 'success');
  };

  const accent = MACRO_COLORS[selectedRanking] || '#00d2ff';
  const podium = rows.slice(0, 3);
  const totalRankingSaldo = rows.reduce((s, r) => s + Number(r.saldo_actividad), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Trophy size={24} color={accent} />
            Rankings Bancarios Oficiales
          </h1>
          <p className="page-subtitle">
            Las 12 entidades de licencia general ordenadas por saldo descendente (desempate: código ascendente) · Denominador: cartera local válida total (6 actividades).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a
            className="btn btn-secondary btn-sm"
            href={api.exportUrl('rankings', { periodo: selectedPeriod, ranking: selectedRanking })}
            download
          >
            <FileSpreadsheet size={15} /> CSV Rankings
          </a>
          <a
            className="btn btn-secondary btn-sm"
            href={api.exportUrl('subactividades', { periodo: selectedPeriod, ranking: selectedRanking })}
            download
          >
            <Download size={15} /> CSV Subactividades
          </a>
          <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
            <FileText size={15} /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Selector de Macroactividad */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div className="tabs">
          {MACROACTIVIDADES.map(macro => (
            <button
              key={macro}
              className={`tab-btn ${selectedRanking === macro ? 'active' : ''}`}
              onClick={() => setSelectedRanking(macro)}
            >
              {macro}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            className="input"
            style={{ paddingLeft: '34px', width: '240px' }}
            placeholder="Filtrar banco o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {selectedRanking === 'CONSUMO' && (
        <div
          className="card"
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderColor: 'rgba(236, 72, 153, 0.35)',
            background: 'rgba(236, 72, 153, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12.5px'
          }}
        >
          <Info size={18} color="#f472b6" style={{ flexShrink: 0 }} />
          <div>
            <strong>Regla especial SB21 aplicada en CONSUMO:</strong> Las operaciones con CINU de Crédito personal (`K.64.649.6492.64921`) y `Facilidad_Crediticia = 07` fueron reclasificadas a la subactividad <strong>Tarjeta</strong> y descontadas de <strong>Credito personal</strong>, manteniendo invariable el saldo total de CONSUMO.
          </div>
        </div>
      )}

      {/* Podio Top 3 */}
      {!loading && podium.length >= 3 && (
        <div className="grid-3" style={{ marginBottom: '18px' }}>
          {podium.map((b, i) => (
            <div
              key={b.codigo_banco}
              className="kpi-card"
              style={{ borderColor: i === 0 ? 'rgba(251,191,36,0.45)' : undefined }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className={`rank-pill rank-${i + 1}`}>#{b.posicion}</span>
                <span className="badge badge-slate mono">Cód. {b.codigo_banco}</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{b.nombre_banco}</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: accent, marginTop: '4px' }}>
                {formatMoney(b.saldo_actividad)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Pond: <strong className="mono">{b.ponderacion_pct}%</strong></span>
                <span>{Number(b.operaciones_validas).toLocaleString('en-US')} ops.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bar Chart */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Comparativa Visual — {selectedRanking} ({formatPeriod(selectedPeriod)})</div>
            <div className="card-subtitle">Saldo total agregado en la actividad: {formatMoney(totalRankingSaldo)}</div>
          </div>
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 5, right: 20, left: 10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis
                dataKey="nombre_banco"
                stroke="#94a3b8"
                fontSize={11}
                angle={-20}
                textAnchor="end"
                interval={0}
                height={55}
              />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
              <Tooltip
                contentStyle={{ background: '#0b1324', border: `1px solid ${accent}`, borderRadius: '10px', color: '#fff' }}
                formatter={(v) => [formatMoney(v), `Saldo ${selectedRanking}`]}
              />
              <Bar dataKey={(r) => Number(r.saldo_actividad)} radius={[6, 6, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={r.codigo_banco} fill={i < 3 ? accent : '#3b82f688'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Main Dynamic Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Tabla Completa de Posiciones (12 Entidades)</div>
            <div className="card-subtitle">Haz clic en una fila para desplegar el desglose exacto por subactividad</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('posicion')}>Pos.</th>
                <th onClick={() => toggleSort('codigo_banco')}>Código</th>
                <th onClick={() => toggleSort('nombre_banco')}>Banco</th>
                <th className="text-right" onClick={() => toggleSort('saldo_actividad')}>Saldo Actividad</th>
                <th style={{ minWidth: 120 }}>Participación</th>
                <th className="text-right" onClick={() => toggleSort('total_cartera_local_valida')}>Cartera Local Válida</th>
                <th className="text-right" onClick={() => toggleSort('ponderacion_pct')}>Ponderación %</th>
                <th className="text-right" onClick={() => toggleSort('operaciones_validas')}>Ops. Válidas</th>
                <th className="text-center">Subact.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="text-center">Cargando...</td></tr>
              ) : filteredAndSorted.map(row => {
                const isExpanded = expandedBank === row.codigo_banco;
                const bankSubs = subRows.filter(s => s.codigo_banco === row.codigo_banco);
                const barWidth = (Number(row.saldo_actividad) / maxSaldo) * 100;
                const rowClass = row.posicion <= 3 ? `top-${row.posicion}` : '';

                return (
                  <React.Fragment key={row.codigo_banco}>
                    <tr
                      className={rowClass}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedBank(isExpanded ? null : row.codigo_banco)}
                    >
                      <td>
                        <span className={`rank-pill ${row.posicion <= 3 ? `rank-${row.posicion}` : 'rank-other'}`}>
                          {row.posicion}
                        </span>
                      </td>
                      <td className="mono">{row.codigo_banco}</td>
                      <td style={{ fontWeight: 600, color: '#fff' }}>{row.nombre_banco}</td>
                      <td className="text-right mono" style={{ fontWeight: 700, color: accent }}>
                        {formatMoney(row.saldo_actividad)}
                      </td>
                      <td>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${barWidth}%`, background: accent }} />
                        </div>
                      </td>
                      <td className="text-right mono">{formatMoney(row.total_cartera_local_valida)}</td>
                      <td className="text-right mono" style={{ fontWeight: 600 }}>{row.ponderacion_pct}%</td>
                      <td className="text-right mono">{Number(row.operaciones_validas).toLocaleString('en-US')}</td>
                      <td className="text-center">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan="9" style={{ background: 'rgba(6, 11, 22, 0.75)', padding: '14px 20px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '10px' }}>
                            Desglose por Subactividad — {row.nombre_banco} ({selectedRanking})
                          </div>
                          {bankSubs.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin operaciones en esta actividad.</div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                              {bankSubs.map(sub => {
                                const subShare = Number(row.saldo_actividad) > 0
                                  ? ((Number(sub.saldo) / Number(row.saldo_actividad)) * 100).toFixed(2)
                                  : '0.00';
                                return (
                                  <div
                                    key={sub.subactividad}
                                    style={{
                                      background: 'var(--bg-navy)',
                                      border: '1px solid var(--border-subtle)',
                                      borderRadius: '10px',
                                      padding: '10px 12px'
                                    }}
                                  >
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{sub.subactividad}</div>
                                    <div className="mono" style={{ fontSize: '14px', fontWeight: 700, color: accent, margin: '4px 0' }}>
                                      {formatMoney(sub.saldo)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>{subShare}% del ranking</span>
                                      <span>{sub.operaciones} ops.</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
