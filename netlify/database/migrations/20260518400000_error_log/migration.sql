-- Persistent log of unexpected errors in functions.
-- Best-effort: writes never block the response. Reading this table once a week
-- (or in a future dashboard) reveals what's silently failing.

CREATE TABLE error_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  http_method TEXT,
  http_path   TEXT,
  status_code INTEGER,
  message     TEXT NOT NULL,
  stack       TEXT,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_error_log_created ON error_log(created_at DESC);
CREATE INDEX idx_error_log_function ON error_log(function_name, created_at DESC);
