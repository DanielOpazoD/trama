-- FF1: tracing por request_id.
--
-- Cada handler envuelto en `withObservability` genera un UUID al entrar y lo
-- expone como header `x-request-id`. Cuando algo falla, el cliente recibe el
-- mismo id en el cuerpo del error — y esa misma cadena se persiste acá. Eso
-- permite al usuario reportar "no pude crear la entidad, request abc123" y
-- nosotros encontramos la fila exacta del fallo en una sola query.
--
-- Nullable para compatibilidad: filas históricas (pre-FF1) no tienen request_id.

ALTER TABLE error_log ADD COLUMN request_id TEXT;

-- Index para búsqueda rápida desde el dashboard de Health cuando el usuario
-- pega un request_id. UUIDs son 36 chars; un btree común alcanza.
CREATE INDEX idx_error_log_request_id ON error_log(request_id) WHERE request_id IS NOT NULL;
