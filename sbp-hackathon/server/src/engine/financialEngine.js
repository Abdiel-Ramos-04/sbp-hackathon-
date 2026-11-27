/**
 * Motor de Procesamiento Financiero - Hackathon SBP 2026
 * 
 * Este módulo implementa el pipeline determinista completo para:
 * 1. Ingesta y validación de archivos AT03
 * 2. Exclusiones en cascada (E1-E4)
 * 3. Clasificación por catálogos CINU/SB109
 * 4. Regla especial de CONSUMO (SB21)
 * 5. Agregaciones y rankings
 * 6. Reconciliaciones
 * 
 * IMPORTANTE: Usa aritmética decimal exacta (centavos enteros) para evitar 
 * errores de punto flotante binario.
 */

import Decimal from 'decimal.js';

// Configurar Decimal.js para máxima precisión
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Mapa de los 61 campos esperados en un archivo AT03, en orden.
 */
export const AT03_FIELDS = [
  'Fecha','Codigo_Banco','Codigo_Subsidiaria','Preferencial_No_Preferencial',
  'Aplica_FECI','Tipo_Credito','Facilidad_Crediticia','Clasificacion_Prestamo',
  'Destino','Codigo_Region','ID_Cliente','Tamano_Empresa','Genero',
  'Numero_Prestamo','Nombre_Cliente','ID_Grupo_Economico','Tipo_Relacion',
  'Tipo_Actividad','Tasa_Interes','Valor_Inicial','Intereses_por_Cobrar',
  'Fecha_Inicial_Prestamo','Fecha_Vencimiento','Fecha_Refinanciamiento',
  'Fecha_Restructuracion','Numero_Facilidad_Anterior','Primera_Garantia',
  'Valor_Primera_Garantia','Segunda_Garantia','Valor_Segunda_Garantia',
  'Provision','Provision_NIIF','Provision_Complementaria_no_NIIF','Saldo',
  'Cantidad_Cuotas_por_Vencer','Monto_por_Vencer_30_dias',
  'Monto_por_Vencer_60_dias','Monto_por_Vencer_90_dias',
  'Monto_por_Vencer_120_dias','Monto_por_Vencer_180_dias',
  'Monto_por_Vencer_1_ano','Monto_por_Vencer_1_a_5_anos',
  'Monto_por_Vencer_5_a_10_anos','Monto_por_Vencer_mas_10_anos',
  'Cantidad_Cuotas_Vencidas','Monto_Vencido_30_dias','Monto_Vencido_60_dias',
  'Monto_Vencido_90_dias','Monto_Vencido_120_dias','Monto_Vencido_180_dias',
  'Monto_Vencido_1_ano','Monto_Vencido_mas_1_ano',
  'Fecha_Proximo_Pago_Capital','Periodicidad_Pago_Capital',
  'Fecha_Proximo_Pago_Interes','Periodicidad_Pago_Intereses','Dias_Mora',
  'Perfil_Vencimiento','Monto_Cuota_Pagar','Metodologia_Calculo_Intereses',
  'Categoria_Cambio'
];

/**
 * Macroactividades definidas para los rankings
 */
export const MACROACTIVIDADES = [
  'HIPOTECARIO', 'CONSTRUCCION', 'INDUSTRIA', 
  'AGROPECUARIO', 'COMERCIO', 'CONSUMO'
];

/**
 * Valida el esquema de un archivo AT03 parseado.
 * @param {string[]} headers - Cabeceras del CSV
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(headers) {
  const errors = [];
  
  if (headers.length !== 61) {
    errors.push(`Se esperaban 61 columnas, se encontraron ${headers.length}`);
  }
  
  for (let i = 0; i < AT03_FIELDS.length; i++) {
    if (i < headers.length && headers[i].trim() !== AT03_FIELDS[i]) {
      errors.push(`Columna ${i + 1}: se esperaba "${AT03_FIELDS[i]}", se encontró "${headers[i].trim()}"`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Pipeline principal de procesamiento.
 * Recibe filas crudas de un AT03 y los catálogos, produce rankings.
 * 
 * @param {Object[]} rows - Filas del AT03 (como objetos con campos string)
 * @param {Object} catalogs - { cinu: Map, sb21: Map, bancos: Map }
 * @returns {Object} Resultado completo del procesamiento
 */
