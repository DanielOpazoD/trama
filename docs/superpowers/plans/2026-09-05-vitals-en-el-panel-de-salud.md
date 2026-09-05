# Una aguja para el sensor: web vitals en el panel de salud

## Problema

`webVitals.ts` lleva meses enviando LCP, INP, CLS, FCP y TTFB a
`/api/web-vitals`, y la función los guarda en `web_vitals_samples` con índice
por métrica y tiempo. El comentario de cabecera prometía «graficar en el Health
panel». Ningún componente de `src/components` leía esa tabla.

Es decir: una función, una migración y un beacon por sesión, a cambio de cero
información. La única forma de saber si Imprenta se había puesto lenta era
abrir DevTools.

## Cambios

- **`/api/health`** suma una query a su lote RLS: p75 de LCP, INP y CLS a 7 y
  28 días, con el conteo de muestras de cada ventana. Postgres calcula el
  percentil (`percentile_cont(0.75) WITHIN GROUP … FILTER`); el semáforo lo
  decide `_lib/web-vitals-summary.ts`, una función pura con los umbrales de
  Google que `docs/observability.md` ya declaraba como SLO.
- **Alerta `web_vitals_poor`** (warn) cuando el p75 semanal de alguna métrica
  cae en «poor». La doc decía «si en una semana entra en poor, revisar» y nadie
  tenía cómo enterarse; ahora enciende el punto del sidebar como cualquier otra
  alerta.
- **Tarjeta «web vitals · p75 últimos 7 días»** en Estado del sistema: tres
  casillas fijas (LCP · INP · CLS), la cifra grande de la semana, el chip
  bien / mejorable / pobre / sin muestras, y debajo el p75 a 28 días con sus
  muestras como contexto.
- **Modo prueba**: devuelve las tres casillas vacías. La demo no manda vitals a
  ningún servidor, y eso es lo que se ve.

## Decisiones

- **Tres cifras, sin gráfico.** Un sparkline por métrica habría sido bonito y
  habría costado otra query por día. Para la primera aguja bastan el p75 y la
  fecha: con eso se ve cuándo algo se puso lento. Si hace falta la serie, es
  otro pack.
- **Semáforo sobre 7 días, con 28 de respaldo.** Una semana sin uso deja el
  p75 semanal en null; en vez de decir «sin datos» cuando hay 30 muestras del
  mes, el semáforo cae a los 28 días. La cifra grande sigue siendo la semanal
  (guion si no hay), para no confundir ventanas.
- **Siempre las tres métricas, en el mismo orden.** El servidor rellena con
  `no-data` en vez de omitir; la tarjeta pinta tres casillas fijas y no una
  lista que cambia de forma según qué llegó.
- **`webVitals` es obligatorio en `HealthResponse`.** Hacerlo opcional habría
  evitado tocar tres fixtures, pero también habría dejado que un router de
  demo o un mock se olvide del campo sin que el compilador lo diga. Las tres
  fixtures son exactamente lo que `typecheck` señaló.

## Validación

- Nuevos: `web-vitals-summary` (6), alertas (2), endpoint (1), panel (2).
- Suite completa en verde; `typecheck`, `lint`, `format:check` y los gates del
  job `lint`.

**Verificado por mutación**, una pieza cada vez:

- Quitar el respaldo a 28 días del semáforo → fallan el test del resumen y el
  del endpoint (INP sin muestras semanales).
- Pasar `webVitalsPoor: []` fijo en `health.mts` → falla el test del endpoint
  que espera `web_vitals_poor`.
- Quitar la tarjeta de `HealthPanel.tsx` → fallan los dos tests del panel.

**En el navegador (demo)**: Estado del sistema muestra la tarjeta con las tres
casillas en «sin muestras» y sin errores de consola.

## Pendiente

- FCP y TTFB se guardan pero no se muestran. Son diagnósticos, no Core Web
  Vitals; entran cuando alguien los necesite para explicar un LCP.
- No hay serie temporal: si el p75 empeora, la tarjeta lo dice, pero no
  cuándo empezó. Un sparkline diario por métrica es el paso siguiente natural.
- La query no está en `check:query-plans` (pide Postgres local). El índice
  `idx_web_vitals_metric_time` la cubre, pero conviene confirmarlo con
  `EXPLAIN` cuando haya base a mano.
