/**
 * Asistente Analítico Inteligente - Hackathon SBP 2026
 * 
 * Arquitectura desacoplada:
 * - Modo Local (Offline): Motor analítico basado en reglas y datos deterministas de SQLite.
 * - Modo Remoto (Opcional): Adaptador para proveedor externo de IA (OpenAI / Gemini compatible)
 *   alimentado exclusivamente con los resultados estructurados del motor determinista.
 * 
 * RESTRICCIÓN FUNDAMENTAL: La IA nunca calcula, modifica, inventa ni determina
 * los rankings oficiales.
 */

import {
  getPeriodos, getRankings, getSubactividades, getMovimientos,
  getDashboardStats, getAnalisisComplementario, getDB
} from '../db/database.js';
import { MACROACTIVIDADES } from './financialEngine.js';

const MONTH_NAMES = {
  '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril',
  '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto',
  '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre'
};

export function formatPeriodLabel(fecha) {
  if (!fecha || fecha.length !== 8) return fecha;
  const year = fecha.slice(0, 4);
  const month = MONTH_NAMES[fecha.slice(4, 6)] || fecha.slice(4, 6);
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
}

function formatMoney(val) {
  const num = Number(val || 0);
  return `B/. ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectPeriodFromQuery(normQuery, availablePeriods) {
  // Check explicit AAAAMMDD
  for (const p of availablePeriods) {
    if (normQuery.includes(p)) return p;
  }
  // Check month names
  for (const [num, name] of Object.entries(MONTH_NAMES)) {
    if (normQuery.includes(name)) {
      const match = availablePeriods.find(p => p.slice(4, 6) === num);
      if (match) return match;
    }
  }
  return availablePeriods[availablePeriods.length - 1] || null;
}

function detectMacroFromQuery(normQuery) {
  const aliases = {
    HIPOTECARIO: ['hipotecario', 'hipoteca', 'hipotecaria', 'vivienda'],
    CONSTRUCCION: ['construccion', 'constructor', 'infraestructura'],
    INDUSTRIA: ['industria', 'industrial', 'manufactura'],
    AGROPECUARIO: ['agropecuario', 'agro', 'agricultura', 'ganaderia', 'pesca', 'forestal'],
    COMERCIO: ['comercio', 'comercial', 'mayorista', 'minorista'],
    CONSUMO: ['consumo', 'personal', 'tarjeta', 'automovil', 'auto']
  };
  for (const [macro, keys] of Object.entries(aliases)) {
    if (keys.some(k => normQuery.includes(k))) return macro;
  }
  return null;
}

function detectBankFromQuery(normQuery, rankings) {
  const seen = new Map();
  for (const r of rankings) {
    seen.set(r.codigo_banco, r.nombre_banco);
  }
  for (const [code, name] of seen.entries()) {
    const normName = normalizeText(name);
    const shortName = normName.replace(/^banco\s+(del\s+)?/, '');
    if (normQuery.includes(normName) || (shortName.length >= 4 && normQuery.includes(shortName)) || normQuery.includes(code)) {
      return { codigo: code, nombre: name };
    }
  }
  return null;
}

/**
 * Procesa una consulta usando el motor analítico determinista local.
 */
export function answerLocalQuery(question, contextPeriod = null) {
  const periodos = getPeriodos().map(p => p.fecha).sort();
  if (periodos.length === 0) {
    return {
      mode: 'local_deterministic',
      answer: 'No hay períodos procesados todavía en la base de datos local. Carga o inicializa los archivos AT03 para comenzar el análisis.',
      highlights: [],
      suggestedFollowUps: []
    };
  }

  const norm = normalizeText(question);
  const targetPeriod = detectPeriodFromQuery(norm, periodos) || contextPeriod || periodos[periodos.length - 1];
  const targetMacro = detectMacroFromQuery(norm);
  const allRankings = getRankings(targetPeriod);
  const targetBank = detectBankFromQuery(norm, allRankings);

  // 1. Consulta de resumen ejecutivo
  if (norm.includes('resumen') || norm.includes('ejecutivo') || norm.includes('movimientos mas importantes') || norm.includes('ultimo periodo')) {
    return buildExecutiveSummary(periodos, targetPeriod);
  }

  // 2. Consulta sobre concentración
  if (norm.includes('concentracion') || norm.includes('concentra') || norm.includes('especializacion')) {
    return buildConcentrationAnswer(targetPeriod);
  }

  // 3. Consulta sobre morosidad o riesgo
  if (norm.includes('morosidad') || norm.includes('mora') || norm.includes('vencido') || norm.includes('riesgo')) {
    return buildMorosityAnswer(targetPeriod);
  }

  // 4. Consulta sobre calidad de datos / exclusiones / reconciliaciones
  if (norm.includes('calidad') || norm.includes('exclusion') || norm.includes('duplicado') || norm.includes('reconciliacion')) {
    return buildQualityAnswer(targetPeriod);
  }

  // 5. Consulta sobre cambios entre períodos
  if (norm.includes('cambio') || norm.includes('variacion') || norm.includes('subio') || norm.includes('bajo') || norm.includes('ascendio') || norm.includes('descendio') || norm.includes('entre')) {
    return buildMovementsAnswer(periodos, norm, targetMacro);
  }

  // 6. Consulta sobre evolución de un banco específico
  if (targetBank) {
    return buildBankAnalysisAnswer(periodos, targetPeriod, targetBank, targetMacro);
  }

  // 7. Consulta sobre líder o ranking específico
  if (norm.includes('lider') || norm.includes('primero') || norm.includes('top') || norm.includes('ranking') || targetMacro) {
    return buildRankingAnswer(targetPeriod, targetMacro);
  }

  // 8. Respuesta general orientativa con métricas reales del último período
  return buildExecutiveSummary(periodos, targetPeriod);
}

function buildRankingAnswer(periodo, macro) {
  const label = formatPeriodLabel(periodo);
  if (macro) {
    const rows = getRankings(periodo, macro);
    const top3 = rows.slice(0, 3);
    const totalMacro = rows.reduce((s, r) => s + Number(r.saldo_actividad), 0);
    const leader = rows[0];
    const subs = getSubactividades(periodo, macro, leader?.codigo_banco);

    const lines = [
      `**Ranking ${macro} — ${label}** (${periodo})`,
      ``,
      `El líder de la actividad **${macro}** es **${leader.nombre_banco}** (${leader.codigo_banco}) con un saldo de **${formatMoney(leader.saldo_actividad)}** (${leader.ponderacion_pct}% de su cartera local válida y ${leader.operaciones_validas.toLocaleString('en-US')} operaciones válidas).`,
      ``,
      `**Podio del período:**`,
      ...top3.map(r => `- **#${r.posicion} ${r.nombre_banco}**: ${formatMoney(r.saldo_actividad)} (ponderación: ${r.ponderacion_pct}%)`),
      ``,
      `El saldo total agregado de los 12 bancos en ${macro} asciende a **${formatMoney(totalMacro)}**.`
    ];

    if (subs.length > 0) {
      lines.push('', `**Desglose del líder (${leader.nombre_banco}):**`);
      subs.forEach(s => lines.push(`- ${s.subactividad}: ${formatMoney(s.saldo)} (${s.operaciones} ops.)`));
    }

    return {
      mode: 'local_deterministic',
      answer: lines.join('\n'),
      dataContext: { periodo, macro, top3 },
      suggestedFollowUps: [
        `¿Cómo cambió el ranking de ${macro} respecto al mes anterior?`,
        `¿Cómo evolucionó la cartera de ${leader.nombre_banco}?`,
        'Genera un resumen ejecutivo del último período'
      ]
    };
  }

  const stats = getDashboardStats(periodo);
  const lines = [
    `**Líderes por macroactividad — ${label}** (${periodo})`,
    '',
    ...stats.leaders.map(l => `- **${l.ranking}**: ${l.nombre_banco} (${formatMoney(l.saldo_actividad)}, ponderación ${l.ponderacion_pct}%)`)
  ];
  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { periodo, leaders: stats.leaders },
    suggestedFollowUps: [
      '¿Qué entidades tuvieron los mayores cambios entre agosto y septiembre?',
      '¿Qué bancos presentan mayor concentración de cartera en una sola actividad?'
    ]
  };
}

