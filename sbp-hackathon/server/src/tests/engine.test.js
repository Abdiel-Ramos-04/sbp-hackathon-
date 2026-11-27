/**
 * Pruebas Automatizadas del Motor Financiero - Hackathon SBP 2026
 * Verifica el cumplimiento exacto de INDICACIONES_RETO_RANKING_CREDITO.md
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';

import { parseCSV } from '../engine/csvParser.js';
import {
  AT03_FIELDS, MACROACTIVIDADES, validateSchema, loadCatalogs,
  processAT03, comparePeriods, detectSignificantMovements, generateExplanations
} from '../engine/financialEngine.js';
import { runSeed } from '../db/seed.js';
import { getPeriodos, getRankings, getReconciliaciones, closeDB } from '../db/database.js';
import { answerLocalQuery } from '../engine/aiAssistant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function loadOfficialCatalogs() {
  const cinu = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'Catalogo_CINU_SB109_reto.csv'), 'utf-8'));
  const sb21 = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'Tabla_SB21_simplificada.csv'), 'utf-8'));
  const bancos = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'Bancos_ficticios.csv'), 'utf-8'));
  return loadCatalogs(cinu.rows, sb21.rows, bancos.rows);
}

test('1. Catálogos oficiales se cargan correctamente con ceros a la izquierda', () => {
  const catalogs = loadOfficialCatalogs();
  assert.equal(catalogs.bancosMap.size, 12);
  assert.equal(catalogs.cinuMap.size, 22);
  assert.equal(catalogs.sb21Map.size, 6);
  assert.ok(catalogs.sb21Map.has('07'), 'Debe conservar cero a la izquierda en código 07');
  assert.ok(catalogs.sb21Map.has('03'), 'Debe conservar cero a la izquierda en código 03');
  assert.equal(catalogs.bancosMap.get('101').Nombre_Ficticio, 'Banco Istmo');
});

test('2. Esquema AT03 de los 3 archivos oficiales (61 columnas exactas) y preservación de ceros', () => {
  const files = [
    { name: 'AT03_sintetico_202607.csv', expectedRows: 25000 },
    { name: 'AT03_sintetico_202608.csv', expectedRows: 27500 },
    { name: 'AT03_sintetico_202609.csv', expectedRows: 30000 }
  ];

  for (const f of files) {
    const content = fs.readFileSync(path.join(DATA_DIR, f.name), 'utf-8');
    const { headers, rows } = parseCSV(content);
    const schema = validateSchema(headers);
    assert.equal(schema.valid, true, `Esquema inválido en ${f.name}: ${schema.errors.join(', ')}`);
    assert.equal(headers.length, 61);
    assert.deepEqual(headers, AT03_FIELDS);
    assert.equal(rows.length, f.expectedRows);
    assert.ok(rows.some(r => r.Facilidad_Crediticia === '07'), `${f.name} debe conservar '07' como texto`);
    assert.ok(rows.some(r => r.Tipo_Credito === '001'), `${f.name} debe conservar '001' como texto`);
  }
});

test('3. Procesamiento determinista completo de los 3 períodos (E1-E4, SB21, 12 bancos, Reconciliaciones R1/R2/R3)', () => {
  const catalogs = loadOfficialCatalogs();
  const files = ['AT03_sintetico_202607.csv', 'AT03_sintetico_202608.csv', 'AT03_sintetico_202609.csv'];
  const allRows = [];
  for (const f of files) {
    allRows.push(...parseCSV(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')).rows);
  }

  const processed = processAT03(allRows, catalogs);
  assert.deepEqual(processed.periodos, ['20260731', '20260831', '20260930']);

  for (const periodo of processed.periodos) {
    const pRes = processed.results[periodo];
    const exc = pRes.exclusions;

    // Verificar ecuación fundamental de exclusiones en cascada
    assert.equal(
      exc.E1_duplicados + exc.E2_extranjeros + exc.E3_saldoNegativo + exc.E4_noCatalogado + exc.universoLocalValido,
      pRes.totalRows,
      `Falla ecuación de cascada en ${periodo}`
    );
    assert.equal(exc.reconciliacionExclusion, true);

    // Verificar unicidad de Numero_Prestamo en universo local válido
    const uniqueLoans = new Set(pRes.validRows.map(r => r.Numero_Prestamo));
    assert.equal(uniqueLoans.size, pRes.validRows.length, `Hay préstamos duplicados en universo válido de ${periodo}`);

    // Verificar 6 rankings, cada uno con 12 bancos y posiciones 1..12 sin huecos
    for (const macro of MACROACTIVIDADES) {
      const r = pRes.rankings[macro];
      assert.ok(r, `Falta ranking ${macro} en ${periodo}`);
      assert.equal(r.entries.length, 12);
      assert.deepEqual(r.entries.map(e => e.posicion), [1,2,3,4,5,6,7,8,9,10,11,12]);

      // Verificar orden descendente de saldo (con desempate por Codigo_Banco asc)
      for (let i = 1; i < r.entries.length; i++) {
        const prev = new Decimal(r.entries[i - 1].saldoActividad);
        const curr = new Decimal(r.entries[i].saldoActividad);
        assert.ok(prev.gte(curr), `Orden incorrecto en ${macro} ${periodo}`);
      }
    }

    // Verificar denominador idéntico entre los 6 rankings para cada banco
    for (const banco of catalogs.bancosMap.keys()) {
      const denoms = new Set(
        MACROACTIVIDADES.map(m =>
          pRes.rankings[m].entries.find(e => e.codigoBanco === banco).totalCarteraLocalValida
        )
      );
      assert.equal(denoms.size, 1, `Denominador distinto entre rankings para banco ${banco} en ${periodo}`);
    }

    // Verificar Reconciliaciones R1, R2 y R3 al centavo
    assert.ok(pRes.reconciliations.R1.every(r => r.cuadra), `Falla R1 en ${periodo}`);
    assert.ok(pRes.reconciliations.R2.every(r => r.cuadra), `Falla R2 en ${periodo}`);
    assert.equal(pRes.reconciliations.R3.cuadra, true, `Falla R3 en ${periodo}`);
  }
});

test('4. Regla especial de CONSUMO (SB21): reclasifica Crédito personal + facilidad 07 a Tarjeta sin alterar total CONSUMO', () => {
  const catalogs = loadOfficialCatalogs();
  const sampleRows = [
    { Fecha: '20260930', Codigo_Banco: '101', Destino: 'L', Saldo: '1000.00', Numero_Prestamo: '101-CR-1', Tipo_Actividad: 'K.64.649.6492.64921', Facilidad_Crediticia: '07' },
    { Fecha: '20260930', Codigo_Banco: '101', Destino: 'L', Saldo: '2500.00', Numero_Prestamo: '101-CR-2', Tipo_Actividad: 'K.64.649.6492.64921', Facilidad_Crediticia: '01' },
    { Fecha: '20260930', Codigo_Banco: '101', Destino: 'L', Saldo: '3000.00', Numero_Prestamo: '101-CR-3', Tipo_Actividad: 'K.64.649.6499.64991', Facilidad_Crediticia: '07' },
    { Fecha: '20260930', Codigo_Banco: '101', Destino: 'L', Saldo: '4000.00', Numero_Prestamo: '101-CR-4', Tipo_Actividad: 'K.64.649.6492.64922', Facilidad_Crediticia: '03' }
  ];

  const processed = processAT03(sampleRows, catalogs);
  const res = processed.results['20260930'];
  const entry101 = res.rankings.CONSUMO.entries.find(e => e.codigoBanco === '101');

  assert.equal(entry101.saldoActividad, '10500.00');
  const tarjeta = entry101.subdesglose.find(s => s.subactividad === 'Tarjeta');
  const personal = entry101.subdesglose.find(s => s.subactividad === 'Credito personal');
  const auto = entry101.subdesglose.find(s => s.subactividad === 'Automovil');

  assert.equal(tarjeta.saldo, '4000.00', 'Debe sumar 1000 reclasificado + 3000 original = 4000.00');
  assert.equal(personal.saldo, '2500.00', 'Debe excluir los 1000 reclasificados a Tarjeta');
  assert.equal(auto.saldo, '4000.00');
});

test('5. Comparación intermensual, detección de movimientos significativos y explicaciones automáticas', () => {
  const catalogs = loadOfficialCatalogs();
  const rowsJul = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'AT03_sintetico_202607.csv'), 'utf-8')).rows;
  const rowsAgo = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'AT03_sintetico_202608.csv'), 'utf-8')).rows;
  const rowsSep = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'AT03_sintetico_202609.csv'), 'utf-8')).rows;

  const processed = processAT03([...rowsJul, ...rowsAgo, ...rowsSep], catalogs);
  const movJulAgo = comparePeriods(processed.results['20260731'].rankings, processed.results['20260831'].rankings);
  const movAgoSep = comparePeriods(processed.results['20260831'].rankings, processed.results['20260930'].rankings);

  assert.ok(movJulAgo.HIPOTECARIO.length === 12);
  assert.ok(movAgoSep.INDUSTRIA.length === 12);

  const sig = detectSignificantMovements(movAgoSep, { minPositionChange: 2, minSaldoChangePct: 10, detectLeaderChange: true });
  const explanations = generateExplanations(sig);
  assert.ok(Array.isArray(explanations));
  for (const e of explanations) {
    assert.ok(e.explicacion.length > 10);
  }
});

test('6. Persistencia SQLite (seed) y consultas offline del asistente analítico', async () => {
  const seedRes = await runSeed({ silent: true });
  assert.equal(seedRes.periodos.length, 3);

  const periodos = getPeriodos();
  assert.equal(periodos.length, 3);

  const hipSep = getRankings('20260930', 'HIPOTECARIO');
  assert.equal(hipSep.length, 12);
  assert.equal(hipSep[0].posicion, 1);

  const reconSep = getReconciliaciones('20260930');
  assert.ok(reconSep.length > 0);
  assert.ok(reconSep.every(r => r.cuadra === 1));

  const aiResp = answerLocalQuery('¿Qué banco lidera el ranking de INDUSTRIA en septiembre?');
  assert.equal(aiResp.mode, 'local_deterministic');
  assert.ok(aiResp.answer.includes('INDUSTRIA'));

  closeDB();
});
