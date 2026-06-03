-- Regresión de los CTE atómicos de los handlers contra Postgres real.
--
-- Por qué existe: el driver HTTP de Neon no da transacciones multi-statement, así
-- que varias mutaciones multi-tabla se escriben como un único `WITH … RETURNING`
-- (ver docs/conventions/dominios.md). Los tests de endpoint mockean el SQL, así
-- que NO ejecutan estos CTE contra un motor real; este archivo sí.
--
-- Cubre: entities-merge, el cascade DELETE/restore de entities, y la creación de
-- momento + links. El SQL está COPIADO de los handlers (la frontera tagged-template
-- no se puede importar); si tocás un CTE allá, actualizá su copia acá:
--   netlify/functions/entities-merge.mts
--   netlify/functions/entities.mts        (DELETE + restore)
--   netlify/functions/momentos.mts        (POST)
--
-- Las tablas son throwaway con los nombres/contraint reales que importan (FK a
-- users, PK compuesta de momento_entities para el ON CONFLICT, NOT NULL de
-- user_id). `embedding` va como text (no se necesita pgvector para validar la
-- atomicidad/links). Falla ruidosamente vía RAISE EXCEPTION + ON_ERROR_STOP.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS momento_entities, momentos, relationships, quotes, entities, users CASCADE;

CREATE TABLE users (id text PRIMARY KEY, email text);
CREATE TABLE entities (
  id uuid PRIMARY KEY, type text, name text, year int, description text, essay text,
  position_x float, position_y float, origin jsonb, spotify_url text, wikipedia_url text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz, user_id text NOT NULL REFERENCES users(id));
CREATE TABLE relationships (
  id uuid PRIMARY KEY, from_id uuid, to_id uuid, deleted_at timestamptz,
  user_id text NOT NULL REFERENCES users(id));
CREATE TABLE quotes (
  id uuid PRIMARY KEY, entity_id uuid, deleted_at timestamptz,
  user_id text NOT NULL REFERENCES users(id));
CREATE TABLE momentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text, captured_at timestamptz,
  payload jsonb, note text, origin jsonb, embedding text, embedding_model text,
  embedding_at timestamptz, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz,
  user_id text NOT NULL REFERENCES users(id));
CREATE TABLE momento_entities (
  momento_id uuid, entity_id uuid, user_id text NOT NULL REFERENCES users(id),
  deleted_at timestamptz, PRIMARY KEY (momento_id, entity_id));

INSERT INTO users (id, email) VALUES ('u1', 'u1@test');

-- ============================================================================
-- 1) entities-merge.mts — keepId=K (1111), mergeIds={M (2222)}.
--    Escenario clave: X (4444) tiene un self-loop PREEXISTENTE ajeno al merge
--    que NO debe borrarse; los self-loops creados por el merge SÍ.
-- ============================================================================
INSERT INTO entities (id, type, name, user_id) VALUES
 ('11111111-1111-1111-1111-111111111111','persona','Keep','u1'),
 ('22222222-2222-2222-2222-222222222222','persona','Merge','u1'),
 ('33333333-3333-3333-3333-333333333333','persona','A','u1'),
 ('44444444-4444-4444-4444-444444444444','persona','X','u1');
INSERT INTO quotes (id, entity_id, user_id) VALUES
 ('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222','u1');
INSERT INTO relationships (id, from_id, to_id, user_id) VALUES
 ('a0000001-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','u1'),
 ('a0000002-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','u1'),
 ('a0000003-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','u1'),
 ('a0000004-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444444','u1'),
 ('a0000005-0000-0000-0000-000000000005','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','u1');
INSERT INTO momento_entities (momento_id, entity_id, user_id, deleted_at) VALUES
 ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','u1',NULL),
 ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','u1', now() - interval '1 day');

WITH reassign_quotes AS (
  UPDATE quotes SET entity_id = '11111111-1111-1111-1111-111111111111'
  WHERE entity_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) AND user_id = 'u1' RETURNING 1),
reassign_momentos AS (
  INSERT INTO momento_entities (momento_id, entity_id, user_id)
  SELECT momento_id, '11111111-1111-1111-1111-111111111111', 'u1' FROM momento_entities
  WHERE entity_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) AND user_id='u1' AND deleted_at IS NULL
  ON CONFLICT (momento_id, entity_id) DO UPDATE SET user_id=EXCLUDED.user_id, deleted_at=NULL RETURNING 1),
soft_delete_old_momentos AS (
  UPDATE momento_entities SET deleted_at = NOW()
  WHERE entity_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) AND user_id='u1' AND deleted_at IS NULL RETURNING 1),