export function processAT03(rows, catalogs) {
  const startTime = Date.now();
  const { cinuMap, sb21Map, bancosMap } = catalogs;
  
  // Detectar período
  const fechas = new Set(rows.map(r => r.Fecha));
  const periodos = [...fechas].sort();
  
  const results = {};
  
  for (const periodo of periodos) {
    const periodRows = rows.filter(r => r.Fecha === periodo);
    results[periodo] = processPeriod(periodRows, periodo, cinuMap, sb21Map, bancosMap);
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    periodos,
    results,
    processingTimeMs: elapsed
  };
}

/**
 * Procesa un único período.
 */
function processPeriod(rows, periodo, cinuMap, sb21Map, bancosMap) {
  const totalRows = rows.length;
  
  // ========== FASE B: Exclusiones en cascada ==========
  const exclusionResult = applyExclusions(rows, cinuMap);
  const {
    validRows,
    e1_duplicados,
    e2_extranjeros,
    e3_saldoNegativo,
    e4_noCatalogado,
    independentCounts,
    excludedDetails
  } = exclusionResult;
  
  // Verificar reconciliación fundamental
  const totalExcluded = e1_duplicados + e2_extranjeros + e3_saldoNegativo + e4_noCatalogado;
  const universoLocalValido = validRows.length;
  const reconOk = totalRows === totalExcluded + universoLocalValido;
  
  // ========== FASE C: Clasificación y agregación ==========
  const classifiedRows = classifyRows(validRows, cinuMap, sb21Map);
  
  // Verificar integridad referencial
  const integrityAlerts = checkIntegrity(validRows, bancosMap, cinuMap, sb21Map);
  
  // Verificar coherencia CONSUMO (SB21)
  const coherenceAlerts = checkCoherenceSB21(classifiedRows);
  
  // ========== Agregaciones ==========
  const aggregations = computeAggregations(classifiedRows, bancosMap, periodo);
  
  // ========== Rankings ==========
  const rankings = computeRankings(aggregations, bancosMap, periodo);
  
  // ========== Reconciliaciones ==========
  const reconciliations = computeReconciliations(aggregations, rankings, classifiedRows, bancosMap);
  
  return {
    periodo,
    totalRows,
    exclusions: {
      totalRows,
      E1_duplicados: e1_duplicados,
      E2_extranjeros: e2_extranjeros,
      E3_saldoNegativo: e3_saldoNegativo,
      E4_noCatalogado: e4_noCatalogado,
      totalExcluidos: totalExcluded,
      universoLocalValido,
      reconciliacionExclusion: reconOk,
      independentCounts,
      excludedDetails
    },
    integrityAlerts,
    coherenceAlerts,
    aggregations,
    rankings,
    reconciliations,
    validRows: classifiedRows
  };
}

/**
 * EXCLUSIONES EN CASCADA
 * E1: Duplicados (mismo Numero_Prestamo dentro del período)
 * E2: Destino extranjero (Destino !== 'L')
 * E3: Saldo no positivo (Saldo <= 0)
 * E4: Actividad no catalogada (Tipo_Actividad no en catálogo CINU)
 * 
 * Cada fila se cuenta SOLO en el primer filtro que incumple.
 */
