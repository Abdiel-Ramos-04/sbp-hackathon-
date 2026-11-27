import React, { useState, useRef } from 'react';
import {
  DatabaseZap, UploadCloud, CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Sparkles
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatPeriod } from '../services/api.js';

const PIPELINE_STEPS = [
  '1. Recepción del archivo CSV',
  '2. Identificación automática del período (campo Fecha)',
  '3. Validación del formato UTF-8 / delimitadores',
  '4. Comprobación de las 61 columnas AT03',
  '5. Validación exacta de nombres y orden de campos',
  '6. Verificación de catálogos (CINU, SB21, Bancos)',
  '7. Detección de errores e integridad referencial',
  '8. Depuración en cascada (E1 → E2 → E3 → E4)',
  '9. Clasificación de actividades y regla SB21 CONSUMO',
  '10. Cálculo determinista de los 6 rankings y ponderaciones',
  '11. Comparación automática con períodos anteriores',
  '12. Actualización de estadísticas, gráficos y SQLite',
  '13. Generación automática de explicaciones y reportes',
  '14. Registro auditable de la operación'
];

export default function DatosPage() {
  const { periodos, triggerRefresh, addToast } = useApp();
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setProcessing(true);
    setUploadResult(null);
    setUploadError(null);
    setActiveStep(0);

    // Animate stages cleanly during upload/processing
    const timer = setInterval(() => {
      setActiveStep(prev => (prev < 11 ? prev + 1 : prev));
    }, 110);

    try {
      const res = await api.uploadAT03(file);
      clearInterval(timer);
      setActiveStep(13);
      setUploadResult(res.data);
      addToast(`Archivo ${file.name} procesado exitosamente`, 'success');
      triggerRefresh();
    } catch (err) {
      clearInterval(timer);
      setUploadError({
        message: err.message,
        details: err.details || []
      });
      addToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleReseed = async () => {
    setProcessing(true);
    setUploadError(null);
    setActiveStep(3);
    try {
      const res = await api.seedData();
      setActiveStep(13);
      addToast(res.message || 'Períodos oficiales reprocesados', 'success');
      triggerRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (fecha) => {
    try {
      await api.deletePeriodo(fecha);
      addToast(`Período ${fecha} eliminado`, 'info');
      triggerRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <DatabaseZap size={24} color="#00d2ff" /> Gestión Automatizada de Datos AT03
          </h1>
          <p className="page-subtitle">
            Importa un nuevo corte mensual AT03 (.csv). El motor detecta el período por el campo Fecha, valida las 61 columnas, depura E1–E4, recalcula los 6 rankings y compara automáticamente.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={handleReseed} disabled={processing}>
          <RefreshCw size={15} /> Reprocesar 3 Cortes Oficiales
        </button>
      </div>

      <div className="grid-sidebar-layout" style={{ marginBottom: '20px' }}>
        {/* Dropzone */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Cargar Archivo Regulatorio AT03</div>
            <span className="badge badge-cyan">Solo Perfil Administrador</span>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => !processing && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#00d2ff' : 'rgba(148,163,184,0.28)'}`,
              borderRadius: '14px',
              padding: '38px 20px',
              textAlign: 'center',
              cursor: processing ? 'wait' : 'pointer',
              background: dragging ? 'rgba(0,210,255,0.08)' : 'rgba(6,11,22,0.55)',
              transition: 'all 0.2s ease'
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <UploadCloud size={42} color="#00d2ff" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
              {processing ? 'Ejecutando pipeline determinista...' : 'Arrastra tu archivo AT03 (.csv) aquí o haz clic para seleccionar'}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Requiere exactamente las 61 columnas oficiales en UTF-8, conservando ceros a la izquierda.
            </div>
          </div>

          {uploadError && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(244,63,94,0.12)',
                border: '1px solid rgba(244,63,94,0.4)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fb7185', fontWeight: 700, marginBottom: '6px' }}>
                <XCircle size={17} /> Archivo Rechazado — No se actualizaron los rankings
              </div>
              <div style={{ fontSize: '13px', color: '#fecdd3' }}>{uploadError.message}</div>
              {uploadError.details?.length > 0 && (
                <ul style={{ marginTop: '8px', paddingLeft: '18px', fontSize: '12px', color: '#fda4af' }}>
                  {uploadError.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          )}

          {uploadResult && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.4)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, marginBottom: '8px' }}>
                <CheckCircle2 size={17} /> Procesamiento Completado ({uploadResult.processingTimeMs} ms)
              </div>
              {Object.values(uploadResult.results || {}).map(r => (
                <div key={r.periodo} style={{ fontSize: '12.5px', color: '#d1fae5', marginBottom: '6px' }}>
                  <strong>Período {formatPeriod(r.periodo)} ({r.periodo}):</strong> {r.totalRows} filas → {r.exclusions.universoLocalValido} válidas · Reconciliaciones R1/R2/R3: {r.reconciliations.R1_ok && r.reconciliations.R2_ok && r.reconciliations.R3_ok ? 'CUADRADAS' : 'ALERTA'} · {r.explanationsCount} movimientos significativos detectados.
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 14-Stage Pipeline View */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Sparkles size={16} color="#00d2ff" /> Etapas de Automatización (14 Pasos)</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto' }}>
            {PIPELINE_STEPS.map((step, i) => {
              const done = activeStep > i || (!processing && activeStep === 13);
              const running = processing && activeStep === i;
              return (
                <div
                  key={step}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: running ? 'rgba(0,210,255,0.14)' : done ? 'rgba(16,185,129,0.08)' : 'rgba(11,19,36,0.6)',
                    color: done ? '#34d399' : running ? '#00d2ff' : 'var(--text-muted)'
                  }}
                >
                  {done ? <CheckCircle2 size={14} /> : running ? <Loader2 size={14} /> : <span style={{ width: 14, textAlign: 'center' }}>•</span>}
                  <span>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Historial de períodos procesados */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Períodos Almacenados en SQLite Local</div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Período</th>
                <th>Archivo Origen</th>
                <th className="text-right">Filas Leídas</th>
                <th className="text-right">Excluidos</th>
                <th className="text-right">Universo Válido</th>
                <th className="text-center">Tiempo</th>
                <th className="text-center">Estado</th>
                <th className="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => (
                <tr key={p.fecha}>
                  <td style={{ fontWeight: 700 }}>{formatPeriod(p.fecha)} <span className="mono" style={{ color: 'var(--text-muted)' }}>({p.fecha})</span></td>
                  <td className="mono" style={{ fontSize: '12px' }}>{p.archivo_origen}</td>
                  <td className="text-right mono">{p.total_filas.toLocaleString('en-US')}</td>
                  <td className="text-right mono">{(p.e1_duplicados + p.e2_extranjeros + p.e3_saldo_negativo + p.e4_no_catalogado).toLocaleString('en-US')}</td>
                  <td className="text-right mono" style={{ color: '#34d399', fontWeight: 700 }}>{p.universo_local_valido.toLocaleString('en-US')}</td>
                  <td className="text-center mono">{p.processing_time_ms} ms</td>
                  <td className="text-center">
                    <span className="badge badge-green">{p.reconciliacion_ok ? 'Cuadrado OK' : 'Alerta'}</span>
                  </td>
                  <td className="text-center">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(p.fecha)}
                      title="Eliminar período para pruebas de recarga"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