reassign_rels AS (
  UPDATE relationships r SET
    from_id = CASE WHEN r.from_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) THEN '11111111-1111-1111-1111-111111111111' ELSE r.from_id END,
    to_id   = CASE WHEN r.to_id   = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) THEN '11111111-1111-1111-1111-111111111111' ELSE r.to_id END,
    deleted_at = CASE WHEN
      (CASE WHEN r.from_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) THEN '11111111-1111-1111-1111-111111111111' ELSE r.from_id END)
    = (CASE WHEN r.to_id   = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) THEN '11111111-1111-1111-1111-111111111111' ELSE r.to_id END)
      THEN NOW() ELSE r.deleted_at END
  WHERE (r.from_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) OR r.to_id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]))
    AND r.user_id='u1' AND r.deleted_at IS NULL RETURNING 1),
soft_delete_dupes AS (
  UPDATE entities SET deleted_at = NOW()
  WHERE id = ANY(ARRAY['22222222-2222-2222-2222-222222222222']::uuid[]) AND user_id='u1' RETURNING 1)
SELECT id FROM entities WHERE id='11111111-1111-1111-1111-111111111111' AND user_id='u1';

DO $$
BEGIN
  IF (SELECT entity_id FROM quotes WHERE id='66666666-6666-6666-6666-666666666666') <> '11111111-1111-1111-1111-111111111111' THEN RAISE EXCEPTION 'merge: cita no reasignada a K'; END IF;
  IF (SELECT count(*) FROM relationships WHERE id='a0000001-0000-0000-0000-000000000001' AND from_id='33333333-3333-3333-3333-333333333333' AND to_id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'merge: R1 A->K no quedó activa/reasignada'; END IF;
  IF (SELECT deleted_at FROM relationships WHERE id='a0000002-0000-0000-0000-000000000002') IS NULL THEN RAISE EXCEPTION 'merge: R2 self-loop del merge NO se borró'; END IF;
  IF (SELECT deleted_at FROM relationships WHERE id='a0000003-0000-0000-0000-000000000003') IS NULL THEN RAISE EXCEPTION 'merge: R3 self-loop del merge NO se borró'; END IF;
  IF (SELECT deleted_at FROM relationships WHERE id='a0000004-0000-0000-0000-000000000004') IS NOT NULL THEN RAISE EXCEPTION 'merge: BUG self-loop PREEXISTENTE de X se borró'; END IF;
  IF (SELECT count(*) FROM relationships WHERE id='a0000005-0000-0000-0000-000000000005' AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'merge: R5 intacta cambió'; END IF;
  IF (SELECT deleted_at FROM momento_entities WHERE momento_id='55555555-5555-5555-5555-555555555555' AND entity_id='11111111-1111-1111-1111-111111111111') IS NOT NULL THEN RAISE EXCEPTION 'merge: link (MO,K) no quedó activo'; END IF;
  IF (SELECT deleted_at FROM momento_entities WHERE momento_id='55555555-5555-5555-5555-555555555555' AND entity_id='22222222-2222-2222-2222-222222222222') IS NULL THEN RAISE EXCEPTION 'merge: link (MO,M) no se soft-deleteó'; END IF;
  IF (SELECT deleted_at FROM entities WHERE id='22222222-2222-2222-2222-222222222222') IS NULL THEN RAISE EXCEPTION 'merge: M no se soft-deleteó'; END IF;
  IF (SELECT deleted_at FROM entities WHERE id='11111111-1111-1111-1111-111111111111') IS NOT NULL THEN RAISE EXCEPTION 'merge: K se borró por error'; END IF;
  RAISE NOTICE 'OK entities-merge (self-loop preexistente preservado, ON CONFLICT reactivado)';
END $$;

-- ============================================================================
-- 2) entities.mts — cascade DELETE (sobre K) + restore con el mismo deleted_at.
-- ============================================================================
WITH ts AS (SELECT NOW() AS now),
del_entity AS (UPDATE entities SET deleted_at=(SELECT now FROM ts) WHERE id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL AND user_id='u1' RETURNING 1),
del_rels AS (UPDATE relationships SET deleted_at=(SELECT now FROM ts) WHERE (from_id='11111111-1111-1111-1111-111111111111' OR to_id='11111111-1111-1111-1111-111111111111') AND deleted_at IS NULL AND user_id='u1' RETURNING 1),
del_quotes AS (UPDATE quotes SET deleted_at=(SELECT now FROM ts) WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL AND user_id='u1' RETURNING 1),
del_links AS (UPDATE momento_entities SET deleted_at=(SELECT now FROM ts) WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL AND user_id='u1' RETURNING 1)
SELECT now AS deletedat FROM ts \gset

DO $$
DECLARE d timestamptz;
BEGIN
  SELECT deleted_at INTO d FROM entities WHERE id='11111111-1111-1111-1111-111111111111';
  IF d IS NULL THEN RAISE EXCEPTION 'delete: K no se borró'; END IF;
  IF (SELECT deleted_at FROM relationships WHERE id='a0000001-0000-0000-0000-000000000001') <> d THEN RAISE EXCEPTION 'delete: R1 no comparte deleted_at'; END IF;
  IF (SELECT deleted_at FROM quotes WHERE id='66666666-6666-6666-6666-666666666666') <> d THEN RAISE EXCEPTION 'delete: cita no comparte deleted_at'; END IF;
  IF (SELECT deleted_at FROM momento_entities WHERE momento_id='55555555-5555-5555-5555-555555555555' AND entity_id='11111111-1111-1111-1111-111111111111') <> d THEN RAISE EXCEPTION 'delete: link no comparte deleted_at'; END IF;
  RAISE NOTICE 'OK cascade DELETE (deleted_at compartido)';
END $$;

WITH restore_entity AS (UPDATE entities SET deleted_at=NULL WHERE id='11111111-1111-1111-1111-111111111111' AND deleted_at=:'deletedat' AND user_id='u1' RETURNING 1),
restore_rels AS (UPDATE relationships SET deleted_at=NULL WHERE (from_id='11111111-1111-1111-1111-111111111111' OR to_id='11111111-1111-1111-1111-111111111111') AND deleted_at=:'deletedat' AND user_id='u1' RETURNING 1),
restore_quotes AS (UPDATE quotes SET deleted_at=NULL WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at=:'deletedat' AND user_id='u1' RETURNING 1),
restore_links AS (UPDATE momento_entities SET deleted_at=NULL WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at=:'deletedat' AND user_id='u1' RETURNING 1)
SELECT 1;

DO $$
BEGIN
  IF (SELECT deleted_at FROM entities WHERE id='11111111-1111-1111-1111-111111111111') IS NOT NULL THEN RAISE EXCEPTION 'restore: K no se restauró'; END IF;
  IF (SELECT deleted_at FROM relationships WHERE id='a0000001-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'restore: R1 no se restauró'; END IF;
  RAISE NOTICE 'OK restore (mismo deleted_at revertido)';
END $$;

-- ============================================================================
-- 3) momentos.mts — POST: crea momento + linkea entidades en un solo CTE.
--    (embedding va NULL: el test valida la atomicidad momento+links, no el vector)
-- ============================================================================
INSERT INTO entities (id, type, name, user_id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','persona','E1','u1'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','persona','E2','u1');

WITH ins AS (
  INSERT INTO momentos (kind, captured_at, payload, note, origin, embedding, embedding_model, embedding_at, user_id)
  VALUES ('recorte', NOW(), '{"title":"X"}'::jsonb, NULL, '{"kind":"manual"}'::jsonb, NULL, NULL, NULL, 'u1')
  RETURNING id, kind, captured_at, payload, note, origin, created_at, updated_at
),
link AS (
  INSERT INTO momento_entities (momento_id, entity_id, user_id)
  SELECT (SELECT id FROM ins), e_id, 'u1'
  FROM unnest(ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']::uuid[]) AS e_id
  ON CONFLICT (momento_id, entity_id) DO UPDATE SET user_id = EXCLUDED.user_id, deleted_at = NULL
  RETURNING 1
)
SELECT id FROM ins;

DO $$
DECLARE mid uuid;
BEGIN
  -- Único momento del test (kind='recorte'); su id no se puede interpolar dentro
  -- de un bloque DO, así que lo leemos a una variable plpgsql.
  SELECT id INTO mid FROM momentos WHERE kind='recorte';
  IF mid IS NULL THEN RAISE EXCEPTION 'momento-post: el momento no se creó'; END IF;
  IF (SELECT count(*) FROM momento_entities WHERE momento_id=mid AND deleted_at IS NULL) <> 2 THEN RAISE EXCEPTION 'momento-post: no se crearon los 2 links'; END IF;
  RAISE NOTICE 'OK momento POST (momento + 2 links atómicos)';
END $$;

SELECT 'TODOS LOS CTE OK' AS resultado;