function applyExclusions(rows, cinuMap) {
  let e1 = 0, e2 = 0, e3 = 0, e4 = 0;
  let indE1 = 0, indE2 = 0, indE3 = 0, indE4 = 0;
  const excludedDetails = [];
  const seenPrestamos = new Set();
  const seenIndependent = new Set();
  const validRows = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1; // 1-based for reporting

    // Conteo independiente (informativo, aparte de la cascada oficial)
    if (seenIndependent.has(row.Numero_Prestamo)) indE1++;
    seenIndependent.add(row.Numero_Prestamo);
    if (row.Destino !== 'L') indE2++;
    let saldoInd;
    try { saldoInd = new Decimal(row.Saldo || '0'); } catch { saldoInd = new Decimal(0); }
    if (saldoInd.lte(0)) indE3++;
    if (!cinuMap.has(row.Tipo_Actividad)) indE4++;
    
    // E1: Duplicados
    if (seenPrestamos.has(row.Numero_Prestamo)) {
      e1++;
      excludedDetails.push({
        fila: rowIndex,
        numeroPrestamo: row.Numero_Prestamo,
        motivo: 'E1_DUPLICADO',
        banco: row.Codigo_Banco
      });
      continue;
    }
    seenPrestamos.add(row.Numero_Prestamo);
    
    // E2: Destino extranjero
    if (row.Destino !== 'L') {
      e2++;
      excludedDetails.push({
        fila: rowIndex,
        numeroPrestamo: row.Numero_Prestamo,
        motivo: 'E2_EXTRANJERO',
        banco: row.Codigo_Banco,
        destino: row.Destino
      });
      continue;
    }
    
    // E3: Saldo no positivo
    const saldo = saldoInd;
    if (saldo.lte(0)) {
      e3++;
      excludedDetails.push({
        fila: rowIndex,
        numeroPrestamo: row.Numero_Prestamo,
        motivo: 'E3_SALDO_NO_POSITIVO',
        banco: row.Codigo_Banco,
        saldo: row.Saldo
      });
      continue;
    }
    
    // E4: Actividad no catalogada
    if (!cinuMap.has(row.Tipo_Actividad)) {
      e4++;
      excludedDetails.push({
        fila: rowIndex,
        numeroPrestamo: row.Numero_Prestamo,
        motivo: 'E4_NO_CATALOGADO',
        banco: row.Codigo_Banco,
        tipoActividad: row.Tipo_Actividad
      });
      continue;
    }
    
    // Fila válida
    validRows.push({ ...row, _originalRow: rowIndex });
  }
  
  return {
    validRows,
    e1_duplicados: e1,
    e2_extranjeros: e2,
    e3_saldoNegativo: e3,
    e4_noCatalogado: e4,
    independentCounts: {
      E1_duplicados: indE1,
      E2_extranjeros: indE2,
      E3_saldoNegativo: indE3,
      E4_noCatalogado: indE4
    },
    excludedDetails
  };
}

/**
 * CLASIFICACIÓN
 * Cruza AT03.Tipo_Actividad con CINU.Codigo_CINU para obtener
 * Macroactividad_Reto y Subactividad_Reto.
 * Aplica la regla especial de CONSUMO (SB21).
 */
function classifyRows(rows, cinuMap, sb21Map) {
  return rows.map(row => {
    const cinuEntry = cinuMap.get(row.Tipo_Actividad);
    if (!cinuEntry) return row; // shouldn't happen after E4 filter
    
    let macroactividad = cinuEntry.Macroactividad_Reto;
    let subactividad = cinuEntry.Subactividad_Reto;
    
    // Regla especial de CONSUMO (Sección 6)
    if (macroactividad === 'CONSUMO') {
      const facilidad = row.Facilidad_Crediticia;
      const cinu = row.Tipo_Actividad;
      
      if (cinu === 'K.64.649.6492.64921') {
        // Crédito personal
        if (facilidad === '07') {
          // Reclasificar a Tarjeta
          subactividad = 'Tarjeta';
        } else {
          subactividad = 'Credito personal';
        }
      } else if (cinu === 'K.64.649.6492.64922') {
        // Automóvil
        subactividad = 'Automovil';
      } else if (cinu === 'K.64.649.6499.64991') {
        // Tarjeta
        subactividad = 'Tarjeta';
      }
    }
    
    return {
      ...row,
      Macroactividad_Reto: macroactividad,
      Subactividad_Reto: subactividad,
      _saldoDecimal: new Decimal(row.Saldo)
    };
  });
}

/**
 * Verificar integridad referencial
 */
function checkIntegrity(rows, bancosMap, cinuMap, sb21Map) {
  const alerts = [];
  
  for (const row of rows) {
    if (!bancosMap.has(row.Codigo_Banco)) {
      alerts.push({
        tipo: 'BANCO_NO_CATALOGADO',
        numeroPrestamo: row.Numero_Prestamo,
        valor: row.Codigo_Banco
      });
    }
    
    // Facilidad_Crediticia vs SB21
    if (!sb21Map.has(row.Facilidad_Crediticia)) {
      alerts.push({
        tipo: 'FACILIDAD_NO_CATALOGADA',
        numeroPrestamo: row.Numero_Prestamo,
        valor: row.Facilidad_Crediticia
      });
    }
  }
  
  return alerts;
}

/**
 * Verificar coherencia SB21 para CONSUMO
 * - Tarjeta (K.64.649.6499.64991) debe tener facilidad 07
 * - Automóvil (K.64.649.6492.64922) debe tener facilidad 03
 */
