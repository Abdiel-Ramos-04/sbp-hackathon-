/**
 * Database Layer - SQLite nativo (node:sqlite)
 * Gestiona la persistencia local para el Hackathon SBP 2026.
 * Arquitectura preparada para replicación/sincronización con PostgreSQL en modalidad remota.
 */

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

export function getDB() {
  if (!db) {
    const dbPath = path.join(__dirname, '..', '..', 'data', 'sbp_hackathon.db');
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    initializeSchema(db);
  }
  return db;
}

function runTransaction(database, fn) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function initializeSchema(database) {
  database.exec(`
    -- Períodos procesados
    CREATE TABLE IF NOT EXISTS periodos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL UNIQUE,
      archivo_origen TEXT,
      fecha_procesamiento TEXT NOT NULL,
      total_filas INTEGER NOT NULL,
      e1_duplicados INTEGER NOT NULL DEFAULT 0,
      e2_extranjeros INTEGER NOT NULL DEFAULT 0,
      e3_saldo_negativo INTEGER NOT NULL DEFAULT 0,
      e4_no_catalogado INTEGER NOT NULL DEFAULT 0,
      universo_local_valido INTEGER NOT NULL DEFAULT 0,
      reconciliacion_ok INTEGER NOT NULL DEFAULT 1,
      processing_time_ms INTEGER DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'completado',
      metricas_independientes TEXT
    );

    -- Rankings calculados
    CREATE TABLE IF NOT EXISTS rankings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_fecha TEXT NOT NULL,
      ranking TEXT NOT NULL,
      posicion INTEGER NOT NULL,
      codigo_banco TEXT NOT NULL,
      nombre_banco TEXT NOT NULL,
      saldo_actividad TEXT NOT NULL,
      total_cartera_local_valida TEXT NOT NULL,
      ponderacion_pct TEXT NOT NULL,
      operaciones_validas INTEGER NOT NULL DEFAULT 0,
      UNIQUE(periodo_fecha, ranking, codigo_banco)
    );

    -- Desglose por subactividad
    CREATE TABLE IF NOT EXISTS subactividades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_fecha TEXT NOT NULL,
      ranking TEXT NOT NULL,
      subactividad TEXT NOT NULL,
      codigo_banco TEXT NOT NULL,
      nombre_banco TEXT NOT NULL,
      saldo TEXT NOT NULL,
      operaciones INTEGER NOT NULL DEFAULT 0,
      UNIQUE(periodo_fecha, ranking, subactividad, codigo_banco)
    );

    -- Movimientos entre períodos
    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_anterior TEXT NOT NULL,
      periodo_actual TEXT NOT NULL,
      ranking TEXT NOT NULL,
      codigo_banco TEXT NOT NULL,
      nombre_banco TEXT NOT NULL,
      posicion_anterior INTEGER,
      posicion_actual INTEGER,
      cambio_posicion INTEGER,
      saldo_anterior TEXT,
      saldo_actual TEXT,
      variacion_saldo TEXT,
      variacion_saldo_pct TEXT,
      tipo TEXT NOT NULL,
      UNIQUE(periodo_anterior, periodo_actual, ranking, codigo_banco)
    );

    -- Alertas e indicadores
    CREATE TABLE IF NOT EXISTS alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      detalle TEXT,
      fecha_creacion TEXT NOT NULL
    );

    -- Historial de auditoría
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accion TEXT NOT NULL,
      usuario TEXT NOT NULL DEFAULT 'sistema',
      detalle TEXT,
      fecha TEXT NOT NULL
    );

    -- Reconciliaciones
    CREATE TABLE IF NOT EXISTS reconciliaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      banco TEXT NOT NULL DEFAULT '',
      ranking TEXT NOT NULL DEFAULT '',
      valor_calculado TEXT NOT NULL,
      valor_esperado TEXT NOT NULL,
      diferencia TEXT NOT NULL,
      cuadra INTEGER NOT NULL DEFAULT 1,
      UNIQUE(periodo_fecha, tipo, banco, ranking)
    );

    -- Configuración de umbrales y sistema híbrido
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descripcion TEXT
    );

    -- Análisis complementarios (morosidad, concentración, vencimientos, etc.)
    CREATE TABLE IF NOT EXISTS analisis_complementario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_fecha TEXT NOT NULL,
      tipo_analisis TEXT NOT NULL,
      codigo_banco TEXT NOT NULL,
      datos TEXT NOT NULL,
      UNIQUE(periodo_fecha, tipo_analisis, codigo_banco)
    );

    -- Exclusiones detalladas
    CREATE TABLE IF NOT EXISTS exclusiones_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo_fecha TEXT NOT NULL,
      fila INTEGER NOT NULL,
      numero_prestamo TEXT,
      motivo TEXT NOT NULL,
      codigo_banco TEXT,
      detalle TEXT,
      UNIQUE(periodo_fecha, fila)
    );

    -- Insert default configuration
    INSERT OR IGNORE INTO configuracion (clave, valor, descripcion)
    VALUES 
      ('umbral_cambio_posicion', '2', 'Mínimo cambio de posición para alerta'),
      ('umbral_variacion_saldo_pct', '10', 'Mínimo % de variación de saldo para alerta'),
      ('detectar_cambio_lider', '1', 'Detectar cambios de líder (1 = sí, 0 = no)'),
      ('modo_operacion', 'local', 'Modo de operación: local o remoto'),
      ('sync_autorizada', '0', 'Autorización explícita para enviar datos a servidor remoto (1 = sí, 0 = no)'),
      ('ia_externa_habilitada', '0', 'Permitir uso de proveedor de IA externo cuando hay conexión');
  `);
}