function buildMovementsAnswer(periodos, norm, targetMacro) {
  if (periodos.length < 2) {
    return {
      mode: 'local_deterministic',
      answer: 'Se necesitan al menos dos períodos procesados para comparar movimientos de posición.',
      suggestedFollowUps: []
    };
  }

  // Detect two periods if mentioned
  const mentioned = [];
  for (const [num, name] of Object.entries(MONTH_NAMES)) {
    if (norm.includes(name)) {
      const p = periodos.find(pr => pr.slice(4, 6) === num);
      if (p && !mentioned.includes(p)) mentioned.push(p);
    }
  }
  mentioned.sort();
  const pPrev = mentioned.length >= 2 ? mentioned[0] : periodos[periodos.length - 2];
  const pCurr = mentioned.length >= 2 ? mentioned[1] : periodos[periodos.length - 1];

  const movs = getMovimientos(pPrev, pCurr, targetMacro);
  const sortedByPos = [...movs].sort((a, b) => Math.abs(b.cambio_posicion || 0) - Math.abs(a.cambio_posicion || 0));
  const topMovers = sortedByPos.filter(m => m.cambio_posicion !== 0).slice(0, 6);
  const leaderChanges = movs.filter(m => m.posicion_actual === 1 && m.posicion_anterior !== 1);

  const lines = [
    `**Análisis comparativo: ${formatPeriodLabel(pPrev)} → ${formatPeriodLabel(pCurr)}**${targetMacro ? ` (${targetMacro})` : ''}`,
    ''
  ];

  if (leaderChanges.length > 0) {
    lines.push('**Cambios de liderazgo detectados:**');
    leaderChanges.forEach(l => {
      lines.push(`- **${l.ranking}**: **${l.nombre_banco}** pasó del puesto #${l.posicion_anterior} al **#1** (+${l.variacion_saldo_pct}% en saldo).`);
    });
    lines.push('');
  }

  if (topMovers.length > 0) {
    lines.push('**Mayores movimientos de posición:**');
    topMovers.forEach(m => {
      const dir = m.cambio_posicion > 0 ? `subió ${m.cambio_posicion}` : `bajó ${Math.abs(m.cambio_posicion)}`;
      lines.push(`- **${m.nombre_banco}** en **${m.ranking}**: ${dir} pos. (#${m.posicion_anterior} → #${m.posicion_actual}), variación de saldo: ${formatMoney(m.variacion_saldo)} (${m.variacion_saldo_pct}%).`);
    });
  } else {
    lines.push('No se registraron cambios de posición en los criterios seleccionados.');
  }

  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { periodoAnterior: pPrev, periodoActual: pCurr, topMovers },
    suggestedFollowUps: [
      'Genera un resumen ejecutivo del último período',
      '¿Qué bancos presentan mayor concentración de cartera en una sola actividad?'
    ]
  };
}