function checkCoherenceSB21(classifiedRows) {
  const alerts = [];
  
  for (const row of classifiedRows) {
    if (row.Macroactividad_Reto !== 'CONSUMO') continue;
    
    const cinu = row.Tipo_Actividad;
    const facilidad = row.Facilidad_Crediticia;
    
    // Tarjeta debe tener facilidad 07
    if (cinu === 'K.64.649.6499.64991' && facilidad !== '07') {
      alerts.push({
        tipo: 'COHERENCIA_TARJETA',
        numeroPrestamo: row.Numero_Prestamo,
        facilidadEsperada: '07',
        facilidadReal: facilidad,
        accion: 'Se mantiene subactividad del catálogo CINU'
      });
    }
    
    // Automóvil debe tener facilidad 03
    if (cinu === 'K.64.649.6492.64922' && facilidad !== '03') {
      alerts.push({
        tipo: 'COHERENCIA_AUTOMOVIL',
        numeroPrestamo: row.Numero_Prestamo,
        facilidadEsperada: '03',
        facilidadReal: facilidad,
        accion: 'Se mantiene subactividad del catálogo CINU'
      });
    }
  }
  
  return alerts;
}

/**
 * AGREGACIONES
 * Calcula saldos por subactividad, actividad, y total de cartera local válida.
 */
function computeAggregations(classifiedRows, bancosMap, periodo) {
  // Inicializar estructura para todos los bancos y todas las macroactividades
  const bancos = [...bancosMap.keys()];
  
  // Saldo_Subactividad: agrupado por Macroactividad + Codigo_Banco + Subactividad
  const subactivitySaldos = new Map(); // key: "macro|banco|sub" -> Decimal
  
  // Conteo de operaciones
  const operationCounts = new Map(); // key: "macro|banco" -> count
  const subactivityOps = new Map(); // key: "macro|banco|sub" -> count
  
  // Total_Cartera_Local_Valida_Banco (saldo total del universo válido por banco)
  const totalCartera = new Map(); // key: banco -> Decimal
  
  // Inicializar totales
  for (const banco of bancos) {
    totalCartera.set(banco, new Decimal(0));
  }
  
  // Procesar cada fila
  for (const row of classifiedRows) {
    const banco = row.Codigo_Banco;
    const macro = row.Macroactividad_Reto;
    const sub = row.Subactividad_Reto;
    const saldo = row._saldoDecimal;
    
    // Sumar a total cartera del banco
    const prevTotal = totalCartera.get(banco) || new Decimal(0);
    totalCartera.set(banco, prevTotal.plus(saldo));
    
    // Sumar a subactividad
    const subKey = `${macro}|${banco}|${sub}`;
    const prevSub = subactivitySaldos.get(subKey) || new Decimal(0);
    subactivitySaldos.set(subKey, prevSub.plus(saldo));
    
    // Conteo de operaciones
    const macroKey = `${macro}|${banco}`;
    operationCounts.set(macroKey, (operationCounts.get(macroKey) || 0) + 1);
    subactivityOps.set(subKey, (subactivityOps.get(subKey) || 0) + 1);
  }
  
  // Calcular Saldo_Actividad_Banco por macro+banco
  const activitySaldos = new Map(); // key: "macro|banco" -> Decimal
  
  for (const [key, saldo] of subactivitySaldos) {
    const [macro, banco] = key.split('|');
    const actKey = `${macro}|${banco}`;
    const prev = activitySaldos.get(actKey) || new Decimal(0);
    activitySaldos.set(actKey, prev.plus(saldo));
  }
  
  return {
    subactivitySaldos,
    activitySaldos,
    totalCartera,
    operationCounts,
    subactivityOps,
    periodo
  };
}

/**
 * RANKINGS
 * Para cada macroactividad, ordena los 12 bancos por Saldo_Actividad_Banco desc.
 * Desempate: Codigo_Banco ascendente.
 * Siempre incluye los 12 bancos (saldo 0 si no tiene actividad).
 */
