import React, { useEffect, useState } from 'react';
import { FileBarChart2, FileSpreadsheet, FileText, Download, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api, formatPeriod, MACROACTIVIDADES } from '../services/api.js';
import { exportExecutivePDF } from '../services/pdfExporter.js';

export default function ReportesPage() {
  const { periodos, selectedPeriod, addToast } = useApp();
  const sortedPeriods = [...periodos].map(p => p.fecha).sort();

  const [reportPeriod, setReportPeriod] = useState(selectedPeriod);
  const [prevPeriod, setPrevPeriod] = useState('');
  const [selectedRanking, setSelectedRanking] = useState('TODOS');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (selectedPeriod) setReportPeriod(selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    if (sortedPeriods.length >= 2) {
      const idx = sortedPeriods.indexOf(reportPeriod);
      setPrevPeriod(idx > 0 ? sortedPeriods[idx - 1] : sortedPeriods[0]);
    }
  }, [reportPeriod, periodos]);

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      const rankingParam = selectedRanking === 'TODOS' ? '' : selectedRanking;
      const [dashRes, rankRes, subRes, expRes] = await Promise.all([
        api.getDashboard(reportPeriod),
        api.getRankings(reportPeriod, rankingParam),
        api.getSubactividades(reportPeriod, rankingParam),
        prevPeriod && prevPeriod !== reportPeriod
          ? api.getExplicaciones(prevPeriod, reportPeriod, rankingParam)
          : Promise.resolve({ data: [] })
      ]);

      const qualityInfo = periodos.find(p => p.fecha === reportPeriod) || null;
      exportExecutivePDF({
        periodo: reportPeriod,
        periodoAnterior: prevPeriod,
        stats: dashRes.data,
        rankings: rankRes.data || [],
        subactividades: subRes.data || [],
        explanations: expRes.data || [],
        qualityInfo,
        selectedRanking
      });
      addToast('Informe ejecutivo PDF descargado correctamente', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const deliverables = [
    {
      title: 'Entregable 2: Rankings Oficiales por Período (CSV)',
      desc: 'Columnas: Fecha, Ranking, Posicion, Codigo_Banco, Banco, Saldo_Actividad, Total_Cartera_Local_Valida, Ponderacion_Pct, Operaciones_Validas.',
      url: api.exportUrl('rankings', {
        periodo: reportPeriod,
        ...(selectedRanking !== 'TODOS' ? { ranking: selectedRanking } : {})
      })
    },
    {
      title: 'Entregable 3: Desglose por Subactividad (CSV)',
      desc: 'Columnas: Fecha, Ranking, Subactividad, Codigo_Banco, Saldo (incluye reclasificación SB21 en CONSUMO).',
      url: api.exportUrl('subactividades', {
        periodo: reportPeriod,
        ...(selectedRanking !== 'TODOS' ? { ranking: selectedRanking } : {})
      })
    },
    {
      title: 'Entregable 4: Reporte de Calidad de Datos E1–E4 (CSV)',
      desc: 'Conteos en cascada E1–E4, universo local válido y estado de reconciliación para todos o el corte seleccionado.',
      url: api.exportUrl('calidad', { periodo: reportPeriod })
    },
    {
      title: 'Entregable 5: Reporte de Movimientos entre Períodos (CSV)',
      desc: 'Cambios de posición, variación absoluta y porcentual de saldo entre dos cortes.',
      url: api.exportUrl('movimientos', {
        periodoAnterior: prevPeriod,
        periodoActual: reportPeriod,
        ...(selectedRanking !== 'TODOS' ? { ranking: selectedRanking } : {})
      })
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FileBarChart2 size={24} color="#00d2ff" /> Centro de Reportes Personalizados
          </h1>
          <p className="page-subtitle">
            Genera y descarga los entregables oficiales en CSV y el Informe Ejecutivo completo en formato PDF.
          </p>
        </div>
      </div>

      {/* Configurador del reporte */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div className="card-title">Configurar Parámetros del Reporte</div>
        </div>
        <div className="grid-3" style={{ marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Período Principal
            </label>
            <select className="select" style={{ width: '100%' }} value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}>
              {sortedPeriods.map(p => <option key={p} value={p}>{formatPeriod(p)} ({p})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Período Base Comparativo
            </label>
            <select className="select" style={{ width: '100%' }} value={prevPeriod} onChange={(e) => setPrevPeriod(e.target.value)}>
              {sortedPeriods.map(p => <option key={p} value={p}>{formatPeriod(p)} ({p})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Macroactividad / Ranking
            </label>
            <select className="select" style={{ width: '100%' }} value={selectedRanking} onChange={(e) => setSelectedRanking(e.target.value)}>
              <option value="TODOS">Todos los 6 Rankings</option>
              {MACROACTIVIDADES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} color="#10b981" />
            Incluye resumen ejecutivo, calidad E1–E4, rankings, movimientos significativos, explicaciones automáticas y aviso oficial.
          </div>
          <button className="btn btn-primary" onClick={handleGeneratePDF} disabled={generating || !reportPeriod}>
            <FileText size={16} />
            {generating ? 'Generando PDF...' : 'Descargar Informe Ejecutivo (PDF)'}
          </button>
        </div>
      </div>

      {/* Entregables CSV oficiales */}
      <div className="grid-2">
        {deliverables.map((item, idx) => (
          <div key={idx} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div className="card-title" style={{ marginBottom: '6px' }}>
                <FileSpreadsheet size={17} color="#10b981" /> {item.title}
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{item.desc}</p>
            </div>
            <div>
              <a className="btn btn-secondary btn-sm" href={item.url} download>
                <Download size={14} /> Descargar CSV
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