function buildBankAnalysisAnswer(periodos, targetPeriod, bank, targetMacro) {
  const label = formatPeriodLabel(targetPeriod);
  const bankRankings = getRankings(targetPeriod).filter(r => r.codigo_banco === bank.codigo);
  const totalCartera = bankRankings[0]?.total_cartera_local_valida || '0.00';

  const lines = [
    `**Perfil analítico de ${bank.nombre} (${bank.codigo}) — ${label}**`,
    '',
    `Cartera local válida total: **${formatMoney(totalCartera)}**.`,
    ''
  ];

  if (targetMacro) {
    lines.push(`**Evolución histórica en ${targetMacro}:**`);
    for (const p of periodos) {
      const row = getRankings(p, targetMacro).find(r => r.codigo_banco === bank.codigo);
      if (row) {
        lines.push(`- **${formatPeriodLabel(p)}**: Posición **#${row.posicion}**, Saldo ${formatMoney(row.saldo_actividad)}, Ponderación ${row.ponderacion_pct}% (${row.operaciones_validas} ops.)`);
      }
    }
  } else {
    lines.push('**Posición y participación por macroactividad:**');
    bankRankings
      .sort((a, b) => Number(b.saldo_actividad) - Number(a.saldo_actividad))
      .forEach(r => {
        lines.push(`- **${r.ranking}**: Posición **#${r.posicion}** · ${formatMoney(r.saldo_actividad)} (${r.ponderacion_pct}%)`);
      });
  }

  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { bank, periodo: targetPeriod, bankRankings },
    suggestedFollowUps: [
      `¿Cómo evolucionó la cartera hipotecaria de ${bank.nombre}?`,
      `¿Cuál es el nivel de morosidad de ${bank.nombre}?`
    ]
  };
}