function computeRankings(aggregations, bancosMap, periodo) {
  const { activitySaldos, totalCartera, operationCounts, subactivitySaldos, subactivityOps } = aggregations;
  const bancos = [...bancosMap.keys()].sort();
  const rankings = {};
  
  for (const macro of MACROACTIVIDADES) {
    // Crear entrada para cada banco
    const entries = bancos.map(banco => {
      const actKey = `${macro}|${banco}`;
      const saldoActividad = activitySaldos.get(actKey) || new Decimal(0);
      const totalCarteraBanco = totalCartera.get(banco) || new Decimal(0);
      
      // Ponderación: (saldo actividad / total cartera) * 100, 4 decimales
      let ponderacion = new Decimal(0);
      if (!totalCarteraBanco.isZero()) {
        ponderacion = saldoActividad.div(totalCarteraBanco).times(100);
      }
      
      const opsValidas = operationCounts.get(actKey) || 0;
      
      // Obtener desglose por subactividad
      const subdesglose = [];
      for (const [key, saldo] of subactivitySaldos) {
        const [m, b, sub] = key.split('|');
        if (m === macro && b === banco) {
          const subOpsKey = `${m}|${b}|${sub}`;
          subdesglose.push({
            subactividad: sub,
            saldo: saldo.toFixed(2),
            operaciones: subactivityOps.get(subOpsKey) || 0
          });
        }
      }
      
      return {
        codigoBanco: banco,
        nombreBanco: bancosMap.get(banco)?.Nombre_Ficticio || banco,
        saldoActividad: saldoActividad.toFixed(2),
        saldoActividadDecimal: saldoActividad,
        totalCarteraLocalValida: totalCarteraBanco.toFixed(2),
        ponderacionPct: ponderacion.toDecimalPlaces(4).toFixed(4),
        operacionesValidas: opsValidas,
        subdesglose
      };
    });
    
    // Ordenar: saldo descendente, desempate por código banco ascendente
    entries.sort((a, b) => {
      const diff = b.saldoActividadDecimal.cmp(a.saldoActividadDecimal);
      if (diff !== 0) return diff;
      return a.codigoBanco.localeCompare(b.codigoBanco);
    });
    
    // Asignar posiciones
    entries.forEach((entry, index) => {
      entry.posicion = index + 1;
      delete entry.saldoActividadDecimal; // cleanup
    });
    
    rankings[macro] = {
      ranking: macro,
      periodo,
      entries
    };
  }
  
  return rankings;
}

/**
 * RECONCILIACIONES
 * R1: sum(Saldo_Subactividad) == Saldo_Actividad_Banco por banco y ranking
 * R2: sum(Saldo_Actividad_Banco) de las 6 macros == Total_Cartera_Local_Valida por banco
 * R3: sum(Total_Cartera) de los 12 bancos == sum(Saldo) del universo válido
 */
function computeReconciliations(aggregations, rankings, classifiedRows, bancosMap) {
  const { activitySaldos, totalCartera, subactivitySaldos } = aggregations;
  const bancos = [...bancosMap.keys()];
  const results = { R1: [], R2: [], R3: null };
  
  // R1: Por cada banco y ranking, sum(subactividades) == saldo actividad
  for (const macro of MACROACTIVIDADES) {
    for (const banco of bancos) {
      let sumSub = new Decimal(0);
      for (const [key, saldo] of subactivitySaldos) {
        const [m, b] = key.split('|');
        if (m === macro && b === banco) {
          sumSub = sumSub.plus(saldo);
        }
      }
      const actKey = `${macro}|${banco}`;
      const saldoAct = activitySaldos.get(actKey) || new Decimal(0);
      const diff = sumSub.minus(saldoAct).abs();
      
      results.R1.push({
        banco,
        ranking: macro,
        sumSubactividades: sumSub.toFixed(2),
        saldoActividad: saldoAct.toFixed(2),
        diferencia: diff.toFixed(2),
        cuadra: diff.lte(0.001)
      });
    }
  }
  
  // R2: Por cada banco, sum(saldo de 6 macros) == total cartera
  for (const banco of bancos) {
    let sumMacros = new Decimal(0);
    for (const macro of MACROACTIVIDADES) {
      const actKey = `${macro}|${banco}`;
      sumMacros = sumMacros.plus(activitySaldos.get(actKey) || new Decimal(0));
    }
    const total = totalCartera.get(banco) || new Decimal(0);
    const diff = sumMacros.minus(total).abs();
    
    results.R2.push({
      banco,
      sumSaldosMacros: sumMacros.toFixed(2),
      totalCarteraLocalValida: total.toFixed(2),
      diferencia: diff.toFixed(2),
      cuadra: diff.lte(0.001)
    });
  }
  
  // R3: sum(Total_Cartera) de 12 bancos == sum(Saldo) universo válido
  let sumTotales = new Decimal(0);
  for (const total of totalCartera.values()) {
    sumTotales = sumTotales.plus(total);
  }
  
  let sumSaldos = new Decimal(0);
  for (const row of classifiedRows) {
    sumSaldos = sumSaldos.plus(row._saldoDecimal);
  }
  
  const diff = sumTotales.minus(sumSaldos).abs();
  results.R3 = {
    sumTotalCarteras: sumTotales.toFixed(2),
    sumSaldosUniverso: sumSaldos.toFixed(2),
    diferencia: diff.toFixed(2),
    cuadra: diff.lte(0.001)
  };
  
  return results;
}

