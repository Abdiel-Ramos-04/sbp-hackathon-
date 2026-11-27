/**
 * Script de Inicialización de Datos (Seed) - Hackathon SBP 2026
 * Procesa los tres períodos oficiales (julio, agosto, septiembre 2026)
 * usando el motor determinista y guarda todo en SQLite.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../engine/csvParser.js';
import {
  processAT03, loadCatalogs, comparePeriods,
  detectSignificantMovements, generateExplanations,
  validateSchema, computeSupplementaryAnalysis
} from '../engine/financialEngine.js';
import {
  savePeriodResults, saveMovements, getPeriodos,
  getConfiguracion, getDB, closeDB
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export async function runSeed({ silent = false } = {}) {
  const cinuText = fs.readFileSync(path.join(DATA_DIR, 'Catalogo_CINU_SB109_reto.csv'), 'utf-8');
  const sb21Text = fs.readFileSync(path.join(DATA_DIR, 'Tabla_SB21_simplificada.csv'), 'utf-8');
  const bancosText = fs.readFileSync(path.join(DATA_DIR, 'Bancos_ficticios.csv'), 'utf-8');

  const catalogs = loadCatalogs(
    parseCSV(cinuText).rows,
    parseCSV(sb21Text).rows,
    parseCSV(bancosText).rows
  );

  const dataFiles = [
    'AT03_sintetico_202607.csv',
    'AT03_sintetico_202608.csv',
    'AT03_sintetico_202609.csv'
  ];

  const allRows = [];
  for (const filename of dataFiles) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      if (!silent) console.warn(`[Seed] Archivo no encontrado: ${filename}`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const { headers, rows } = parseCSV(content);
    const schema = validateSchema(headers);
    if (!schema.valid) {
      throw new Error(`Esquema inválido en ${filename}: ${schema.errors.join('; ')}`);
    }
    if (!silent) console.log(`[Seed] Leído ${filename}: ${rows.length} filas`);
    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    throw new Error('No se encontraron archivos AT03 para inicializar la base de datos.');
  }

  const result = processAT03(allRows, catalogs);
  const sortedPeriodos = result.periodos.sort();
  const config = getConfiguracion();
  const thresholds = {
    minPositionChange: parseInt(config.find(c => c.clave === 'umbral_cambio_posicion')?.valor || '2', 10),
    minSaldoChangePct: parseFloat(config.find(c => c.clave === 'umbral_variacion_saldo_pct')?.valor || '10'),
    detectLeaderChange: config.find(c => c.clave === 'detectar_cambio_lider')?.valor !== '0'
  };

  for (let i = 0; i < sortedPeriodos.length; i++) {
    const periodo = sortedPeriodos[i];
    const periodResult = result.results[periodo];
    const supplementary = computeSupplementaryAnalysis(periodResult.validRows, catalogs.bancosMap);

    savePeriodResults({
      periodo,
      archivoOrigen: `AT03_sintetico_${periodo.slice(0, 6)}.csv`,
      usuario: 'seed_automatico',
      exclusions: periodResult.exclusions,
      rankings: periodResult.rankings,
      reconciliations: periodResult.reconciliations,
      integrityAlerts: periodResult.integrityAlerts,
      coherenceAlerts: periodResult.coherenceAlerts,
      supplementaryAnalysis: supplementary,
      processingTimeMs: result.processingTimeMs,
      totalRows: periodResult.totalRows
    });

    if (!silent) {
      const exc = periodResult.exclusions;
      console.log(
        `[Seed] Período ${periodo}: filas=${periodResult.totalRows}, E1=${exc.E1_duplicados}, E2=${exc.E2_extranjeros}, E3=${exc.E3_saldoNegativo}, E4=${exc.E4_noCatalogado}, válido=${exc.universoLocalValido}, recon=${exc.reconciliacionExclusion}`
      );
    }

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
        insertAlert.run(periodo, 'MOVIMIENTO_SIGNIFICATIVO', exp.explicacion, JSON.stringify(exp), new Date().toISOString());
      }
    }
  }

  // Comparación acumulada Julio -> Septiembre
  if (sortedPeriodos.length >= 3) {
    const first = sortedPeriodos[0];
    const last = sortedPeriodos[sortedPeriodos.length - 1];
    const longMovements = comparePeriods(result.results[first].rankings, result.results[last].rankings);
    saveMovements(longMovements, first, last);
  }

  return {
    periodos: sortedPeriodos,
    totalRows: allRows.length,
    processingTimeMs: result.processingTimeMs
  };
}

// Run if executed directly
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  runSeed()
    .then(res => {
      console.log('[Seed] Completado exitosamente:', res);
      closeDB();
    })
    .catch(err => {
      console.error('[Seed] Error:', err);
      process.exit(1);
    });
}
