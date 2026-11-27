/**
 * API Client Service & Formatting Helpers
 * Incluye el envío automático del perfil activo (X-User-Profile)
 */

const API_BASE = '/api';

let currentProfile = 'publico';

export function setApiProfile(profile) {
  currentProfile = profile;
}

export function getApiProfile() {
  return currentProfile;
}

async function request(path, options = {}) {
  const headers = {
    'X-User-Profile': currentProfile,
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!res.ok || json.success === false) {
    const err = new Error(json.error || `Error ${res.status}`);
    err.details = json.details || null;
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  health: () => request('/health'),
  getDashboard: (periodo) => request(`/dashboard${periodo ? `?periodo=${periodo}` : ''}`),
  getPeriodos: () => request('/periodos'),
  getRankings: (periodo, ranking) => {
    const q = new URLSearchParams();
    if (periodo) q.set('periodo', periodo);
    if (ranking) q.set('ranking', ranking);
    return request(`/rankings?${q.toString()}`);
  },
  getSubactividades: (periodo, ranking, banco) => {
    const q = new URLSearchParams();
    if (periodo) q.set('periodo', periodo);
    if (ranking) q.set('ranking', ranking);
    if (banco) q.set('banco', banco);
    return request(`/subactividades?${q.toString()}`);
  },
  getBancos: () => request('/bancos'),
  getCatalogoCinu: () => request('/catalogos/cinu'),
  getCatalogoSb21: () => request('/catalogos/sb21'),
  getDiccionario: () => request('/diccionario'),
  comparar: (periodo, bancos, ranking) => {
    const q = new URLSearchParams({ periodo, bancos: bancos.join(',') });
    if (ranking) q.set('ranking', ranking);
    return request(`/comparar?${q.toString()}`);
  },
  getMovimientos: (periodoAnterior, periodoActual, ranking) => {
    const q = new URLSearchParams();
    if (periodoAnterior) q.set('periodoAnterior', periodoAnterior);
    if (periodoActual) q.set('periodoActual', periodoActual);
    if (ranking) q.set('ranking', ranking);
    return request(`/movimientos?${q.toString()}`);
  },
  getExplicaciones: (periodoAnterior, periodoActual, ranking) => {
    const q = new URLSearchParams();
    if (periodoAnterior) q.set('periodoAnterior', periodoAnterior);
    if (periodoActual) q.set('periodoActual', periodoActual);
    if (ranking) q.set('ranking', ranking);
    return request(`/explicaciones?${q.toString()}`);
  },
  getExclusiones: (periodo, motivo) => {
    const q = new URLSearchParams({ periodo });
    if (motivo) q.set('motivo', motivo);
    return request(`/exclusiones?${q.toString()}`);
  },
  getReconciliaciones: (periodo) => request(`/reconciliaciones?periodo=${periodo}`),
  getAuditoria: () => request('/auditoria'),
  getAlertas: (periodo) => request(`/alertas${periodo ? `?periodo=${periodo}` : ''}`),
  getAnalisis: (periodo, tipo) => {
    const q = new URLSearchParams();
    if (periodo) q.set('periodo', periodo);
    if (tipo) q.set('tipo', tipo);
    return request(`/analisis?${q.toString()}`);
  },
  getConfiguracion: () => request('/configuracion'),
  updateConfiguracion: (clave, valor) =>
    request(`/configuracion/${clave}`, { method: 'PUT', body: JSON.stringify({ valor }) }),
  uploadAT03: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/upload', { method: 'POST', body: fd });
  },
  seedData: () => request('/seed', { method: 'POST' }),
  deletePeriodo: (fecha) => request(`/periodos/${fecha}`, { method: 'DELETE' }),
  askAssistant: (pregunta, periodo) =>
    request('/asistente', { method: 'POST', body: JSON.stringify({ pregunta, periodo }) }),
  getHybridStatus: () => request('/hibrido/estado'),
  syncRemote: (authorized, conflictStrategy) =>
    request('/hibrido/sincronizar', { method: 'POST', body: JSON.stringify({ authorized, conflictStrategy }) }),
  createBackup: () => request('/hibrido/backup', { method: 'POST' }),
  listBackups: () => request('/hibrido/backups'),
  getPostgresDDL: () => request('/hibrido/postgres-ddl'),

  exportUrl: (type, params = {}) => {
    const q = new URLSearchParams({ ...params, format: 'csv' });
    return `${API_BASE}/export/${type}?${q.toString()}`;
  }
};

export const MACROACTIVIDADES = [
  'HIPOTECARIO',
  'CONSTRUCCION',
  'INDUSTRIA',
  'AGROPECUARIO',
  'COMERCIO',
  'CONSUMO'
];

export const MACRO_COLORS = {
  HIPOTECARIO: '#00d2ff',
  CONSTRUCCION: '#3b82f6',
  INDUSTRIA: '#8b5cf6',
  AGROPECUARIO: '#10b981',
  COMERCIO: '#f59e0b',
  CONSUMO: '#ec4899'
};

export function formatMoney(val, compact = false) {
  const num = Number(val || 0);
  if (compact) {
    if (Math.abs(num) >= 1e9) return `B/. ${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `B/. ${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `B/. ${(num / 1e3).toFixed(1)}K`;
  }
  return `B/. ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPeriod(fecha) {
  if (!fecha || fecha.length !== 8) return fecha || '—';
  const months = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  return `${months[fecha.slice(4, 6)] || fecha.slice(4, 6)} ${fecha.slice(0, 4)}`;
}

export function formatPeriodShort(fecha) {
  if (!fecha || fecha.length !== 8) return fecha || '—';
  const months = {
    '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
  };
  return `${months[fecha.slice(4, 6)] || fecha.slice(4, 6)} ${fecha.slice(0, 4)}`;
}