/**
 * COMPARACIÓN ENTRE PERÍODOS
 * Calcula cambios de posición y variaciones de saldo.
 */
export function comparePeriods(rankingAnterior, rankingActual) {
  const movements = {};
  
  for (const macro of MACROACTIVIDADES) {
    const anterior = rankingAnterior[macro];
    const actual = rankingActual[macro];
    
    if (!anterior || !actual) continue;
    
    const anteriorMap = new Map(anterior.entries.map(e => [e.codigoBanco, e]));
    
    movements[macro] = actual.entries.map(entryActual => {
      const entryAnterior = anteriorMap.get(entryActual.codigoBanco);
      
      if (!entryAnterior) {
        return {
          ...entryActual,
          cambioPosicion: null,
          variacionSaldo: null,
          variacionSaldoPct: null,
          tipo: 'NUEVO'
        };
      }
      
      const posAnterior = entryAnterior.posicion;
      const posActual = entryActual.posicion;
      // Cambio positivo = sube (mejora posición)
      const cambioPosicion = posAnterior - posActual;
      
      const saldoAnterior = new Decimal(entryAnterior.saldoActividad);
      const saldoActual = new Decimal(entryActual.saldoActividad);
      const variacionSaldo = saldoActual.minus(saldoAnterior);
      
      let variacionSaldoPct = new Decimal(0);
      if (!saldoAnterior.isZero()) {
        variacionSaldoPct = variacionSaldo.div(saldoAnterior).times(100);
      }
      
      let tipo = 'SIN_CAMBIO';
      if (cambioPosicion > 0) tipo = 'SUBE';
      else if (cambioPosicion < 0) tipo = 'BAJA';
      
      return {
        codigoBanco: entryActual.codigoBanco,
        nombreBanco: entryActual.nombreBanco,
        posicionAnterior: posAnterior,
        posicionActual: posActual,
        cambioPosicion,
        saldoAnterior: saldoAnterior.toFixed(2),
        saldoActual: saldoActual.toFixed(2),
        variacionSaldo: variacionSaldo.toFixed(2),
        variacionSaldoPct: variacionSaldoPct.toDecimalPlaces(2).toFixed(2),
        ponderacionActual: entryActual.ponderacionPct,
        operacionesActuales: entryActual.operacionesValidas,
        tipo
      };
    });
  }
  
  return movements;
}

/**
 * Detectar movimientos significativos según reglas configurables.
 */
export function detectSignificantMovements(movements, thresholds = {}) {
  const {
    minPositionChange = 2,
    minSaldoChangePct = 10,
    detectLeaderChange = true
  } = thresholds;
  
  const significantMovements = [];
  
  for (const [macro, entries] of Object.entries(movements)) {
    for (const entry of entries) {
      const reasons = [];
      
      // Cambio de posición significativo
      if (entry.cambioPosicion !== null && Math.abs(entry.cambioPosicion) >= minPositionChange) {
        reasons.push(`Cambio de ${Math.abs(entry.cambioPosicion)} posiciones (${entry.cambioPosicion > 0 ? 'sube' : 'baja'})`);
      }
      
      // Cambio de líder
      if (detectLeaderChange && entry.posicionActual === 1 && entry.posicionAnterior !== 1) {
        reasons.push(`Nuevo líder del ranking`);
      }
      
      // Variación de saldo significativa
      if (entry.variacionSaldoPct !== null && Math.abs(parseFloat(entry.variacionSaldoPct)) >= minSaldoChangePct) {
        reasons.push(`Variación de saldo del ${entry.variacionSaldoPct}%`);
      }
      
      if (reasons.length > 0) {
        significantMovements.push({
          ranking: macro,
          ...entry,
          reasons
        });
      }
    }
  }
  
  // Ordenar por importancia (más cambio de posición primero)
  significantMovements.sort((a, b) => {
    const aPosChange = Math.abs(a.cambioPosicion || 0);
    const bPosChange = Math.abs(b.cambioPosicion || 0);
    return bPosChange - aPosChange;
  });
  
  return significantMovements;
}

