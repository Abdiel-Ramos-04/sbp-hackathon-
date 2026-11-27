# Hackathon SBP 2026

> Conversión de `Hackathon_SBP_2026.pptx` a Markdown.
> Total de diapositivas: 13

## Diapositiva 1

RETO DE INNOVACIÓN · 2026

Hackathon SBP 2026

Reto: Plataforma interactiva de rankings y análisis bancario
Transformando datos financieros en información accesible, comparable y útil para la toma de decisiones

Superintendencia de Bancos de Panamá  ·  Noviembre de 2026

SBP  /  HACKATHON SBP 2026

## Diapositiva 2

La consulta actual limita la exploración y comparación de la información

Situación actual

Evolución propuesta

Información financiera y estadística publicada por la SBP
Consulta principalmente mediante archivos Excel y PDF
Exploración interactiva limitada
Comparación lenta entre entidades y períodos

Gráficos dinámicos
Tablas automáticas
Filtros de consulta
Rankings y opciones de descarga

LÁM. 2

SBP  /  HACKATHON SBP 2026

VS

Una experiencia moderna para consultar estadísticas financieras

## Diapositiva 3

El reto convierte los datos suministrados por la SBP en una experiencia útil

LÁM. 3

SBP  /  HACKATHON SBP 2026

Visual

Presenta datos y resultados de forma clara.

Interactiva

Permite explorar y consultar la información.

Fácil de utilizar

Reduce fricción en la navegación y consulta.

Comprensible

Atiende distintos tipos de usuarios.

Comparable

Facilita el análisis entre entidades y períodos.

Producto esperado Aplicación web para consultar, analizar, visualizar y generar rankings bancarios.

## Diapositiva 4

El prototipo debe visualizar, comparar, explicar y reportar resultados

LÁM. 4

SBP  /  HACKATHON SBP 2026

Visualizar

Indicadores financieros en gráficos interactivos.

Generar

Rankings según reglas y datos de la SBP.

Comparar

Resultados entre entidades y períodos.

Filtrar

Información por criterios de exploración.

Sustentar

Detalle que respalda cada resultado.

Reportar

Reportes personalizados.

Alcance de los datos Mostrar siempre la fuente y el período de los datos, y el aviso de que son datos ficticios.

## Diapositiva 5

Cinco módulos conforman la funcionalidad mínima

LÁM. 5

SBP  /  HACKATHON SBP 2026

| Módulo | Capacidades requeridas |
| --- | --- |
| Panel principal | Resumen de indicadores; principales resultados y rankings; visualizaciones sencillas y comprensibles. |
| Consulta de rankings | Selección del período y del indicador o criterio; ordenamiento; posición de cada entidad. |
| Filtros | Por período, entidad, tipo de indicador y otras categorías incluidas en los datos. |
| Visualización | Gráficos interactivos; tablas ordenables; comparaciones entre entidades o períodos. |
| Reportes | Reportes personalizados; exportación o descarga de los resultados seleccionados. |

## Diapositiva 6

Tres perfiles equilibran consulta, análisis y administración

Público o consultivo

Analista

Administrador

• Consultar rankings
• Aplicar filtros
• Ver gráficos y tablas
• Descargar información autorizada

• Realizar consultas detalladas
• Comparar entidades y períodos
• Generar reportes personalizados
• Consultar información complementaria del ranking

• Cargar o actualizar datos
• Administrar parámetros y catálogos
• Configurar perfiles y permisos
• Consultar el registro básico de operaciones

LÁM. 6

SBP  /  HACKATHON SBP 2026

01

Consulta

02

Análisis

03

Control

Perfiles obligatorios  Cada perfil debe ver opciones distintas. Basta un inicio de sesión local o un selector de perfil; no incluya contraseñas en el repositorio.

## Diapositiva 7

La solución funcionará localmente con una arquitectura web documentada

LÁM. 7

SBP  /  HACKATHON SBP 2026

| Componente | Lineamiento técnico |
| --- | --- |
| Ambiente | Funcionamiento local, sin necesidad de publicación en Internet. |
| Frontend | React. |
| Backend | Node.js. |
| Lenguaje principal | JavaScript. |
| Datos | Conjuntos de datos suministrados por la SBP. |
| Visualización | Librerías de gráficos compatibles con React. |
| Repositorio | Control de versiones y documentación del código. |
| Inteligencia artificial | Puede apoyar la consulta, explicación o exploración; no sustituye el cálculo correcto de los rankings. |

