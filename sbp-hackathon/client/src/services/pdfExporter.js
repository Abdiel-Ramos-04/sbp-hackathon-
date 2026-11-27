/**
 * Generador de Reportes PDF Profesionales - Hackathon SBP 2026
 * Utiliza jsPDF + jspdf-autotable 100% offline en el navegador.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, formatPeriod } from './api.js';

const DISCLAIMER =
  'AVISO OBLIGATORIO: Los datos presentados son ficticios y se utilizan exclusivamente con fines demostrativos. No representan la estructura real del sistema bancario panameño ni constituyen información oficial de la Superintendencia de Bancos de Panamá.';

export function exportExecutivePDF({
  periodo,
  periodoAnterior,
  stats,
  rankings = [],
  subactividades = [],
  movements = [],
  explanations = [],
  qualityInfo = null,
  selectedRanking = 'TODOS'
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(10, 22, 46);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(0, 210, 255);
  doc.rect(0, 34, pageWidth, 1.5, 'F');

  doc.setTextColor(0, 210, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SUPERINTENDENCIA DE BANCOS DE PANAMÁ · HACKATHON SBP 2026', 14, 11);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Informe Ejecutivo de Rankings y Análisis Bancario', 14, 20);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 210, 235);
  doc.text(
    `Período de corte: ${formatPeriod(periodo)} (${periodo})   |   Filtro: ${selectedRanking}   |   Generado: ${new Date().toLocaleString('es-PA')}`,
    14,
    28
  );

  let y = 42;

  // Disclaimer Box
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(14, y, pageWidth - 28, 15, 2, 2, 'FD');
  doc.setTextColor(146, 64, 14);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  const splitDisclaimer = doc.splitTextToSize(DISCLAIMER, pageWidth - 34);
  doc.text(splitDisclaimer, 17, y + 5);
  y += 21;

  // Executive Summary KPIs
  if (stats) {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Resumen Ejecutivo del Período', 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Indicador Clave', 'Valor Verificado']],
      body: [
        ['Fuente de Datos', `Átomo 03 (AT03) Sintético · ${qualityInfo?.archivo_origen || 'SBP Hackathon 2026'}`],
        ['Total Cartera Local Válida', formatMoney(stats.totalCartera)],
        ['Bancos Analizados (Licencia General)', `${stats.totalBancos} entidades (101 a 112)`],
        ['Operaciones Locales Válidas', `${Number(stats.totalOperaciones || 0).toLocaleString('en-US')} operaciones`],
        ['Macroactividades Evaluadas', `${stats.totalMacroactividades} rankings`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 36, 71], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Quality & Exclusions
  if (qualityInfo) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('2. Calidad de Datos y Exclusiones en Cascada (E1–E4)', 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Filas Leídas', 'E1 Duplicados', 'E2 Extranjeros', 'E3 Saldo <= 0', 'E4 No Catalogado', 'Universo Válido', 'Reconciliación']],
      body: [[
        qualityInfo.total_filas.toLocaleString('en-US'),
        qualityInfo.e1_duplicados.toLocaleString('en-US'),
        qualityInfo.e2_extranjeros.toLocaleString('en-US'),
        qualityInfo.e3_saldo_negativo.toLocaleString('en-US'),
        qualityInfo.e4_no_catalogado.toLocaleString('en-US'),
        qualityInfo.universo_local_valido.toLocaleString('en-US'),
        qualityInfo.reconciliacion_ok ? 'CUADRADA (OK)' : 'CON DIFERENCIAS'
      ]],
      theme: 'striped',
      headStyles: { fillColor: [15, 36, 71], fontSize: 8 },
      bodyStyles: { fontSize: 8, halign: 'center' },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Rankings Table
  if (rankings.length > 0) {
    if (y > 220) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`3. Resultados de Rankings (${selectedRanking})`, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Ranking', 'Pos.', 'Cód.', 'Banco', 'Saldo Actividad', 'Cartera Local Válida', 'Pond. %', 'Ops.']],
      body: rankings.slice(0, 72).map(r => [
        r.ranking,
        `#${r.posicion}`,
        r.codigo_banco,
        r.nombre_banco,
        formatMoney(r.saldo_actividad),
        formatMoney(r.total_cartera_local_valida),
        `${r.ponderacion_pct}%`,
        Number(r.operaciones_validas).toLocaleString('en-US')
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 36, 71], fontSize: 7.5 },
      bodyStyles: { fontSize: 7.2 },
      columnStyles: {
        1: { halign: 'center', fontStyle: 'bold' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Significant Movements & Explanations
  if (explanations.length > 0) {
    if (y > 220) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`4. Movimientos Significativos (${formatPeriod(periodoAnterior)} → ${formatPeriod(periodo)})`, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Ranking', 'Banco', 'Pos. Ant → Act', 'Var. Saldo %', 'Explicación Automática']],
      body: explanations.slice(0, 25).map(e => [
        e.ranking,
        e.nombreBanco,
        `#${e.posicionAnterior} → #${e.posicionActual}`,
        `${e.variacionSaldoPct}%`,
        e.explicacion
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 36, 71], fontSize: 7.5 },
      bodyStyles: { fontSize: 7.3 },
      columnStyles: { 4: { cellWidth: 85 } },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  } else if (movements.length > 0) {
    if (y > 220) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`4. Comparación de Movimientos (${formatPeriod(periodoAnterior)} → ${formatPeriod(periodo)})`, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Ranking', 'Banco', 'Pos. Ant', 'Pos. Act', 'Cambio', 'Var. Saldo', 'Var. %']],
      body: movements.filter(m => m.cambio_posicion !== 0).slice(0, 25).map(m => [
        m.ranking,
        m.nombre_banco,
        `#${m.posicion_anterior}`,
        `#${m.posicion_actual}`,
        m.cambio_posicion > 0 ? `+${m.cambio_posicion}` : `${m.cambio_posicion}`,
        formatMoney(m.variacion_saldo),
        `${m.variacion_saldo_pct}%`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 36, 71], fontSize: 7.5 },
      bodyStyles: { fontSize: 7.3 },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Subactivities sample if filtered
  if (subactividades.length > 0 && selectedRanking !== 'TODOS') {
    if (y > 220) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`5. Desglose por Subactividad (${selectedRanking})`, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Subactividad', 'Cód. Banco', 'Banco', 'Saldo', 'Operaciones']],
      body: subactividades.slice(0, 40).map(s => [
        s.subactividad,
        s.codigo_banco,
        s.nombre_banco,
        formatMoney(s.saldo),
        s.operaciones
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 36, 71], fontSize: 7.5 },
      bodyStyles: { fontSize: 7.3 },
      margin: { left: 14, right: 14 }
    });
  }

  // Footer page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Hackathon SBP 2026 · Datos Ficticios · Fuente: AT03 Sintético (${periodo}) · Página ${i} de ${pageCount}`,
      14,
      290
    );
  }

  doc.save(`Reporte_SBP_${periodo}_${selectedRanking}.pdf`);
}
