/**
 * API Routes - Rankings, Automatización, IA, Híbrido y Auditoría
 * Hackathon SBP 2026
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV, stringifyCSV } from '../engine/csvParser.js';
import {
  processAT03, loadCatalogs, comparePeriods,
  detectSignificantMovements, generateExplanations,
  validateSchema, computeSupplementaryAnalysis, MACROACTIVIDADES
} from '../engine/financialEngine.js';
import {
  savePeriodResults, saveMovements, getPeriodos, getRankings,
  getSubactividades, getMovimientos, getExclusiones, getReconciliaciones,
  getAuditoria, logAudit, getConfiguracion, updateConfiguracion,
  getDashboardStats, getAnalisisComplementario, getDB
} from '../db/database.js';
import { askAnalyticalAssistant } from '../engine/aiAssistant.js';
import {
  getHybridStatus, createLocalBackup, listLocalBackups,
  syncWithRemote, POSTGRES_DDL_REFERENCE
} from '../engine/hybridSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const router = Router();

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, `upload_${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ====== PERMISOS POR PERFIL ======

const VALID_PROFILES = ['publico', 'analista', 'administrador'];

function getRequestProfile(req) {
  const raw = (req.headers['x-user-profile'] || 'publico').toString().toLowerCase().trim();
  return VALID_PROFILES.includes(raw) ? raw : 'publico';
}

function requireProfile(allowedProfiles) {
  return (req, res, next) => {
    const profile = getRequestProfile(req);
    if (!allowedProfiles.includes(profile)) {
      logAudit('ACCESO_DENEGADO', profile, {
        endpoint: req.originalUrl,
        method: req.method,
        perfilActual: profile,
        perfilesRequeridos: allowedProfiles
      });
      return res.status(403).json({
        success: false,
        error: `Acceso denegado para el perfil "${profile}". Se requiere perfil: ${allowedProfiles.join(' o ')}.`
      });
    }
    req.userProfile = profile;
    next();
  };
}

// ====== CATALOGS ======

function loadCatalogsFromDisk() {
  const cinuText = fs.readFileSync(path.join(DATA_DIR, 'Catalogo_CINU_SB109_reto.csv'), 'utf-8');
  const sb21Text = fs.readFileSync(path.join(DATA_DIR, 'Tabla_SB21_simplificada.csv'), 'utf-8');
  const bancosText = fs.readFileSync(path.join(DATA_DIR, 'Bancos_ficticios.csv'), 'utf-8');

  const cinu = parseCSV(cinuText);
  const sb21 = parseCSV(sb21Text);
  const bancos = parseCSV(bancosText);

  return loadCatalogs(cinu.rows, sb21.rows, bancos.rows);
}

let cachedCatalogs = null;
function getCatalogs() {
  if (!cachedCatalogs) {
    cachedCatalogs = loadCatalogsFromDisk();
  }
  return cachedCatalogs;
}

function getThresholdsFromConfig() {
  const config = getConfiguracion();
  return {
    minPositionChange: parseInt(config.find(c => c.clave === 'umbral_cambio_posicion')?.valor || '2', 10),
    minSaldoChangePct: parseFloat(config.find(c => c.clave === 'umbral_variacion_saldo_pct')?.valor || '10'),
    detectLeaderChange: config.find(c => c.clave === 'detectar_cambio_lider')?.valor !== '0'
  };
}

function buildRankingsStructureForPeriod(periodo) {
  const res = {};
  for (const macro of MACROACTIVIDADES) {
    const entries = getRankings(periodo, macro);
    if (entries.length > 0) {
      res[macro] = {
        entries: entries.map(e => ({
          codigoBanco: e.codigo_banco,
          nombreBanco: e.nombre_banco,
          posicion: e.posicion,
          saldoActividad: e.saldo_actividad,
          totalCarteraLocalValida: e.total_cartera_local_valida,
          ponderacionPct: e.ponderacion_pct,
          operacionesValidas: e.operaciones_validas
        }))
      };
    }
  }
  return res;
}

// ====== HEALTH ======

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'SBP Hackathon 2026 API',
    timestamp: new Date().toISOString()
  });
});

// ====== DASHBOARD ======

router.get('/dashboard', (req, res) => {
  try {
    const { periodo } = req.query;
    const stats = getDashboardStats(periodo);
    if (!stats) {
      return res.json({ success: true, data: null, message: 'No hay períodos procesados' });
    }

    const periodos = getPeriodos();
    const carteraEvolution = periodos.map(p => {
      const r = getDB().prepare(`
        SELECT SUM(CAST(total_cartera_local_valida AS REAL)) as total
        FROM rankings WHERE periodo_fecha = ? AND ranking = 'HIPOTECARIO'
      `).get(p.fecha);
      return {
        periodo: p.fecha,
        totalCartera: r?.total || 0,
        universoValido: p.universo_local_valido,
        totalFilas: p.total_filas
      };
    }).reverse();

    const distByActivity = getDB().prepare(`
      SELECT ranking, SUM(CAST(saldo_actividad AS REAL)) as total_saldo, SUM(operaciones_validas) as total_ops
      FROM rankings WHERE periodo_fecha = ?
      GROUP BY ranking ORDER BY total_saldo DESC
    `).all(stats.periodo);

    // Get comparison with previous period relative to selected period
    const sortedAsc = [...periodos].map(p => p.fecha).sort();
    const selIdx = sortedAsc.indexOf(stats.periodo);
    let recentMovements = [];
    let explanations = [];
    let prevPeriod = null;

    if (selIdx > 0) {
      prevPeriod = sortedAsc[selIdx - 1];
      recentMovements = getMovimientos(prevPeriod, stats.periodo);
      const prevData = buildRankingsStructureForPeriod(prevPeriod);
      const currData = buildRankingsStructureForPeriod(stats.periodo);
      const rawMovs = comparePeriods(prevData, currData);
      const sig = detectSignificantMovements(rawMovs, getThresholdsFromConfig());
      explanations = generateExplanations(sig);
    }

    res.json({
      success: true,
      data: {
        ...stats,
        prevPeriod,
        carteraEvolution,
        distByActivity,
        recentMovements,
        explanations
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== RANKINGS ======

router.get('/rankings', (req, res) => {
  try {
    const { periodo, ranking } = req.query;
    const data = getRankings(periodo, ranking);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/rankings/:ranking', (req, res) => {
  try {
    const { periodo } = req.query;
    const data = getRankings(periodo, req.params.ranking);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== SUBACTIVIDADES ======

router.get('/subactividades', (req, res) => {
  try {
    const { periodo, ranking, banco } = req.query;
    const data = getSubactividades(periodo, ranking, banco);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== PERIODOS ======

router.get('/periodos', (req, res) => {
  try {
    const data = getPeriodos().map(p => ({
      ...p,
      metricas_independientes: p.metricas_independientes ? JSON.parse(p.metricas_independientes) : null
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/periodos/:fecha', requireProfile(['administrador']), (req, res) => {
  try {
    const { fecha } = req.params;
    const database = getDB();
    database.prepare('DELETE FROM rankings WHERE periodo_fecha = ?').run(fecha);
    database.prepare('DELETE FROM subactividades WHERE periodo_fecha = ?').run(fecha);
    database.prepare('DELETE FROM reconciliaciones WHERE periodo_fecha = ?').run(fecha);
    database.prepare('DELETE FROM exclusiones_detalle WHERE periodo_fecha = ?').run(fecha);
    database.prepare('DELETE FROM analisis_complementario WHERE periodo_fecha = ?').run(fecha);
    database.prepare('DELETE FROM alertas WHERE periodo_fecha = ?').run(fecha);
    database.prepare('DELETE FROM movimientos WHERE periodo_anterior = ? OR periodo_actual = ?').run(fecha, fecha);
    database.prepare('DELETE FROM periodos WHERE fecha = ?').run(fecha);
    logAudit('ELIMINAR_PERIODO', req.userProfile, { fecha });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== COMPARAR ENTIDADES ======

router.get('/comparar', requireProfile(['analista', 'administrador']), (req, res) => {
  try {
    const { periodo, bancos: bancosParam, ranking } = req.query;
    if (!periodo || !bancosParam) {
      return res.status(400).json({ success: false, error: 'Parámetros periodo y bancos requeridos' });
    }

    const bancosList = bancosParam.split(',').filter(Boolean);
    const allRankings = getRankings(periodo);

    // Calcular promedios y totales del sistema por macroactividad
    const systemMetrics = {};
    for (const macro of MACROACTIVIDADES) {
      const macroRows = allRankings.filter(r => r.ranking === macro);
      const totalSaldo = macroRows.reduce((s, r) => s + Number(r.saldo_actividad), 0);
      const avgSaldo = macroRows.length > 0 ? totalSaldo / macroRows.length : 0;
      const avgPond = macroRows.length > 0
        ? macroRows.reduce((s, r) => s + Number(r.ponderacion_pct), 0) / macroRows.length
        : 0;
      systemMetrics[macro] = {
        totalSaldo: totalSaldo.toFixed(2),
        promedioSaldo: avgSaldo.toFixed(2),
        promedioPonderacion: avgPond.toFixed(4)
      };
    }

    const comparison = {};
    for (const macro of MACROACTIVIDADES) {
      const macroRankings = allRankings.filter(r => r.ranking === macro);
      comparison[macro] = bancosList.map(banco => {
        const entry = macroRankings.find(r => r.codigo_banco === banco);
        const subs = getSubactividades(periodo, macro, banco);
        return { ...entry, subactividades: subs };
      });
    }

    if (ranking && comparison[ranking]) {
      res.json({
        success: true,
        data: { [ranking]: comparison[ranking] },
        systemMetrics: { [ranking]: systemMetrics[ranking] }
      });
    } else {
      res.json({ success: true, data: comparison, systemMetrics });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== MOVIMIENTOS Y EXPLICACIONES ======

function getOrComputeMovements(periodoAnterior, periodoActual, ranking) {
  let rows = getMovimientos(periodoAnterior, periodoActual, ranking);
  if (rows.length > 0) return rows;

  if (periodoAnterior && periodoActual && periodoAnterior !== periodoActual) {
    const prevData = buildRankingsStructureForPeriod(periodoAnterior);
    const currData = buildRankingsStructureForPeriod(periodoActual);
    if (Object.keys(prevData).length > 0 && Object.keys(currData).length > 0) {
      const computed = comparePeriods(prevData, currData);
      saveMovements(computed, periodoAnterior, periodoActual);
      rows = getMovimientos(periodoAnterior, periodoActual, ranking);
    }
  }
  return rows;
}

router.get('/movimientos', (req, res) => {
  try {
    const { periodoAnterior, periodoActual, ranking } = req.query;
    const data = getOrComputeMovements(periodoAnterior, periodoActual, ranking);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/explicaciones', (req, res) => {
  try {
    const { periodoAnterior, periodoActual, ranking } = req.query;
    const periodos = getPeriodos().map(p => p.fecha).sort();
    if (periodos.length < 2) {
      return res.json({ success: true, data: [], thresholds: getThresholdsFromConfig() });
    }

    const pPrev = periodoAnterior || periodos[periodos.length - 2];
    const pCurr = periodoActual || periodos[periodos.length - 1];

    const prevData = buildRankingsStructureForPeriod(pPrev);
    const currData = buildRankingsStructureForPeriod(pCurr);
    const movements = comparePeriods(prevData, currData);

    const thresholds = getThresholdsFromConfig();
    let significant = detectSignificantMovements(movements, thresholds);
    if (ranking) {
      significant = significant.filter(s => s.ranking === ranking);
    }
    const explanations = generateExplanations(significant);

    res.json({
      success: true,
      periodoAnterior: pPrev,
      periodoActual: pCurr,
      thresholds,
      data: explanations
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== CALIDAD & AUDITORÍA ======

router.get('/exclusiones', (req, res) => {
  try {
    const { periodo, motivo, limit } = req.query;
    if (!periodo) return res.status(400).json({ success: false, error: 'Parámetro periodo requerido' });
    const data = getExclusiones(periodo, motivo || null, limit || 500);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reconciliaciones', (req, res) => {
  try {
    const { periodo } = req.query;
    if (!periodo) return res.status(400).json({ success: false, error: 'Parámetro periodo requerido' });
    const data = getReconciliaciones(periodo);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/auditoria', requireProfile(['administrador', 'analista']), (req, res) => {
  try {
    const data = getAuditoria();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== CONFIGURACIÓN ======

router.get('/configuracion', (req, res) => {
  try {
    const data = getConfiguracion();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/configuracion/:clave', requireProfile(['administrador']), (req, res) => {
  try {
    const { valor } = req.body;
    updateConfiguracion(req.params.clave, valor);
    logAudit('ACTUALIZAR_CONFIGURACION', req.userProfile, { clave: req.params.clave, valor });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== ANÁLISIS COMPLEMENTARIO ======

router.get('/analisis', requireProfile(['analista', 'administrador']), (req, res) => {
  try {
    const { periodo, tipo } = req.query;
    const data = getAnalisisComplementario(periodo, tipo);
    const parsed = data.map(d => ({
      ...d,
      datos: JSON.parse(d.datos)
    }));
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== ASISTENTE IA ======

router.post('/asistente', requireProfile(['analista', 'administrador']), async (req, res) => {
  try {
    const { pregunta, periodo } = req.body;
    if (!pregunta || !pregunta.trim()) {
      return res.status(400).json({ success: false, error: 'La pregunta no puede estar vacía' });
    }
    const configRows = getConfiguracion();
    const useExternalAI = configRows.find(c => c.clave === 'ia_externa_habilitada')?.valor === '1';

    const answer = await askAnalyticalAssistant(pregunta, { periodo, useExternalAI });
    logAudit('CONSULTA_ASISTENTE_IA', req.userProfile, { pregunta, provider: answer.provider });
    res.json({ success: true, data: answer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== ARQUITECTURA HÍBRIDA & RESPALDOS ======

router.get('/hibrido/estado', async (req, res) => {
  try {
    const status = await getHybridStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/hibrido/sincronizar', requireProfile(['administrador']), async (req, res) => {
  try {
    const { authorized, conflictStrategy } = req.body || {};
    const result = await syncWithRemote({ authorized, conflictStrategy });
    res.json({ success: result.success, data: result, error: result.error });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/hibrido/backup', requireProfile(['administrador']), (req, res) => {
  try {
    const backup = createLocalBackup();
    res.json({ success: true, data: backup });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/hibrido/backups', requireProfile(['administrador']), (req, res) => {
  try {
    const backups = listLocalBackups();
    res.json({ success: true, data: backups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/hibrido/postgres-ddl', requireProfile(['administrador']), (req, res) => {
  res.json({ success: true, data: POSTGRES_DDL_REFERENCE });
});

// ====== UPLOAD & PROCESS ======

router.post('/upload', requireProfile(['administrador']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se proporcionó ningún archivo CSV.' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.csv') {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: `Formato inválido (${ext}). Solo se permiten archivos .csv con estructura regulatoria AT03.`
      });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { headers, rows } = parseCSV(fileContent);

    const schemaValidation = validateSchema(headers);
    if (!schemaValidation.valid) {
      fs.unlinkSync(filePath);
      logAudit('ARCHIVO_RECHAZADO', req.userProfile, {
        archivo: req.file.originalname,
        errores: schemaValidation.errors.slice(0, 10)
      });
      return res.status(400).json({
        success: false,
        error: 'Archivo inválido: no cumple con el esquema oficial de 61 columnas AT03.',
        details: schemaValidation.errors
      });
    }

    if (rows.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: 'El archivo CSV no contiene registros de datos.' });
    }

    const catalogs = getCatalogs();
    const result = processAT03(rows, catalogs);
    const thresholds = getThresholdsFromConfig();
    const summaryByPeriod = {};

    for (const [periodo, periodResult] of Object.entries(result.results)) {
      const supplementary = computeSupplementaryAnalysis(
        periodResult.validRows, catalogs.bancosMap
      );

      savePeriodResults({
        periodo,
        archivoOrigen: req.file.originalname,
        usuario: req.userProfile,
        exclusions: periodResult.exclusions,
        rankings: periodResult.rankings,
        reconciliations: periodResult.reconciliations,
        integrityAlerts: periodResult.integrityAlerts,
        coherenceAlerts: periodResult.coherenceAlerts,
        supplementaryAnalysis: supplementary,
        processingTimeMs: result.processingTimeMs,
        totalRows: periodResult.totalRows
      });

      const allPeriods = getPeriodos();
      const sortedPeriods = allPeriods.map(p => p.fecha).sort();
      const currentIdx = sortedPeriods.indexOf(periodo);
      let generatedExplanations = [];

      if (currentIdx > 0) {
        const prevPeriodo = sortedPeriods[currentIdx - 1];
        const prevRankingsData = buildRankingsStructureForPeriod(prevPeriodo);
        const currRankingsData = periodResult.rankings;

        if (Object.keys(prevRankingsData).length > 0) {
          const movements = comparePeriods(prevRankingsData, currRankingsData);
          saveMovements(movements, prevPeriodo, periodo);

          const significant = detectSignificantMovements(movements, thresholds);
          generatedExplanations = generateExplanations(significant);

          const insertAlert = getDB().prepare(
            'INSERT INTO alertas (periodo_fecha, tipo, descripcion, detalle, fecha_creacion) VALUES (?, ?, ?, ?, ?)'
          );
          for (const exp of generatedExplanations) {
            insertAlert.run(periodo, 'MOVIMIENTO_SIGNIFICATIVO', exp.explicacion,
              JSON.stringify(exp), new Date().toISOString());
          }
        }
      }

      summaryByPeriod[periodo] = {
        periodo,
        totalRows: periodResult.totalRows,
        exclusions: {
          ...periodResult.exclusions,
          excludedDetails: undefined
        },
        integrityAlerts: periodResult.integrityAlerts.length,
        coherenceAlerts: periodResult.coherenceAlerts.length,
        explanationsCount: generatedExplanations.length,
        explanations: generatedExplanations,
        reconciliations: {
          R1_ok: periodResult.reconciliations.R1.every(r => r.cuadra),
          R2_ok: periodResult.reconciliations.R2.every(r => r.cuadra),
          R3_ok: periodResult.reconciliations.R3?.cuadra
        }
      };
    }

    // Remove temporary uploaded file to keep workspace clean
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: {
        archivo: req.file.originalname,
        periodos: result.periodos,
        processingTimeMs: result.processingTimeMs,
        results: summaryByPeriod
      }
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error processing file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== SEED DATA ======

router.post('/seed', requireProfile(['administrador']), async (req, res) => {
  try {
    const dataFiles = ['AT03_sintetico_202607.csv', 'AT03_sintetico_202608.csv', 'AT03_sintetico_202609.csv'];
    const catalogs = getCatalogs();
    const allRows = [];

    for (const filename of dataFiles) {
      const filePath = path.join(DATA_DIR, filename);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      const { headers, rows } = parseCSV(content);
      const schemaValidation = validateSchema(headers);
      if (!schemaValidation.valid) {
        return res.status(400).json({ success: false, error: `Esquema inválido en ${filename}`, details: schemaValidation.errors });
      }
      allRows.push(...rows);
    }

    if (allRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No se encontraron datos CSV para procesar' });
    }

    const result = processAT03(allRows, catalogs);
    const sortedPeriodos = result.periodos.sort();
    const thresholds = getThresholdsFromConfig();

    for (let i = 0; i < sortedPeriodos.length; i++) {
      const periodo = sortedPeriodos[i];
      const periodResult = result.results[periodo];
      const supplementary = computeSupplementaryAnalysis(
        periodResult.validRows, catalogs.bancosMap
      );

      savePeriodResults({
        periodo,
        archivoOrigen: `AT03_sintetico_${periodo.slice(0, 6)}.csv`,
        usuario: req.userProfile,
        exclusions: periodResult.exclusions,
        rankings: periodResult.rankings,
        reconciliations: periodResult.reconciliations,
        integrityAlerts: periodResult.integrityAlerts,
        coherenceAlerts: periodResult.coherenceAlerts,
        supplementaryAnalysis: supplementary,
        processingTimeMs: result.processingTimeMs,
        totalRows: periodResult.totalRows
      });

      if (i > 0) {
        const prevPeriodo = sortedPeriodos[i - 1];
        const prevResult = result.results[prevPeriodo];
        const movements = comparePeriods(prevResult.rankings, periodResult.rankings);
        saveMovements(movements, prevPeriodo, periodo);

        const significant = detectSignificantMovements(movements, thresholds);
        const explanations = generateExplanations(significant);

        getDB().prepare("DELETE FROM alertas WHERE periodo_fecha = ? AND tipo = 'MOVIMIENTO_SIGNIFICATIVO'").run(periodo);
        const insertAlert = getDB().prepare(
          'INSERT INTO alertas (periodo_fecha, tipo, descripcion, detalle, fecha_creacion) VALUES (?, ?, ?, ?, ?)'
        );
        for (const exp of explanations) {
          insertAlert.run(periodo, 'MOVIMIENTO_SIGNIFICATIVO', exp.explicacion,
            JSON.stringify(exp), new Date().toISOString());
        }
      }
    }

    // Also compute first-to-last period movements (julio -> septiembre)
    if (sortedPeriodos.length >= 3) {
      const first = sortedPeriodos[0];
      const last = sortedPeriodos[sortedPeriodos.length - 1];
      const longMovements = comparePeriods(result.results[first].rankings, result.results[last].rankings);
      saveMovements(longMovements, first, last);
    }

    res.json({
      success: true,
      message: `Procesados ${sortedPeriodos.length} períodos con ${allRows.length} filas totales`,
      data: {
        periodos: sortedPeriodos,
        processingTimeMs: result.processingTimeMs
      }
    });
  } catch (err) {
    console.error('Error seeding data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== EXPORT ======

router.get('/export/rankings', (req, res) => {
  try {
    const { periodo, ranking, format } = req.query;
    const data = getRankings(periodo, ranking);

    if (format === 'csv') {
      const csv = stringifyCSV(data.map(r => ({
        Fecha: r.periodo_fecha,
        Ranking: r.ranking,
        Posicion: r.posicion,
        Codigo_Banco: r.codigo_banco,
        Banco: r.nombre_banco,
        Saldo_Actividad: r.saldo_actividad,
        Total_Cartera_Local_Valida: r.total_cartera_local_valida,
        Ponderacion_Pct: r.ponderacion_pct,
        Operaciones_Validas: r.operaciones_validas
      })));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=rankings_${periodo || 'all'}${ranking ? '_' + ranking : ''}.csv`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/export/subactividades', (req, res) => {
  try {
    const { periodo, ranking, format } = req.query;
    const data = getSubactividades(periodo, ranking);

    if (format === 'csv') {
      const csv = stringifyCSV(data.map(r => ({
        Fecha: r.periodo_fecha,
        Ranking: r.ranking,
        Subactividad: r.subactividad,
        Codigo_Banco: r.codigo_banco,
        Saldo: r.saldo
      })));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=subactividades_${periodo || 'all'}.csv`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/export/calidad', (req, res) => {
  try {
    const { periodo, format } = req.query;
    const periodos = periodo ? [{ fecha: periodo }] : getPeriodos();

    const data = periodos.map(p => {
      return getDB().prepare('SELECT * FROM periodos WHERE fecha = ?').get(p.fecha);
    }).filter(Boolean);

    if (format === 'csv') {
      const csv = stringifyCSV(data.map(r => ({
        Fecha: r.fecha,
        Total_Filas: r.total_filas,
        E1_Duplicados: r.e1_duplicados,
        E2_Extranjeros: r.e2_extranjeros,
        E3_Saldo_No_Positivo: r.e3_saldo_negativo,
        E4_No_Catalogado: r.e4_no_catalogado,
        Universo_Local_Valido: r.universo_local_valido,
        Reconciliacion_OK: r.reconciliacion_ok ? 'SI' : 'NO'
      })));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=calidad_datos_${periodo || 'all'}.csv`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/export/movimientos', (req, res) => {
  try {
    const { periodoAnterior, periodoActual, ranking, format } = req.query;
    const data = getOrComputeMovements(periodoAnterior, periodoActual, ranking);

    if (format === 'csv') {
      const csv = stringifyCSV(data.map(r => ({
        Periodo_Anterior: r.periodo_anterior,
        Periodo_Actual: r.periodo_actual,
        Ranking: r.ranking,
        Codigo_Banco: r.codigo_banco,
        Banco: r.nombre_banco,
        Posicion_Anterior: r.posicion_anterior,
        Posicion_Actual: r.posicion_actual,
        Cambio_Posicion: r.cambio_posicion,
        Saldo_Anterior: r.saldo_anterior,
        Saldo_Actual: r.saldo_actual,
        Variacion_Saldo: r.variacion_saldo,
        Variacion_Saldo_Pct: r.variacion_saldo_pct,
        Tipo: r.tipo
      })));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=movimientos_${periodoAnterior || 'all'}_${periodoActual || 'all'}.csv`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== ALERTAS ======

router.get('/alertas', (req, res) => {
  try {
    const { periodo } = req.query;
    let query = 'SELECT * FROM alertas';
    const params = [];
    if (periodo) {
      query += ' WHERE periodo_fecha = ?';
      params.push(periodo);
    }
    query += ' ORDER BY id DESC LIMIT 100';
    const data = getDB().prepare(query).all(...params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== BANCOS, CATALOGOS & DICCIONARIO ======

router.get('/bancos', (req, res) => {
  try {
    const catalogs = getCatalogs();
    const bancos = [...catalogs.bancosMap.entries()].map(([code, data]) => ({
      codigo: code,
      nombre: data.Nombre_Ficticio,
      licencia: data.Tipo_Licencia
    }));
    res.json({ success: true, data: bancos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/catalogos/cinu', (req, res) => {
  try {
    const catalogs = getCatalogs();
    const cinu = [...catalogs.cinuMap.entries()].map(([code, data]) => ({
      codigo: code,
      ...data
    }));
    res.json({ success: true, data: cinu });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/catalogos/sb21', (req, res) => {
  try {
    const catalogs = getCatalogs();
    const sb21 = [...catalogs.sb21Map.entries()].map(([code, data]) => ({
      codigo: code,
      ...data
    }));
    res.json({ success: true, data: sb21 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/diccionario', (req, res) => {
  try {
    const dictText = fs.readFileSync(path.join(DATA_DIR, 'Diccionario_datos_AT03_reto.csv'), 'utf-8');
    const { rows } = parseCSV(dictText);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