## Diapositiva 8

Cada equipo implementará al menos una automatización de análisis

LÁM. 8

SBP  /  HACKATHON SBP 2026

01

Generar el ranking al cargar un nuevo período.

02

Identificar movimientos significativos en las posiciones.

03

Comparar dos períodos sin preparación manual.

04

Explicar automáticamente los principales movimientos.

05

Señalar variaciones definidas por reglas.

06

Preparar automáticamente un reporte para descarga.

## Diapositiva 9

Datos, reglas y advertencias deben garantizar resultados transparentes

Conjunto de datos para el desarrollo
Diccionario o descripción de campos
Reglas para calcular rankings
Indicadores requeridos
Períodos disponibles
Contexto para interpretar resultados

Resultados reproducibles y cálculos verificables
Mostrar fuente y período
No alterar las reglas proporcionadas
Diferenciar datos reales y ficticios
Uso informativo, no opinión formal de la SBP

LÁM. 9

SBP  /  HACKATHON SBP 2026

La SBP proporcionará

Consideraciones obligatorias

## Diapositiva 10

La evaluación suma 100 puntos en siete criterios

LÁM. 10

SBP  /  HACKATHON SBP 2026

| Criterio | Puntos | Qué se evaluará |
| --- | --- | --- |
| 1. Exactitud de datos y rankings | 25 | Reporte de calidad, rankings, ponderación y subactividades (regla SB21) correctos en los 3 períodos. El jurado les pedirá mostrar datos. |
| 2. Funcionalidad de la plataforma | 15 | Los 5 módulos (lámina 5) y los 3 perfiles con opciones diferenciadas (lámina 6). |
| 3. Automatización y comparación entre períodos | 15 | Automatizaciones de la lámina 8: mínimo una; más y mejores suman más. |
| 4. Usabilidad y experiencia | 15 | Navegación clara y comprensible para cada perfil; fuente, período y aviso de datos ficticios (lámina 9). |
| 5. Calidad técnica | 10 | Arquitectura (lámina 7); código organizado; pruebas; control básico de acceso por perfil; resultados reproducibles. |
| 6. Innovación | 10 | Visualizaciones creativas; IA pertinente; análisis adicionales útiles. |
| 7. Presentación y demostración | 10 | Claridad del problema; demostración en vivo; justificación de las decisiones técnicas y de diseño. |

Los requisitos mínimos no cumplidos restan puntos (Sección 11.2). El detalle de cada criterio está en la Sección 11 de las indicaciones; si algo difiere, mandan las indicaciones.

## Diapositiva 11

Los entregables deben permitir ejecutar, comprender y verificar la solución

LÁM. 11

SBP  /  HACKATHON SBP 2026

Lista de autoverificación de la entrega

–

Prototipo funcional ejecutable en ambiente local

–

Código fuente

–

Instrucciones para instalar y ejecutar la solución

–

Breve descripción de la arquitectura

–

Explicación de las reglas utilizadas para los rankings

–

Evidencia de pruebas realizadas

–

Presentación final y demostración de la solución

–

Exportaciones CSV y reportes de calidad y de movimientos (Sección 10)

–

Tres perfiles de usuario (lámina 6)

–

Mostrar en vivo los datos que pida el jurado (Sección 11.1)

Si no se cumple un requisito mínimo, se restan puntos (Sección 11.2). Si algo difiere, mandan las indicaciones del reto.

## Diapositiva 12

El resultado esperado combina acceso, transparencia, eficiencia y evolución digital

LÁM. 12

SBP  /  HACKATHON SBP 2026

01

Facilitar el acceso a las estadísticas financieras.

02

Presentar rankings de manera clara y transparente.

03

Mejorar la comparación entre entidades y períodos.

04

Reducir actividades manuales de preparación y consulta.

05

Ofrecer una experiencia más moderna e interactiva.

06

Sentar una base conceptual para iniciativas de datos y servicios digitales.

## Diapositiva 13

Rankings confiables para decisiones mejor informadas

Hackathon SBP 2026 · Plataforma interactiva de rankings y análisis bancario

SBP  /  HACKATHON SBP 2026