/**
 * Generar explicaciones automáticas de movimientos
 */
export function generateExplanations(significantMovements) {
  return significantMovements.map(mov => {
    const parts = [];
    
    if (mov.cambioPosicion > 0) {
      parts.push(`${mov.nombreBanco} ascendió ${mov.cambioPosicion} posicion${mov.cambioPosicion > 1 ? 'es' : ''} en el ranking ${mov.ranking} (de la posición ${mov.posicionAnterior} a la ${mov.posicionActual})`);
    } else if (mov.cambioPosicion < 0) {
      parts.push(`${mov.nombreBanco} descendió ${Math.abs(mov.cambioPosicion)} posicion${Math.abs(mov.cambioPosicion) > 1 ? 'es' : ''} en el ranking ${mov.ranking} (de la posición ${mov.posicionAnterior} a la ${mov.posicionActual})`);
    }
    
    const varSaldo = parseFloat(mov.variacionSaldo);
    if (varSaldo > 0) {
      parts.push(`debido al crecimiento de su saldo de actividad en B/. ${Number(mov.variacionSaldo).toLocaleString('es-PA', { minimumFractionDigits: 2 })} (${mov.variacionSaldoPct}%)`);
    } else if (varSaldo < 0) {
      parts.push(`debido a la disminución de su saldo de actividad en B/. ${Number(Math.abs(varSaldo)).toLocaleString('es-PA', { minimumFractionDigits: 2 })} (${mov.variacionSaldoPct}%)`);
    }
    
    if (mov.posicionActual === 1 && mov.posicionAnterior !== 1) {
      parts.push('convirtiéndose en el nuevo líder del ranking');
    }
    
    return {
      ...mov,
      explicacion: parts.join(', ') + '.'
    };
  });
}

/**
 * Cargar catálogos desde los datos parseados.
 */
export function loadCatalogs(cinuRows, sb21Rows, bancosRows) {
  const cinuMap = new Map();
  for (const row of cinuRows) {
    cinuMap.set(row.Codigo_CINU, {
      Descripcion: row.Descripcion,
      Macroactividad_Reto: row.Macroactividad_Reto,
      Subactividad_Reto: row.Subactividad_Reto,
      Codigo_SB08_Referencia: row.Codigo_SB08_Referencia
    });
  }
  
  const sb21Map = new Map();
  for (const row of sb21Rows) {
    sb21Map.set(row.Codigo, {
      Descripcion: row.Descripcion,
      Uso_en_reto: row.Uso_en_reto
    });
  }
  
  const bancosMap = new Map();
  for (const row of bancosRows) {
    bancosMap.set(row.Codigo_Banco, {
      Nombre_Ficticio: row.Nombre_Ficticio,
      Tipo_Licencia: row.Tipo_Licencia
    });
  }
  
  return { cinuMap, sb21Map, bancosMap };
}

/**
 * Análisis complementarios (morosidad, concentración, vencimientos)
 */
