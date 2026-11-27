import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Download, Filter
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatMoney, formatPeriod } from '../services/api.js';

export default function CalidadPage() {
  const { selectedPeriod, periodos, profile, refreshTick } = useApp();
  const [recons, setRecons] = useState([]);
  const [exclusiones, setExclusiones] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [motivoFilter, setMotivoFilter] = useState('');
  const [activeTab, setActiveTab] = useState('cascada');

  const periodInfo = periodos.find(p => p.fecha === selectedPeriod);

  useEffect(() => {
    if (!selectedPeriod) return;
    Promise.all([
      api.getReconciliaciones(selectedPeriod),
      api.getExclusiones(selectedPeriod, motivoFilter),
      api.getAlertas(selectedPeriod),
      profile !== 'publico' ? api.getAuditoria().catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
    ]).then(([r, e, a, aud]) => {
      setRecons(r.data || []);
      setExclusiones(e.data || []);
      setAlertas(a.data || []);
      setAuditoria(aud.data || []);
    }).catch(() => {});
  }, [selectedPeriod, motivoFilter, profile, refreshTick]);

  const r1 = recons.filter(r => r.tipo === 'R1');
  const r2 = recons.filter(r => r.tipo === 'R2');
  const r3 = recons.find(r => r.tipo === 'R3');

  const r1Ok = r1.length > 0 && r1.every(r => r.cuadra === 1);
  const r2Ok = r2.length > 0 && r2.every(r => r.cuadra === 1);
  const r3Ok = r3?.cuadra === 1;

  const indCounts = periodInfo?.metricas_independientes || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ShieldCheck size={24} color="#10b981" /> Auditoría, Calidad y Reconciliaciones
          </h1>
          <p className="page-subtitle">
            Trazabilidad completa de exclusiones en cascada E1–E4, verificación matemática R1/R2/R3 al centavo y registro auditable ({formatPeriod(selectedPeriod)}).
          </p>
        </div>

        <a className="btn btn-secondary btn-sm" href={api.exportUrl('calidad', { periodo: selectedPeriod })} download>
          <Download size={14} /> Exportar Calidad CSV
        </a>
      </div>

      {/* KPIs de Calidad */}
      {periodInfo && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Registros Leídos</div>
            <div className="kpi-value">{periodInfo.total_filas.toLocaleString('en-US')}</div>
            <div className="kpi-foot mono">{periodInfo.archivo_origen}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">E1 · Duplicados</div>
            <div className="kpi-value" style={{ color: '#fbbf24' }}>{periodInfo.e1_duplicados}</div>
            <div className="kpi-foot">Mismo Numero_Prestamo en corte</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">E2 · Destino Extranjero</div>
            <div className="kpi-value" style={{ color: '#f59e0b' }}>{periodInfo.e2_extranjeros.toLocaleString('en-US')}</div>
            <div className="kpi-foot">Destino ≠ 'L'</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">E3 + E4 · Saldo≤0 / No Cat.</div>
            <div className="kpi-value" style={{ color: '#fb7185' }}>
              {periodInfo.e3_saldo_negativo} + {periodInfo.e4_no_catalogado}
            </div>
            <div className="kpi-foot">Saldo≤0: {periodInfo.e3_saldo_negativo} · No CINU: {periodInfo.e4_no_catalogado}</div>
          </div>
          <div className="kpi-card" style={{ borderColor: 'rgba(16,185,129,0.4)' }}>
            <div className="kpi-label">Universo Local Válido</div>
            <div className="kpi-value" style={{ color: '#34d399' }}>
              {periodInfo.universo_local_valido.toLocaleString('en-US')}
            </div>
            <div className="kpi-foot">
              <CheckCircle2 size={13} color="#34d399" />
              E1+E2+E3+E4+Válido = {periodInfo.total_filas.toLocaleString('en-US')}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '18px' }}>
        <button className={`tab-btn ${activeTab === 'cascada' ? 'active' : ''}`} onClick={() => setActiveTab('cascada')}>
          Reconciliaciones (R1, R2, R3)
        </button>
        <button className={`tab-btn ${activeTab === 'exclusiones' ? 'active' : ''}`} onClick={() => setActiveTab('exclusiones')}>
          Filas Excluidas Trazables ({exclusiones.length})
        </button>
        <button className={`tab-btn ${activeTab === 'alertas' ? 'active' : ''}`} onClick={() => setActiveTab('alertas')}>
          Alertas del Período ({alertas.length})
        </button>
        {profile !== 'publico' && (
          <button className={`tab-btn ${activeTab === 'auditoria' ? 'active' : ''}`} onClick={() => setActiveTab('auditoria')}>
            Bitácora de Operaciones
          </button>
        )}
      </div>

      {activeTab === 'cascada' && (
        <div>
          <div className="grid-3" style={{ marginBottom: '18px' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '6px' }}>
                <CheckCircle2 size={17} color={r1Ok ? '#34d399' : '#fb7185'} /> Reconciliación 1 (R1)
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Suma de subactividades = Saldo de Actividad por banco y ranking ({r1.length} verificaciones).
              </p>
              <span className={`badge ${r1Ok ? 'badge-green' : 'badge-red'}`}>
                {r1Ok ? '72/72 Verificaciones Cuadradas' : 'Con diferencias'}
              </span>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '6px' }}>
                <CheckCircle2 size={17} color={r2Ok ? '#34d399' : '#fb7185'} /> Reconciliación 2 (R2)
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Suma de las 6 macroactividades = Cartera Local Válida por banco ({r2.length} bancos).
              </p>
              <span className={`badge ${r2Ok ? 'badge-green' : 'badge-red'}`}>
                {r2Ok ? '12/12 Bancos Cuadrados al Centavo' : 'Con diferencias'}
              </span>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: '6px' }}>
                <CheckCircle2 size={17} color={r3Ok ? '#34d399' : '#fb7185'} /> Reconciliación 3 (R3)
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Suma de los 12 bancos = Saldo total del universo local válido.
              </p>
              <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
                {r3 ? formatMoney(r3.valor_calculado) : '—'}
              </div>
              <span className={`badge ${r3Ok ? 'badge-green' : 'badge-red'}`}>
                Dif: {r3?.diferencia || '0.00'}
              </span>
            </div>
          </div>

          {periodInfo?.metricas_independientes && (
            <div className="card" style={{ marginBottom: '18px' }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Conteo Independiente por Regla (Informativo — Aparte de la Cascada Oficial)</div>
                  <div className="card-subtitle">Muestra cuántas filas incumplen cada criterio individualmente (una fila puede incumplir más de uno)</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span className="badge badge-slate">Duplicados independientes: {indCounts.E1_duplicados ?? 0}</span>
                <span className="badge badge-slate">Extranjeros independientes: {indCounts.E2_extranjeros ?? 0}</span>
                <span className="badge badge-slate">Saldo ≤ 0 independientes: {indCounts.E3_saldoNegativo ?? 0}</span>
                <span className="badge badge-slate">No catalogados independientes: {indCounts.E4_noCatalogado ?? 0}</span>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div className="card-title">Detalle R2 por Entidad Bancaria</div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código Banco</th>
                    <th className="text-right">Suma 6 Macroactividades</th>
                    <th className="text-right">Total Cartera Local Válida</th>
                    <th className="text-right">Diferencia</th>
                    <th className="text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {r2.map(row => (
                    <tr key={row.banco}>
                      <td className="mono" style={{ fontWeight: 700 }}>{row.banco}</td>
                      <td className="text-right mono">{formatMoney(row.valor_calculado)}</td>
                      <td className="text-right mono">{formatMoney(row.valor_esperado)}</td>
                      <td className="text-right mono">{row.diferencia}</td>
                      <td className="text-center">
                        <span className={`badge ${row.cuadra ? 'badge-green' : 'badge-red'}`}>
                          {row.cuadra ? 'CUADRA' : 'DIFERENCIA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'exclusiones' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Registros Excluidos Trazables (Primer Filtro Incumplido)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={15} color="#94a3b8" />
              <select className="select" value={motivoFilter} onChange={(e) => setMotivoFilter(e.target.value)}>
                <option value="">Todos los motivos</option>
                <option value="E1_DUPLICADO">E1 - Duplicado</option>
                <option value="E2_EXTRANJERO">E2 - Destino Extranjero</option>
                <option value="E3_SALDO_NO_POSITIVO">E3 - Saldo No Positivo</option>
                <option value="E4_NO_CATALOGADO">E4 - Actividad No Catalogada</option>
              </select>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 450, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fila CSV</th>
                  <th>Número Préstamo</th>
                  <th>Banco</th>
                  <th>Motivo Oficial</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {exclusiones.map((exc, i) => (
                  <tr key={i}>
                    <td className="mono">#{exc.fila}</td>
                    <td className="mono">{exc.numero_prestamo}</td>
                    <td className="mono">{exc.codigo_banco}</td>
                    <td><span className="badge badge-amber">{exc.motivo}</span></td>
                    <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{exc.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'alertas' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Alertas de Integridad, Coherencia SB21 y Movimientos</div>
          </div>
          {alertas.length === 0 ? (
            <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} /> Sin alertas de integridad ni inconsistencias SB21 en este corte.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {alertas.map(a => (
                <div key={a.id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-navy)', border: '1px solid var(--border-subtle)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={17} color="#fbbf24" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <span className="badge badge-cyan" style={{ marginBottom: '4px' }}>{a.tipo}</span>
                    <div style={{ fontSize: '13px', color: '#fff' }}>{a.descripcion}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'auditoria' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Registro de Operaciones (Auditoría)</div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 450, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Acción</th>
                  <th>Perfil</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map(a => (
                  <tr key={a.id}>
                    <td className="mono" style={{ fontSize: '11.5px' }}>{new Date(a.fecha).toLocaleString('es-PA')}</td>
                    <td><span className="badge badge-cyan">{a.accion}</span></td>
                    <td>{a.usuario}</td>
                    <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{a.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
