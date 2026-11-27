import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { Bot, Send, Sparkles, ShieldAlert, Activity, PieChart as PieIcon, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatMoney, formatPeriod } from '../services/api.js';

const PRESET_QUESTIONS = [
  '¿Qué banco lidera el ranking de INDUSTRIA en septiembre?',
  '¿Qué entidades tuvieron los mayores cambios entre agosto y septiembre?',
  '¿Cómo evolucionó la cartera hipotecaria de Banco Istmo?',
  'Genera un resumen de los movimientos más importantes del último período',
  '¿Qué bancos presentan mayor concentración de cartera en una sola actividad?',
  '¿Cuál es la morosidad del sistema y los bancos con mayor saldo moroso?'
];

const REG_LABELS = {
  '01': '01 Normal',
  '02': '02 Mención Especial',
  '03': '03 Subnormal',
  '04': '04 Dudoso',
  '05': '05 Irrecuperable'
};

export default function AsistentePage() {
  const { selectedPeriod, refreshTick, addToast } = useApp();
  const [activeTab, setActiveTab] = useState('ia');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Soy el **Asistente Analítico Virtual SBP 2026**. Consulto exclusivamente los resultados deterministas almacenados en SQLite (sin recalcular ni alterar rankings). Selecciona una consulta sugerida o escribe tu propia pregunta financiera.',
      provider: 'Motor Analítico Local (Offline Determinista)',
      suggestions: PRESET_QUESTIONS.slice(0, 4)
    }
  ]);
  const [asking, setAsking] = useState(false);

  const [morosidad, setMorosidad] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [vencimientos, setVencimientos] = useState([]);

  useEffect(() => {
    if (!selectedPeriod) return;
    Promise.all([
      api.getAnalisis(selectedPeriod, 'morosidad'),
      api.getAnalisis(selectedPeriod, 'clasificacionRegulatoria'),
      api.getAnalisis(selectedPeriod, 'vencimientos')
    ]).then(([m, c, v]) => {
      setMorosidad((m.data || []).map(x => ({ codigo: x.codigo_banco, ...x.datos })));
      setClasificacion((c.data || []).map(x => ({ codigo: x.codigo_banco, ...x.datos })));
      setVencimientos((v.data || []).map(x => ({ codigo: x.codigo_banco, ...x.datos })));
    }).catch(() => {});
  }, [selectedPeriod, refreshTick]);

  const sendQuery = async (textToAsk) => {
    const q = (textToAsk ?? question).trim();
    if (!q || asking) return;
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    if (!textToAsk) setQuestion('');
    setAsking(true);

    try {
      const res = await api.askAssistant(q, selectedPeriod);
      const data = res.data;
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          provider: data.provider,
          suggestions: data.suggestedFollowUps || []
        }
      ]);
    } catch (err) {
      addToast(err.message, 'error');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: `Error al consultar al asistente: ${err.message}`, provider: 'Sistema' }
      ]);
    } finally {
      setAsking(false);
    }
  };

  // Format markdown bold/bullets simply for safe display
  const renderFormatted = (text) => {
    return text.split('\n').map((line, i) => {
      const html = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code class="mono" style="background:rgba(0,210,255,0.12);padding:1px 5px;border-radius:4px">$1</code>');
      return (
        <div
          key={i}
          style={{ minHeight: line === '' ? '8px' : 'auto', marginBottom: '3px' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    });
  };

  // Build vencimientos chart aggregate across system
  const tramosPorVencer = [
    { key: 'Monto_por_Vencer_30_dias', label: '0-30d' },
    { key: 'Monto_por_Vencer_60_dias', label: '31-60d' },
    { key: 'Monto_por_Vencer_90_dias', label: '61-90d' },
    { key: 'Monto_por_Vencer_120_dias', label: '91-120d' },
    { key: 'Monto_por_Vencer_180_dias', label: '121-180d' },
    { key: 'Monto_por_Vencer_1_ano', label: '181-365d' },
    { key: 'Monto_por_Vencer_1_a_5_anos', label: '1-5 años' },
    { key: 'Monto_por_Vencer_5_a_10_anos', label: '5-10 años' },
    { key: 'Monto_por_Vencer_mas_10_anos', label: '>10 años' }
  ];

  const vencimientoAgg = tramosPorVencer.map(t => ({
    tramo: t.label,
    montoM: Number(
      (vencimientos.reduce((s, b) => s + Number(b.porVencer?.[t.key] || 0), 0) / 1e6).toFixed(2)
    )
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Bot size={24} color="#00d2ff" /> Análisis Inteligente y Métricas Complementarias
          </h1>
          <p className="page-subtitle">
            Asistente analítico con separación estricta entre cálculo determinista e IA, más análisis complementarios AT03 ({formatPeriod(selectedPeriod)}).
          </p>
        </div>

        <div className="tabs">
          <button className={`tab-btn ${activeTab === 'ia' ? 'active' : ''}`} onClick={() => setActiveTab('ia')}>
            Asistente Virtual IA
          </button>
          <button className={`tab-btn ${activeTab === 'morosidad' ? 'active' : ''}`} onClick={() => setActiveTab('morosidad')}>
            Morosidad y Riesgo
          </button>
          <button className={`tab-btn ${activeTab === 'vencimientos' ? 'active' : ''}`} onClick={() => setActiveTab('vencimientos')}>
            Perfil de Vencimientos
          </button>
        </div>
      </div>

      {activeTab === 'ia' && (
        <div className="grid-sidebar-layout">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '580px' }}>
            <div className="card-header">
              <div className="card-title">
                <Sparkles size={17} color="#00d2ff" /> Chat Analítico Financiero
              </div>
              <span className="badge badge-green">Respuestas Basadas en Datos Oficiales</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '6px' }}>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, rgba(0,210,255,0.22), rgba(37,99,235,0.3))'
                      : 'var(--bg-navy)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(0,210,255,0.45)' : 'var(--border-subtle)'}`,
                    borderRadius: '14px',
                    padding: '12px 15px'
                  }}
                >
                  {msg.provider && (
                    <div style={{ fontSize: '10.5px', color: 'var(--accent-cyan)', fontWeight: 600, marginBottom: '5px' }}>
                      {msg.provider}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', color: '#f1f5f9' }}>{renderFormatted(msg.text)}</div>
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                      {msg.suggestions.map((s, si) => (
                        <button
                          key={si}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '11px', textAlign: 'left', whiteSpace: 'normal' }}
                          onClick={() => sendQuery(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {asking && (
                <div style={{ fontSize: '12.5px', color: 'var(--accent-cyan)' }}>
                  Consultando resultados deterministas en SQLite...
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); sendQuery(); }}
              style={{ display: 'flex', gap: '10px', marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}
            >
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Ej: ¿Qué banco lidera INDUSTRIA en septiembre?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={asking || !question.trim()}>
                <Send size={15} /> Consultar
              </button>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '10px' }}>
                Consultas Rápidas Sugeridas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {PRESET_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', padding: '10px 12px' }}
                    onClick={() => sendQuery(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ borderColor: 'rgba(16,185,129,0.3)' }}>
              <div className="card-title" style={{ marginBottom: '8px', color: '#34d399' }}>
                Principio de Transparencia IA
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                El asistente opera con <strong>arquitectura desacoplada</strong>: en modo local responde 100% sin conexión usando el motor determinista sobre SQLite. Si un administrador autoriza un proveedor externo, la IA solo redacta explicaciones sobre cifras oficiales verificadas y <strong>nunca calcula ni modifica rankings</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'morosidad' && (
        <div>
          <div className="card" style={{ marginBottom: '16px', padding: '12px 16px', borderColor: 'rgba(245,158,11,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#fde68a' }}>
              <ShieldAlert size={18} />
              <span><strong>Análisis Complementario AT03:</strong> Los indicadores de morosidad (`Dias_Mora &gt; 0`) y clasificación regulatoria enriquecen el análisis de riesgo y no modifican los rankings oficiales.</span>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: '18px' }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title"><Activity size={16} color="#f43f5e" /> % Saldo Moroso por Entidad</div>
              </div>
              <div style={{ height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...morosidad].sort((a, b) => Number(b.porcentajeSaldoMoroso) - Number(a.porcentajeSaldoMoroso))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="nombreBanco" stroke="#94a3b8" fontSize={10} angle={-22} textAnchor="end" interval={0} height={60} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: '#0b1324', border: '1px solid #f43f5e', borderRadius: '10px', color: '#fff' }}
                      formatter={(v) => [`${v}%`, '% Saldo Moroso']}
                    />
                    <Bar dataKey={(r) => Number(r.porcentajeSaldoMoroso)} fill="#f43f5e" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title"><PieIcon size={16} color="#00d2ff" /> Detalle de Morosidad por Banco</div>
              </div>
              <div className="table-wrap" style={{ maxHeight: 290, overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Banco</th>
                      <th className="text-right">Ops. Mora</th>
                      <th className="text-right">Saldo Moroso</th>
                      <th className="text-right">% Mora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {morosidad.map(m => (
                      <tr key={m.codigo}>
                        <td style={{ fontWeight: 600 }}>{m.nombreBanco}</td>
                        <td className="text-right mono">{m.operacionesMorosas} / {m.totalOperaciones}</td>
                        <td className="text-right mono">{formatMoney(m.saldoMoroso)}</td>
                        <td className="text-right mono" style={{ color: Number(m.porcentajeSaldoMoroso) > 3 ? '#fb7185' : '#34d399', fontWeight: 700 }}>
                          {m.porcentajeSaldoMoroso}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Distribución por Clasificación Regulatoria (`Clasificacion_Prestamo`)</div>
            </div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Banco</th>
                    {Object.values(REG_LABELS).map(lbl => (
                      <th key={lbl} className="text-right">{lbl}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clasificacion.map(c => (
                    <tr key={c.codigo}>
                      <td style={{ fontWeight: 600 }}>{c.nombreBanco}</td>
                      {Object.keys(REG_LABELS).map(code => {
                        const d = c.distribucion?.[code];
                        return (
                          <td key={code} className="text-right mono">
                            {d ? formatMoney(d.saldo, true) : 'B/. 0.00'}
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
      )}

      {activeTab === 'vencimientos' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Clock size={17} color="#00d2ff" /> Perfil Agregado de Capital por Vencer ({formatPeriod(selectedPeriod)})</div>
              <div className="card-subtitle">Distribución de `Monto_por_Vencer_*` en millones de balboas sobre el universo local válido</div>
            </div>
          </div>
          <div style={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vencimientoAgg}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="tramo" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v}M`} />
                <Tooltip
                  contentStyle={{ background: '#0b1324', border: '1px solid #00d2ff', borderRadius: '10px', color: '#fff' }}
                  formatter={(v) => [`B/. ${v}M`, 'Capital por Vencer']}
                />
                <Legend />
                <Bar dataKey="montoM" name="Capital por Vencer (B/. M)" fill="#00d2ff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