function buildConcentrationAnswer(periodo) {
  const rows = getRankings(periodo);
  const byBank = new Map();
  for (const r of rows) {
    if (!byBank.has(r.codigo_banco) || Number(r.ponderacion_pct) > Number(byBank.get(r.codigo_banco).ponderacion_pct)) {
      byBank.set(r.codigo_banco, r);
    }
  }
  const topConcentrated = [...byBank.values()]
    .sort((a, b) => Number(b.ponderacion_pct) - Number(a.ponderacion_pct))
    .slice(0, 5);

  const lines = [
    `**Concentración de cartera por actividad — ${formatPeriodLabel(periodo)}**`,
    '',
    'Entidades con mayor porcentaje de su cartera local válida concentrada en una sola macroactividad:',
    '',
    ...topConcentrated.map(r => `- **${r.nombre_banco}**: **${r.ponderacion_pct}%** concentrado en **${r.ranking}** (${formatMoney(r.saldo_actividad)} de ${formatMoney(r.total_cartera_local_valida)}).`)
  ];

  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { periodo, topConcentrated },
    suggestedFollowUps: [
      '¿Qué entidades tuvieron los mayores cambios entre agosto y septiembre?',
      '¿Cuál es la calidad de datos y reconciliaciones del último período?'
    ]
  };
}

function buildMorosityAnswer(periodo) {
  const analisis = getAnalisisComplementario(periodo, 'morosidad').map(a => ({
    codigo: a.codigo_banco,
    ...JSON.parse(a.datos)
  }));
  if (analisis.length === 0) {
    return {
      mode: 'local_deterministic',
      answer: `No hay métricas complementarias de morosidad disponibles para ${formatPeriodLabel(periodo)}.`,
      suggestedFollowUps: []
    };
  }

  const sorted = [...analisis].sort((a, b) => Number(b.porcentajeSaldoMoroso) - Number(a.porcentajeSaldoMoroso));
  const totalCartera = sorted.reduce((s, a) => s + Number(a.saldoTotal), 0);
  const totalMora = sorted.reduce((s, a) => s + Number(a.saldoMoroso), 0);
  const systemPct = totalCartera > 0 ? ((totalMora / totalCartera) * 100).toFixed(2) : '0.00';

  const lines = [
    `**Análisis complementario de morosidad — ${formatPeriodLabel(periodo)}**`,
    '> *Indicador complementario basado en `Dias_Mora > 0`; no altera los rankings oficiales.*',
    '',
    `Morosidad agregada del sistema ficticio: **${systemPct}%** (${formatMoney(totalMora)} sobre ${formatMoney(totalCartera)}).`,
    '',
    '**Entidades con mayor porcentaje de saldo moroso:**',
    ...sorted.slice(0, 4).map(a => `- **${a.nombreBanco}**: ${a.porcentajeSaldoMoroso}% (${formatMoney(a.saldoMoroso)}, ${a.operacionesMorosas} operaciones con mora)`),
    '',
    '**Entidad con menor morosidad:**',
    `- **${sorted[sorted.length - 1].nombreBanco}**: ${sorted[sorted.length - 1].porcentajeSaldoMoroso}%`
  ];

  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { periodo, systemPct },
    suggestedFollowUps: ['Genera un resumen ejecutivo del último período']
  };
}

function buildQualityAnswer(periodo) {
  const periodInfo = getDB().prepare('SELECT * FROM periodos WHERE fecha = ?').get(periodo);
  if (!periodInfo) {
    return { mode: 'local_deterministic', answer: 'Período no encontrado.', suggestedFollowUps: [] };
  }

  const lines = [
    `**Auditoría y calidad de datos — ${formatPeriodLabel(periodo)}** (${periodo})`,
    '',
    `- **Filas leídas**: ${periodInfo.total_filas.toLocaleString('en-US')}`,
    `- **E1 (Duplicados)**: ${periodInfo.e1_duplicados.toLocaleString('en-US')}`,
    `- **E2 (Destino extranjero ≠ L)**: ${periodInfo.e2_extranjeros.toLocaleString('en-US')}`,
    `- **E3 (Saldo ≤ 0)**: ${periodInfo.e3_saldo_negativo.toLocaleString('en-US')}`,
    `- **E4 (Actividad no catalogada)**: ${periodInfo.e4_no_catalogado.toLocaleString('en-US')}`,
    `- **Universo local válido**: **${periodInfo.universo_local_valido.toLocaleString('en-US')}**`,
    `- **Reconciliación matemática**: ${periodInfo.reconciliacion_ok ? 'CUADRADA AL 100% (R1, R2 y R3 verificadas)' : 'CON DIFERENCIAS'}`
  ];

  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { periodInfo },
    suggestedFollowUps: ['Genera un resumen ejecutivo del último período']
  };
}

