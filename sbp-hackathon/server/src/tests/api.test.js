/**
 * Pruebas de Integración API, Perfiles (RBAC) y Exportaciones - Hackathon SBP 2026
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from '../routes/api.js';
import { runSeed } from '../db/seed.js';
import { closeDB } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

let server;
let baseUrl;

test.before(async () => {
  await runSeed({ silent: true });
  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}/api`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  closeDB();
});

test('API 1. Dashboard y Rankings públicos responden correctamente', async () => {
  const dash = await fetch(`${baseUrl}/dashboard?periodo=20260930`).then(r => r.json());
  assert.equal(dash.success, true);
  assert.equal(dash.data.totalBancos, 12);
  assert.equal(dash.data.totalMacroactividades, 6);
  assert.equal(dash.data.leaders.length, 6);

  const rank = await fetch(`${baseUrl}/rankings?periodo=20260930&ranking=HIPOTECARIO`).then(r => r.json());
  assert.equal(rank.success, true);
  assert.equal(rank.data.length, 12);
});

test('API 2. Control de acceso por perfil (Público, Analista, Administrador)', async () => {
  // Público no puede actualizar configuración
  const pubCfg = await fetch(`${baseUrl}/configuracion/umbral_cambio_posicion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Profile': 'publico' },
    body: JSON.stringify({ valor: '3' })
  });
  assert.equal(pubCfg.status, 403);

  // Público no puede comparar entidades ni usar IA
  const pubComp = await fetch(`${baseUrl}/comparar?periodo=20260930&bancos=101,102`, {
    headers: { 'X-User-Profile': 'publico' }
  });
  assert.equal(pubComp.status, 403);

  // Analista sí puede comparar entidades y consultar asistente IA
  const anaComp = await fetch(`${baseUrl}/comparar?periodo=20260930&bancos=101,102`, {
    headers: { 'X-User-Profile': 'analista' }
  });
  assert.equal(anaComp.status, 200);

  const anaIA = await fetch(`${baseUrl}/asistente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Profile': 'analista' },
    body: JSON.stringify({ pregunta: '¿Qué banco lidera INDUSTRIA en septiembre?', periodo: '20260930' })
  }).then(r => r.json());
  assert.equal(anaIA.success, true);
  assert.ok(anaIA.data.answer.includes('INDUSTRIA'));

  // Analista no puede modificar configuración (solo Administrador)
  const anaCfg = await fetch(`${baseUrl}/configuracion/umbral_cambio_posicion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Profile': 'analista' },
    body: JSON.stringify({ valor: '3' })
  });
  assert.equal(anaCfg.status, 403);

  // Administrador sí puede modificar y restaurar configuración
  const admCfg = await fetch(`${baseUrl}/configuracion/umbral_cambio_posicion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Profile': 'administrador' },
    body: JSON.stringify({ valor: '2' })
  });
  assert.equal(admCfg.status, 200);
});

test('API 3. Exportaciones CSV oficiales (Entregables 2, 3, 4 y 5)', async () => {
  const rCsv = await fetch(`${baseUrl}/export/rankings?periodo=20260930&ranking=HIPOTECARIO&format=csv`).then(r => r.text());
  assert.ok(rCsv.startsWith('Fecha,Ranking,Posicion,Codigo_Banco,Banco,Saldo_Actividad,Total_Cartera_Local_Valida,Ponderacion_Pct,Operaciones_Validas'));

  const sCsv = await fetch(`${baseUrl}/export/subactividades?periodo=20260930&ranking=CONSUMO&format=csv`).then(r => r.text());
  assert.ok(sCsv.startsWith('Fecha,Ranking,Subactividad,Codigo_Banco,Saldo'));

  const cCsv = await fetch(`${baseUrl}/export/calidad?format=csv`).then(r => r.text());
  assert.ok(cCsv.startsWith('Fecha,Total_Filas,E1_Duplicados,E2_Extranjeros,E3_Saldo_No_Positivo,E4_No_Catalogado,Universo_Local_Valido,Reconciliacion_OK'));

  const mCsv = await fetch(`${baseUrl}/export/movimientos?periodoAnterior=20260831&periodoActual=20260930&format=csv`).then(r => r.text());
  assert.ok(mCsv.includes('Periodo_Anterior,Periodo_Actual,Ranking,Codigo_Banco'));
});

test('API 4. Arquitectura Híbrida y Carga de Archivo Inválido vs Válido', async () => {
  const hyb = await fetch(`${baseUrl}/hibrido/estado`).then(r => r.json());
  assert.equal(hyb.success, true);
  assert.equal(hyb.data.localEngineReady, true);
  assert.equal(hyb.data.sqliteConnected, true);

  // Sincronización sin autorización debe bloquearse
  const syncBlocked = await fetch(`${baseUrl}/hibrido/sincronizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Profile': 'administrador' },
    body: JSON.stringify({ authorized: false })
  }).then(r => r.json());
  assert.equal(syncBlocked.success, false);
  assert.equal(syncBlocked.data.blocked, true);

  // Carga de archivo inválido (esquema incorrecto) debe rechazarse con 400
  const badForm = new FormData();
  badForm.append('file', new Blob(['col1,col2\n1,2\n'], { type: 'text/csv' }), 'invalido.csv');
  const badResp = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { 'X-User-Profile': 'administrador' },
    body: badForm
  });
  assert.equal(badResp.status, 400);

  // Carga de archivo válido (tomamos 202607 y cambiamos fecha a 20261031 para simular nuevo corte automático)
  const julCsv = fs.readFileSync(path.join(DATA_DIR, 'AT03_sintetico_202607.csv'), 'utf-8');
  const lines = julCsv.split(/\r?\n/).slice(0, 101); // header + 100 rows
  const octCsv = [lines[0], ...lines.slice(1).map(l => l.replace(/^20260731,/, '20261031,'))].join('\r\n');

  const okForm = new FormData();
  okForm.append('file', new Blob([octCsv], { type: 'text/csv' }), 'AT03_test_202610.csv');
  const okResp = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { 'X-User-Profile': 'administrador' },
    body: okForm
  }).then(r => r.json());
  assert.equal(okResp.success, true);
  assert.deepEqual(okResp.data.periodos, ['20261031']);

  // Limpiar período sintético de prueba
  const delResp = await fetch(`${baseUrl}/periodos/20261031`, {
    method: 'DELETE',
    headers: { 'X-User-Profile': 'administrador' }
  });
  assert.equal(delResp.status, 200);
});
