-- DD7 (audit #6): tracking persistente de alertas para evitar spam.
--
-- El scheduled function de cost-cap-alert corre 1×/día. Si el presupuesto
-- está al 85% y enviamos un webhook hoy, no queremos re-enviar mañana
-- (el usuario ya recibió la notificación). Esta tabla guarda el último
-- timestamp por código de alerta para implementar throttling.
--
-- Code es semántico: 'cost-cap-warning', 'cost-cap-near-limit', etc.
-- Payload guarda el snapshot al momento de enviar (útil para audit).

CREATE TABLE IF NOT EXISTS alert_state (
  code         TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL,
  payload      JSONB
);

CREATE INDEX IF NOT EXISTS alert_state_last_sent_idx
  ON alert_state (last_sent_at DESC);