function buildExecutiveSummary(periodos, targetPeriod) {
  const stats = getDashboardStats(targetPeriod);
  const label = formatPeriodLabel(targetPeriod);
  const idx = periodos.indexOf(targetPeriod);

  const lines = [
    `**Resumen Ejecutivo del Sistema — ${label}** (${targetPeriod})`,
    '',
    `- **Cartera local válida total**: **${formatMoney(stats.totalCartera)}**`,
    `- **Operaciones válidas**: ${stats.totalOperaciones.toLocaleString('en-US')} (de ${stats.periodInfo.total_filas.toLocaleString('en-US')} leídas)`,
    `- **Entidades analizadas**: ${stats.totalBancos} bancos de licencia general`,
    `- **Macroactividades evaluadas**: ${stats.totalMacroactividades}`,
    '',
    '**Líderes actuales por macroactividad:**',
    ...stats.leaders.map(l => `- **${l.ranking}**: ${l.nombre_banco} (${formatMoney(l.saldo_actividad)})`)
  ];

  if (idx > 0) {
    const prev = periodos[idx - 1];
    const movs = getMovimientos(prev, targetPeriod);
    const sig = movs.filter(m => Math.abs(m.cambio_posicion || 0) >= 2 || (m.posicion_actual === 1 && m.posicion_anterior !== 1)).slice(0, 4);
    if (sig.length > 0) {
      lines.push('', `**Movimientos destacados vs ${formatPeriodLabel(prev)}:**`);
      sig.forEach(m => {
        const dir = m.cambio_posicion > 0 ? `subió ${m.cambio_posicion}` : m.cambio_posicion < 0 ? `bajó ${Math.abs(m.cambio_posicion)}` : 'mantuvo';
        lines.push(`- **${m.nombre_banco}** (${m.ranking}): ${dir} posición (#${m.posicion_anterior} → #${m.posicion_actual}, ${m.variacion_saldo_pct}%).`);
      });
    }
  }

  lines.push('', '*Nota: Datos 100% ficticios con fines demostrativos. Cálculos generados por el motor determinista oficial.*');

  return {
    mode: 'local_deterministic',
    answer: lines.join('\n'),
    dataContext: { periodo: targetPeriod, stats },
    suggestedFollowUps: [
      '¿Qué banco lidera el ranking de INDUSTRIA en septiembre?',
      '¿Qué entidades tuvieron los mayores cambios entre agosto y septiembre?',
      '¿Qué bancos presentan mayor concentración de cartera en una sola actividad?'
    ]
  };
}

/**
 * Punto de entrada híbrido del asistente:
 * Si está configurado un proveedor externo y hay conexión autorizada, puede enriquecer
 * la redacción usando el contexto determinista ya calculado; de lo contrario usa
 * el motor analítico local offline sin depender de Internet.
 */
export async function askAnalyticalAssistant(question, options = {}) {
  const localResult = answerLocalQuery(question, options.periodo);
  const externalEndpoint = process.env.AI_EXTERNAL_ENDPOINT;
  const externalApiKey = process.env.AI_EXTERNAL_API_KEY;
  const allowExternal = options.useExternalAI === true && Boolean(externalEndpoint && externalApiKey);

  if (!allowExternal) {
    return {
      ...localResult,
      provider: 'Motor Analítico Local (Offline Determinista)',
      externalUsed: false
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(externalEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${externalApiKey}`
      },
      body: JSON.stringify({
        model: process.env.AI_EXTERNAL_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Eres un analista financiero de la Superintendencia de Bancos de Panamá (datos ficticios Hackathon SBP 2026). Usa EXCLUSIVAMENTE los datos verificados provistos. Nunca inventes ni recalcules cifras.'
          },
          {
            role: 'user',
            content: `Pregunta: ${question}\n\nDatos verificados:\n${localResult.answer}`
          }
        ],
        temperature: 0.2
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const json = await response.json();
      const text = json?.choices?.[0]?.message?.content;
      if (text) {
        return {
          ...localResult,
          answer: text,
          provider: 'IA Externa + Contexto Determinista SBP',
          externalUsed: true
        };
      }
    }
  } catch {
    // Fallback automático a modo local sin interrumpir la operación
  }

  return {
    ...localResult,
    provider: 'Motor Analítico Local (Fallback Offline)',
    externalUsed: false
  };
}
