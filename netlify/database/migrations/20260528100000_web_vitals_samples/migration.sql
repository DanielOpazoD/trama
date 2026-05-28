-- R2: tabla `web_vitals_samples` para persistir Core Web Vitals.
--
-- Antes el endpoint /api/web-vitals solo logueaba al stdout vía
-- `logEvent` — quedaba en Netlify Functions logs pero no queryable
-- para graficar tendencias en el Health panel.
--
-- Esta tabla recibe un row por sample. Es append-only (no se editan
-- ni borran samples) — same régimen que `extraction_log` y `error_log`.
-- En el futuro podemos particionar por created_at + agregar BRIN si
-- crece mucho.
--
-- Privacy: `path` viene normalizado desde el cliente (UUIDs → ":id",
-- ver R3 + comment en src/lib/webVitals.ts). No persistimos slug
-- específicos del user (que podrían ser sensibles si en el futuro
-- los slugs son nombres de entidades).

CREATE TABLE web_vitals_samples (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nombre de la métrica: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'.
  metric          TEXT NOT NULL,
  -- Valor crudo en ms (o adimensional para CLS).
  value           DOUBLE PRECISION NOT NULL,
  -- Rating de Google: 'good' | 'needs-improvement' | 'poor'.
  rating          TEXT,
  -- Delta respecto a la última medición (solo para métricas que se
  -- actualizan progresivamente como CLS / INP).
  delta           DOUBLE PRECISION,
  -- Path normalizado por el cliente (ver R3).
  path            TEXT,
  -- 'navigate' | 'reload' | 'back-forward' | 'prerender' | 'restore'.
  navigation_type TEXT,
  user_id         TEXT REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- BRIN sobre created_at — append-only, accesos típicos son "last 7
-- days" o "last 30 days". BRIN da mejor compression que btree para
-- columnas correlacionadas con el insert order.
CREATE INDEX idx_web_vitals_created_brin
  ON web_vitals_samples USING brin (created_at);

-- Por métrica + tiempo: queries del estilo "p75 de LCP en los últimos
-- 7 días" — index compuesto ayuda.
CREATE INDEX idx_web_vitals_metric_time
  ON web_vitals_samples (metric, created_at DESC);

COMMENT ON TABLE web_vitals_samples IS
  'Core Web Vitals samples del cliente. Append-only. Path viene normalizado (UUIDs ofuscados). Ver ADR-0009 para el patrón de audit log.';