export function computeSupplementaryAnalysis(classifiedRows, bancosMap) {
  const bancos = [...bancosMap.keys()];
  const analysis = {};
  
  // Morosidad por banco
  const morosidad = {};
  for (const banco of bancos) {
    const bancoRows = classifiedRows.filter(r => r.Codigo_Banco === banco);
    const totalOps = bancoRows.length;
    const morosas = bancoRows.filter(r => parseInt(r.Dias_Mora || '0') > 0);
    const totalSaldo = bancoRows.reduce((s, r) => s.plus(r._saldoDecimal), new Decimal(0));
    const saldoMoroso = morosas.reduce((s, r) => s.plus(r._saldoDecimal), new Decimal(0));
    
    morosidad[banco] = {
      nombreBanco: bancosMap.get(banco)?.Nombre_Ficticio || banco,
      totalOperaciones: totalOps,
      operacionesMorosas: morosas.length,
      porcentajeMorosidad: totalOps > 0 ? ((morosas.length / totalOps) * 100).toFixed(2) : '0.00',
      saldoTotal: totalSaldo.toFixed(2),
      saldoMoroso: saldoMoroso.toFixed(2),
      porcentajeSaldoMoroso: !totalSaldo.isZero() 
        ? saldoMoroso.div(totalSaldo).times(100).toDecimalPlaces(2).toFixed(2) 
        : '0.00'
    };
  }
  analysis.morosidad = morosidad;
  
  // Concentración de cartera por actividad para cada banco
  const concentracion = {};
  for (const banco of bancos) {
    const bancoRows = classifiedRows.filter(r => r.Codigo_Banco === banco);
    const totalSaldo = bancoRows.reduce((s, r) => s.plus(r._saldoDecimal), new Decimal(0));
    const porMacro = {};
    for (const macro of MACROACTIVIDADES) {
      const macroRows = bancoRows.filter(r => r.Macroactividad_Reto === macro);
      const macroSaldo = macroRows.reduce((s, r) => s.plus(r._saldoDecimal), new Decimal(0));
      porMacro[macro] = {
        saldo: macroSaldo.toFixed(2),
        porcentaje: !totalSaldo.isZero()
          ? macroSaldo.div(totalSaldo).times(100).toDecimalPlaces(2).toFixed(2)
          : '0.00'
      };
    }
    concentracion[banco] = {
      nombreBanco: bancosMap.get(banco)?.Nombre_Ficticio || banco,
      totalCartera: totalSaldo.toFixed(2),
      distribucion: porMacro
    };
  }
  analysis.concentracion = concentracion;
  
  // Distribución por clasificación regulatoria
  const clasificacionReg = {};
  for (const banco of bancos) {
    const bancoRows = classifiedRows.filter(r => r.Codigo_Banco === banco);
    const byClasif = {};
    for (const row of bancoRows) {
      const clasif = row.Clasificacion_Prestamo;
      if (!byClasif[clasif]) byClasif[clasif] = { count: 0, saldo: new Decimal(0) };
      byClasif[clasif].count++;
      byClasif[clasif].saldo = byClasif[clasif].saldo.plus(row._saldoDecimal);
    }
    clasificacionReg[banco] = {
      nombreBanco: bancosMap.get(banco)?.Nombre_Ficticio || banco,
      distribucion: Object.fromEntries(
        Object.entries(byClasif).map(([k, v]) => [k, { count: v.count, saldo: v.saldo.toFixed(2) }])
      )
    };
  }
  analysis.clasificacionRegulatoria = clasificacionReg;
  
  // Distribución por vencimientos (sum of Monto_por_Vencer by tramo)
  const vencimientos = {};
  const tramos = [
    'Monto_por_Vencer_30_dias','Monto_por_Vencer_60_dias','Monto_por_Vencer_90_dias',
    'Monto_por_Vencer_120_dias','Monto_por_Vencer_180_dias','Monto_por_Vencer_1_ano',
    'Monto_por_Vencer_1_a_5_anos','Monto_por_Vencer_5_a_10_anos','Monto_por_Vencer_mas_10_anos'
  ];
  const tramosVencidos = [
    'Monto_Vencido_30_dias','Monto_Vencido_60_dias','Monto_Vencido_90_dias',
    'Monto_Vencido_120_dias','Monto_Vencido_180_dias','Monto_Vencido_1_ano',
    'Monto_Vencido_mas_1_ano'
  ];
  
  for (const banco of bancos) {
    const bancoRows = classifiedRows.filter(r => r.Codigo_Banco === banco);
    const porVencer = {};
    const vencido = {};
    
    for (const tramo of tramos) {
      porVencer[tramo] = bancoRows.reduce(
        (s, r) => s.plus(new Decimal(r[tramo] || '0')), new Decimal(0)
      ).toFixed(2);
    }
    for (const tramo of tramosVencidos) {
      vencido[tramo] = bancoRows.reduce(
        (s, r) => s.plus(new Decimal(r[tramo] || '0')), new Decimal(0)
      ).toFixed(2);
    }
    
    vencimientos[banco] = {
      nombreBanco: bancosMap.get(banco)?.Nombre_Ficticio || banco,
      porVencer,
      vencido
    };
  }
  analysis.vencimientos = vencimientos;
  
  return analysis;
}