// ====== OPERATIONS ======

export function savePeriodResults(periodData) {
  const database = getDB();

  const insertPeriodo = database.prepare(`
    INSERT OR REPLACE INTO periodos (fecha, archivo_origen, fecha_procesamiento, 
      total_filas, e1_duplicados, e2_extranjeros, e3_saldo_negativo, 
      e4_no_catalogado, universo_local_valido, reconciliacion_ok, processing_time_ms,
      estado, metricas_independientes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteRankings = database.prepare(`DELETE FROM rankings WHERE periodo_fecha = ?`);
  const insertRanking = database.prepare(`
    INSERT OR REPLACE INTO rankings (periodo_fecha, ranking, posicion, 
      codigo_banco, nombre_banco, saldo_actividad, total_cartera_local_valida, 
      ponderacion_pct, operaciones_validas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteSubactividades = database.prepare(`DELETE FROM subactividades WHERE periodo_fecha = ?`);
  const insertSubactividad = database.prepare(`
    INSERT OR REPLACE INTO subactividades (periodo_fecha, ranking, subactividad,
      codigo_banco, nombre_banco, saldo, operaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteRecon = database.prepare(`DELETE FROM reconciliaciones WHERE periodo_fecha = ?`);
  const insertRecon = database.prepare(`
    INSERT OR REPLACE INTO reconciliaciones (periodo_fecha, tipo, banco, ranking,
      valor_calculado, valor_esperado, diferencia, cuadra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteExclusiones = database.prepare(`DELETE FROM exclusiones_detalle WHERE periodo_fecha = ?`);
  const insertExclusion = database.prepare(`
    INSERT OR REPLACE INTO exclusiones_detalle (periodo_fecha, fila, numero_prestamo,
      motivo, codigo_banco, detalle)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const deleteAlertsQuality = database.prepare(
    `DELETE FROM alertas WHERE periodo_fecha = ? AND tipo IN ('INTEGRIDAD_REFERENCIAL', 'COHERENCIA_SB21')`
  );
  const insertAlert = database.prepare(
    `INSERT INTO alertas (periodo_fecha, tipo, descripcion, detalle, fecha_creacion) VALUES (?, ?, ?, ?, ?)`
  );

  const insertAuditoria = database.prepare(`
    INSERT INTO auditoria (accion, usuario, detalle, fecha)
    VALUES (?, ?, ?, ?)
  `);

  const deleteAnalisis = database.prepare(`DELETE FROM analisis_complementario WHERE periodo_fecha = ?`);
  const insertAnalisis = database.prepare(`
    INSERT OR REPLACE INTO analisis_complementario (periodo_fecha, tipo_analisis,
      codigo_banco, datos)
    VALUES (?, ?, ?, ?)
  `);

  runTransaction(database, () => {
    const {
      periodo, exclusions, rankings, reconciliations,
      supplementaryAnalysis, integrityAlerts = [], coherenceAlerts = []
    } = periodData;

    const totalFilas = periodData.totalRows || exclusions.totalRows || (exclusions.totalExcluidos + exclusions.universoLocalValido);

    insertPeriodo.run(
      periodo,
      periodData.archivoOrigen || 'upload',
      new Date().toISOString(),
      totalFilas,
      exclusions.E1_duplicados,
      exclusions.E2_extranjeros,
      exclusions.E3_saldoNegativo,
      exclusions.E4_noCatalogado,
      exclusions.universoLocalValido,
      exclusions.reconciliacionExclusion ? 1 : 0,
      periodData.processingTimeMs || 0,
      'completado',
      JSON.stringify(exclusions.independentCounts || {})
    );

    deleteRankings.run(periodo);
    deleteSubactividades.run(periodo);

    for (const [macro, rankingData] of Object.entries(rankings)) {
      for (const entry of rankingData.entries) {
        insertRanking.run(
          periodo, macro, entry.posicion,
          entry.codigoBanco, entry.nombreBanco,
          entry.saldoActividad, entry.totalCarteraLocalValida,
          entry.ponderacionPct, entry.operacionesValidas
        );

        for (const sub of entry.subdesglose) {
          insertSubactividad.run(
            periodo, macro, sub.subactividad,
            entry.codigoBanco, entry.nombreBanco,
            sub.saldo, sub.operaciones
          );
        }
      }
    }

    deleteRecon.run(periodo);
    if (reconciliations) {
      for (const r1 of reconciliations.R1) {
        insertRecon.run(periodo, 'R1', r1.banco, r1.ranking,
          r1.sumSubactividades, r1.saldoActividad, r1.diferencia, r1.cuadra ? 1 : 0);
      }
      for (const r2 of reconciliations.R2) {
        insertRecon.run(periodo, 'R2', r2.banco, '',
          r2.sumSaldosMacros, r2.totalCarteraLocalValida, r2.diferencia, r2.cuadra ? 1 : 0);
      }
      if (reconciliations.R3) {
        insertRecon.run(periodo, 'R3', '', '',
          reconciliations.R3.sumTotalCarteras, reconciliations.R3.sumSaldosUniverso,
          reconciliations.R3.diferencia, reconciliations.R3.cuadra ? 1 : 0);
      }
    }

    deleteExclusiones.run(periodo);
    if (exclusions.excludedDetails) {
      for (const exc of exclusions.excludedDetails.slice(0, 5000)) {
        insertExclusion.run(
          periodo, exc.fila, exc.numeroPrestamo || '',
          exc.motivo, exc.banco || '', JSON.stringify(exc)
        );
      }
    }

    deleteAlertsQuality.run(periodo);
    const now = new Date().toISOString();
    for (const alert of integrityAlerts.slice(0, 500)) {
      insertAlert.run(
        periodo,
        'INTEGRIDAD_REFERENCIAL',
        `${alert.tipo}: préstamo ${alert.numeroPrestamo} con valor "${alert.valor}"`,
        JSON.stringify(alert),
        now
      );
    }
    for (const alert of coherenceAlerts.slice(0, 500)) {
      insertAlert.run(
        periodo,
        'COHERENCIA_SB21',
        `${alert.tipo}: préstamo ${alert.numeroPrestamo} (esperado ${alert.facilidadEsperada}, encontrado ${alert.facilidadReal}). ${alert.accion}`,
        JSON.stringify(alert),
        now
      );
    }

    deleteAnalisis.run(periodo);
    if (supplementaryAnalysis) {
      for (const [tipo, datos] of Object.entries(supplementaryAnalysis)) {
        if (datos && typeof datos === 'object') {
          for (const [banco, bancoData] of Object.entries(datos)) {
            insertAnalisis.run(periodo, tipo, banco, JSON.stringify(bancoData));
          }
        }
      }
    }

    insertAuditoria.run(
      'PROCESAMIENTO_PERIODO',
      periodData.usuario || 'sistema',
      JSON.stringify({
        periodo,
        archivo: periodData.archivoOrigen || 'upload',
        totalFilas,
        excluidos: exclusions.totalExcluidos,
        universoValido: exclusions.universoLocalValido,
        reconciliacionOk: exclusions.reconciliacionExclusion
      }),
      now
    );
  });
}

export function saveMovements(movements, periodoAnterior, periodoActual) {
  const database = getDB();
  const insert = database.prepare(`
    INSERT OR REPLACE INTO movimientos (periodo_anterior, periodo_actual, ranking,
      codigo_banco, nombre_banco, posicion_anterior, posicion_actual,
      cambio_posicion, saldo_anterior, saldo_actual, variacion_saldo,
      variacion_saldo_pct, tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  runTransaction(database, () => {
    for (const [macro, entries] of Object.entries(movements)) {
      for (const entry of entries) {
        insert.run(
          periodoAnterior, periodoActual, macro,
          entry.codigoBanco, entry.nombreBanco,
          entry.posicionAnterior, entry.posicionActual,
          entry.cambioPosicion,
          entry.saldoAnterior, entry.saldoActual,
          entry.variacionSaldo, entry.variacionSaldoPct,
          entry.tipo
        );
      }
    }
  });
}

// ====== QUERIES ======

export function getPeriodos() {
  return getDB().prepare('SELECT * FROM periodos ORDER BY fecha DESC').all();
}

export function getRankings(periodo, ranking) {
  let query = 'SELECT * FROM rankings WHERE 1=1';
  const params = [];
  if (periodo) { query += ' AND periodo_fecha = ?'; params.push(periodo); }
  if (ranking) { query += ' AND ranking = ?'; params.push(ranking); }
  query += ' ORDER BY ranking, posicion';
  return getDB().prepare(query).all(...params);
}

export function getSubactividades(periodo, ranking, banco) {
  let query = 'SELECT * FROM subactividades WHERE 1=1';
  const params = [];
  if (periodo) { query += ' AND periodo_fecha = ?'; params.push(periodo); }
  if (ranking) { query += ' AND ranking = ?'; params.push(ranking); }
  if (banco) { query += ' AND codigo_banco = ?'; params.push(banco); }
  query += ' ORDER BY ranking, subactividad, codigo_banco';
  return getDB().prepare(query).all(...params);
}

export function getMovimientos(periodoAnterior, periodoActual, ranking) {
  let query = 'SELECT * FROM movimientos WHERE 1=1';
  const params = [];
  if (periodoAnterior) { query += ' AND periodo_anterior = ?'; params.push(periodoAnterior); }
  if (periodoActual) { query += ' AND periodo_actual = ?'; params.push(periodoActual); }
  if (ranking) { query += ' AND ranking = ?'; params.push(ranking); }
  query += ' ORDER BY ranking, ABS(cambio_posicion) DESC';
  return getDB().prepare(query).all(...params);
}

export function getExclusiones(periodo, motivo = null, limit = 500) {
  let query = 'SELECT * FROM exclusiones_detalle WHERE periodo_fecha = ?';
  const params = [periodo];
  if (motivo) {
    query += ' AND motivo = ?';
    params.push(motivo);
  }
  query += ' ORDER BY fila LIMIT ?';
  params.push(Number(limit));
  return getDB().prepare(query).all(...params);
}

export function getReconciliaciones(periodo) {
  return getDB().prepare(
    'SELECT * FROM reconciliaciones WHERE periodo_fecha = ? ORDER BY tipo, banco, ranking'
  ).all(periodo);
}

export function getAuditoria() {
  return getDB().prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT 150').all();
}

export function logAudit(accion, usuario, detalle) {
  getDB().prepare(
    'INSERT INTO auditoria (accion, usuario, detalle, fecha) VALUES (?, ?, ?, ?)'
  ).run(accion, usuario || 'sistema', typeof detalle === 'string' ? detalle : JSON.stringify(detalle), new Date().toISOString());
}

export function getConfiguracion() {
  return getDB().prepare('SELECT * FROM configuracion').all();
}

export function updateConfiguracion(clave, valor) {
  return getDB().prepare(
    'INSERT OR REPLACE INTO configuracion (clave, valor, descripcion) VALUES (?, ?, COALESCE((SELECT descripcion FROM configuracion WHERE clave = ?), ?))'
  ).run(clave, String(valor), clave, clave);
}

export function getAnalisisComplementario(periodo, tipo) {
  let query = 'SELECT * FROM analisis_complementario WHERE 1=1';
  const params = [];
  if (periodo) { query += ' AND periodo_fecha = ?'; params.push(periodo); }
  if (tipo) { query += ' AND tipo_analisis = ?'; params.push(tipo); }
  return getDB().prepare(query).all(...params);
}

export function getDashboardStats(periodo) {
  const database = getDB();

  if (!periodo) {
    const latest = database.prepare('SELECT fecha FROM periodos ORDER BY fecha DESC LIMIT 1').get();
    if (!latest) return null;
    periodo = latest.fecha;
  }

  const periodInfo = database.prepare('SELECT * FROM periodos WHERE fecha = ?').get(periodo);
  if (!periodInfo) return null;

  const leaders = database.prepare(`
    SELECT ranking, codigo_banco, nombre_banco, saldo_actividad, ponderacion_pct, operaciones_validas
    FROM rankings WHERE periodo_fecha = ? AND posicion = 1
    ORDER BY ranking
  `).all(periodo);

  const totalCartera = database.prepare(`
    SELECT SUM(CAST(total_cartera_local_valida AS REAL)) as total
    FROM rankings WHERE periodo_fecha = ? AND ranking = 'HIPOTECARIO'
  `).get(periodo);

  const banksCount = database.prepare(`
    SELECT COUNT(DISTINCT codigo_banco) as count
    FROM rankings WHERE periodo_fecha = ?
  `).get(periodo);

  const opsCount = database.prepare(`
    SELECT SUM(operaciones_validas) as total
    FROM rankings WHERE periodo_fecha = ?
  `).get(periodo);

  const macroCount = database.prepare(`
    SELECT COUNT(DISTINCT ranking) as count FROM rankings WHERE periodo_fecha = ?
  `).get(periodo);

  return {
    periodo,
    periodInfo,
    leaders,
    totalCartera: totalCartera?.total || 0,
    totalBancos: banksCount?.count || 0,
    totalOperaciones: opsCount?.total || 0,
    totalMacroactividades: macroCount?.count || 0,
    periodos: database.prepare('SELECT fecha FROM periodos ORDER BY fecha').all().map(p => p.fecha)
  };
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
