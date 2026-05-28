-- U-1: Resonancia — el usuario marca "cuánto resuena hoy" cada cita
-- en una escala 1-5.
--
-- Es introspección, no rating de calidad — el valor cambia en el tiempo
-- (lo que resonaba en mayo puede apagarse en agosto). La columna guarda
-- el valor ACTUAL; si querés historial, agregar tabla aparte (deferido).
--
-- NULL = sin marcar (estado default). 1-5 = valor explícito del usuario.
-- CHECK constraint blinda el rango. SMALLINT alcanza para 1-5.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS resonance smallint NULL
  CHECK (resonance IS NULL OR (resonance >= 1 AND resonance <= 5));

-- No agregamos índice — la columna se usa solo en la card individual,
-- no en queries de listado o filtrado. Cuando alguien quiera "ver mis
-- citas que resuenan 5 hoy" agregamos índice parcial.
