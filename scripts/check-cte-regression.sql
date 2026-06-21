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
--   netlify/functions/notes.mts           (DELETE + restore — patrón compartido con tasks/prompts)
--   netlify/functions/_lib/whatsapp/persist-media.ts (persistImageRecorteEvent)
--   netlify/functions/_lib/whatsapp/album.ts          (appendImagesToRecorteEvent)
--   netlify/functions/_lib/whatsapp/description.ts    (consumeAwaitingDescription)
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
del_entity AS (UPDATE entities SET deleted_at=(SELECT now FROM ts) WHERE id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL AND user_id='u1' RETURNING deleted_at),
del_rels AS (UPDATE relationships SET deleted_at=(SELECT now FROM ts) WHERE (from_id='11111111-1111-1111-1111-111111111111' OR to_id='11111111-1111-1111-1111-111111111111') AND deleted_at IS NULL AND user_id='u1' AND EXISTS (SELECT 1 FROM del_entity) RETURNING 1),
del_quotes AS (UPDATE quotes SET deleted_at=(SELECT now FROM ts) WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL AND user_id='u1' AND EXISTS (SELECT 1 FROM del_entity) RETURNING 1),
del_links AS (UPDATE momento_entities SET deleted_at=(SELECT now FROM ts) WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at IS NULL AND user_id='u1' AND EXISTS (SELECT 1 FROM del_entity) RETURNING 1)
SELECT deleted_at AS deletedat FROM del_entity \gset

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
restore_rels AS (UPDATE relationships SET deleted_at=NULL WHERE (from_id='11111111-1111-1111-1111-111111111111' OR to_id='11111111-1111-1111-1111-111111111111') AND deleted_at=:'deletedat' AND user_id='u1' AND EXISTS (SELECT 1 FROM restore_entity) RETURNING 1),
restore_quotes AS (UPDATE quotes SET deleted_at=NULL WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at=:'deletedat' AND user_id='u1' AND EXISTS (SELECT 1 FROM restore_entity) RETURNING 1),
restore_links AS (UPDATE momento_entities SET deleted_at=NULL WHERE entity_id='11111111-1111-1111-1111-111111111111' AND deleted_at=:'deletedat' AND user_id='u1' AND EXISTS (SELECT 1 FROM restore_entity) RETURNING 1)
SELECT EXISTS(SELECT 1 FROM restore_entity) AS restored;

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


-- ============================================================================
-- 4) notes.mts (≡ tasks.mts / prompts.mts) — DELETE con cascade de anexos en un
--    solo CTE (mismo deleted_at para fila + anexos) y su restore simétrico.
--    Los tres handlers comparten el patrón letra por letra (cambia la tabla y
--    el owner_type); validar uno valida la forma de los tres.
-- ============================================================================
CREATE TABLE notes (
  id uuid PRIMARY KEY, content text, updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz, user_id text NOT NULL REFERENCES users(id));
CREATE TABLE notas_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_type text, owner_id text,
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz,
  user_id text NOT NULL REFERENCES users(id));

INSERT INTO notes (id, content, user_id)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'nota con anexos', 'u1');
INSERT INTO notas_attachments (owner_type, owner_id, user_id) VALUES
  ('note', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'u1'),
  ('note', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'u1');

-- DELETE (copiado de notes.mts):
WITH del_note AS (
  UPDATE notes SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND deleted_at IS NULL AND user_id = 'u1'
  RETURNING deleted_at
),
del_attachments AS (
  UPDATE notas_attachments
  SET deleted_at = (SELECT deleted_at FROM del_note), updated_at = NOW()
  WHERE owner_type = 'note' AND owner_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    AND deleted_at IS NULL AND user_id = 'u1'
    AND EXISTS (SELECT 1 FROM del_note)
  RETURNING 1
)
SELECT deleted_at FROM del_note;

DO $$
DECLARE note_deleted timestamptz;
BEGIN
  SELECT deleted_at INTO note_deleted FROM notes WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF note_deleted IS NULL THEN RAISE EXCEPTION 'note-delete: la nota no se borró'; END IF;
  IF (SELECT count(*) FROM notas_attachments WHERE owner_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND deleted_at = note_deleted) <> 2 THEN
    RAISE EXCEPTION 'note-delete: los anexos no comparten el deleted_at de la nota';
  END IF;
  RAISE NOTICE 'OK note DELETE (fila + anexos, mismo deleted_at)';
END $$;

-- restore (copiado de notes.mts) — usa el deleted_at exacto del DELETE; el
-- handler interpola ${deletedAt}, acá lo emulamos con una variable plpgsql:
DO $$
DECLARE
  note_deleted timestamptz;
  restored boolean;
BEGIN
  SELECT deleted_at INTO note_deleted FROM notes WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  WITH restore_note AS (
    UPDATE notes SET deleted_at = NULL, updated_at = NOW()
    WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND deleted_at = note_deleted AND user_id = 'u1'
    RETURNING 1
  ),
  restore_attachments AS (
    UPDATE notas_attachments SET deleted_at = NULL, updated_at = NOW()
    WHERE owner_type = 'note' AND owner_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      AND deleted_at = note_deleted AND user_id = 'u1'
      AND EXISTS (SELECT 1 FROM restore_note)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM restore_note) INTO restored;
  IF NOT restored THEN RAISE EXCEPTION 'note-restore: el CTE no restauró nada'; END IF;
END $$;

DO $$
BEGIN
  IF (SELECT deleted_at FROM notes WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') IS NOT NULL THEN
    RAISE EXCEPTION 'note-restore: la nota no se restauró';
  END IF;
  IF (SELECT count(*) FROM notas_attachments WHERE owner_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND deleted_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'note-restore: los anexos no se restauraron';
  END IF;
  RAISE NOTICE 'OK note restore (mismo deleted_at revertido, anexos incluidos)';
END $$;

-- ============================================================================
-- 5) persist-media.ts — persistImageRecorteEvent: recorte (portada) + N imágenes
--    en un solo CTE con `unnest(keys, mimes) WITH ORDINALITY` (position 0-based).
--    Valida la atomicidad del evento multi-imagen, el emparejado key↔mime por
--    ordinalidad y la compatibilidad con el índice único (recorte_id, position).
-- ============================================================================
CREATE TABLE recortes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), text text NOT NULL,
  image_key text, capture_mode text, captured_at timestamptz,
  status text, source text, deleted_at timestamptz,
  user_id text NOT NULL REFERENCES users(id));
CREATE TABLE recorte_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorte_id uuid NOT NULL REFERENCES recortes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  storage_key text NOT NULL, mime text NOT NULL,
  position int NOT NULL DEFAULT 0 CHECK (position >= 0));
CREATE UNIQUE INDEX recorte_images_recorte_pos_uidx ON recorte_images (recorte_id, position);

-- CTE copiado de persistImageRecorteEvent (los ARRAY[...] emulan ${keys}/${mimes}):
WITH new_recorte AS (
  INSERT INTO recortes (text, image_key, capture_mode, captured_at, status, source, user_id)
  VALUES ('📸 3 imágenes desde WhatsApp', 'u1/a.webp', 'image', NOW(), 'pending', 'whatsapp', 'u1')
  RETURNING id
),
imgs AS (
  INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
  SELECT r.id, 'u1', x.key, x.mime, (x.ord - 1)::int
  FROM new_recorte r,
    unnest(
      ARRAY['u1/a.webp','u1/b.webp','u1/c.webp']::text[],
      ARRAY['image/webp','image/webp','image/jpeg']::text[]
    ) WITH ORDINALITY AS x(key, mime, ord)
  RETURNING 1
)
SELECT id FROM new_recorte;

DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM recortes WHERE source='whatsapp' AND deleted_at IS NULL LIMIT 1;
  IF rid IS NULL THEN RAISE EXCEPTION 'recorte-event: no se creó el recorte'; END IF;
  IF (SELECT count(*) FROM recorte_images WHERE recorte_id = rid) <> 3 THEN
    RAISE EXCEPTION 'recorte-event: no se insertaron las 3 imágenes (atomicidad rota)';
  END IF;
  IF (SELECT array_agg(position ORDER BY position) FROM recorte_images WHERE recorte_id = rid) <> ARRAY[0,1,2] THEN
    RAISE EXCEPTION 'recorte-event: las posiciones no son 0,1,2 por ordinalidad';
  END IF;
  IF (SELECT storage_key FROM recorte_images WHERE recorte_id = rid AND position = 1) <> 'u1/b.webp' THEN
    RAISE EXCEPTION 'recorte-event: el emparejado key↔position no respeta el orden';
  END IF;
  IF (SELECT mime FROM recorte_images WHERE recorte_id = rid AND position = 2) <> 'image/jpeg' THEN
    RAISE EXCEPTION 'recorte-event: el emparejado key↔mime se desalineó';
  END IF;
  RAISE NOTICE 'OK recorte-event (recorte + 3 imágenes, position 0..2 por ordinalidad, key↔mime alineado)';
END $$;

-- ============================================================================
-- 6) album.ts — appendImagesToRecorteEvent: anexa fotos a un recorte-evento
--    (álbum partido). (a) promueve un recorte de 1 imagen insertando su portada
--    como posición 0 y luego las nuevas; (b) anexa tras la última posición.
--    Los CTE corren top-level (como en producción, vía el driver), con un id
--    literal; las aserciones van aparte. Valida el cálculo de posición.
-- ============================================================================
INSERT INTO recortes (id, text, image_key, capture_mode, captured_at, status, source, user_id)
VALUES ('77777777-7777-4777-8777-777777777777', 'foto suelta', 'u1/cover.png', 'image', NOW(), 'pending', 'whatsapp', 'u1');

-- (a) Recorte LEGACY de una imagen → anexar 2 (la portada debe entrar en pos 0):
WITH rec AS (
  SELECT id, image_key, user_id FROM recortes
  WHERE id = '77777777-7777-4777-8777-777777777777' AND user_id = 'u1' AND deleted_at IS NULL
),
existing AS (
  SELECT COALESCE(MAX(position), -1) AS maxpos, COUNT(*)::int AS n
  FROM recorte_images WHERE recorte_id = '77777777-7777-4777-8777-777777777777'
),
cover AS (
  INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
  SELECT rec.id, rec.user_id, rec.image_key,
    CASE WHEN rec.image_key ILIKE '%.png' THEN 'image/png' WHEN rec.image_key ILIKE '%.webp' THEN 'image/webp'
         WHEN rec.image_key ILIKE '%.gif' THEN 'image/gif' ELSE 'image/jpeg' END,
    0
  FROM rec, existing WHERE existing.n = 0 AND rec.image_key IS NOT NULL
  RETURNING 1
),
appended AS (
  INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
  SELECT rec.id, rec.user_id, x.key, x.mime,
    (CASE WHEN existing.n = 0 AND rec.image_key IS NOT NULL THEN 1 WHEN existing.n = 0 THEN 0 ELSE existing.maxpos + 1 END) + (x.ord - 1)::int
  FROM rec, existing,
    unnest(ARRAY['u1/p1.jpg','u1/p2.webp']::text[], ARRAY['image/jpeg','image/webp']::text[]) WITH ORDINALITY AS x(key, mime, ord)
  RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM rec) AS found, (SELECT n FROM existing) AS existing_n;

-- (b) Anexar 1 más al mismo evento (ya tiene 3 → nueva en posición 3):
WITH rec AS (
  SELECT id, image_key, user_id FROM recortes
  WHERE id = '77777777-7777-4777-8777-777777777777' AND user_id = 'u1' AND deleted_at IS NULL
),
existing AS (
  SELECT COALESCE(MAX(position), -1) AS maxpos, COUNT(*)::int AS n
  FROM recorte_images WHERE recorte_id = '77777777-7777-4777-8777-777777777777'
),
cover AS (
  INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
  SELECT rec.id, rec.user_id, rec.image_key, 'image/png', 0
  FROM rec, existing WHERE existing.n = 0 AND rec.image_key IS NOT NULL
  RETURNING 1
),
appended AS (
  INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
  SELECT rec.id, rec.user_id, x.key, x.mime,
    (CASE WHEN existing.n = 0 AND rec.image_key IS NOT NULL THEN 1 WHEN existing.n = 0 THEN 0 ELSE existing.maxpos + 1 END) + (x.ord - 1)::int
  FROM rec, existing,
    unnest(ARRAY['u1/p3.jpg']::text[], ARRAY['image/jpeg']::text[]) WITH ORDINALITY AS x(key, mime, ord)
  RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM rec) AS found;

DO $$
DECLARE rid uuid := '77777777-7777-4777-8777-777777777777';
BEGIN
  IF (SELECT array_agg(position ORDER BY position) FROM recorte_images WHERE recorte_id = rid) <> ARRAY[0,1,2,3] THEN
    RAISE EXCEPTION 'album-append: posiciones esperadas 0,1,2,3 (portada + 3 anexadas)';
  END IF;
  IF (SELECT storage_key FROM recorte_images WHERE recorte_id = rid AND position = 0) <> 'u1/cover.png' THEN
    RAISE EXCEPTION 'album-append: la portada legacy no quedó en posición 0';
  END IF;
  IF (SELECT mime FROM recorte_images WHERE recorte_id = rid AND position = 0) <> 'image/png' THEN
    RAISE EXCEPTION 'album-append: el mime de la portada no se derivó de la extensión';
  END IF;
  IF (SELECT storage_key FROM recorte_images WHERE recorte_id = rid AND position = 3) <> 'u1/p3.jpg' THEN
    RAISE EXCEPTION 'album-append: el anexado posterior no quedó en la posición 3';
  END IF;
  RAISE NOTICE 'OK album-append (promoción de 1→evento en pos 0, anexado posterior sin huecos)';
END $$;

-- ============================================================================
-- 7) description.ts — consumeAwaitingDescription: reclama-y-limpia el puntero
--    awaiting_desc en UN solo statement. `FOR UPDATE` serializa consumidores
--    concurrentes; la CTE captura los valores VIEJOS antes de limpiarlos y
--    RETURNING los devuelve. Valida: (a) el claim devuelve el puntero viejo y lo
--    deja en NULL atómicamente; (b) un segundo claim ya no encuentra nada (el
--    "perdedor" trata su texto como captura nueva, no pisa la descripción).
-- ============================================================================
CREATE TABLE whatsapp_links (
  phone_e164 text NOT NULL, user_id text NOT NULL REFERENCES users(id),
  awaiting_desc_kind text, awaiting_desc_id uuid, awaiting_desc_at timestamptz,
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz,
  PRIMARY KEY (phone_e164, user_id));

INSERT INTO whatsapp_links (phone_e164, user_id, awaiting_desc_kind, awaiting_desc_id, awaiting_desc_at)
VALUES ('+56900000000', 'u1', 'recorte', '88888888-8888-4888-8888-888888888888', NOW());

-- Las filas del RETURNING (transitorias; el handler las lee del driver) se
-- persisten en una tabla throwaway para aseverar después desde un DO block.
CREATE TABLE desc_claim_out (attempt int, kind text, id uuid);

-- Primer claim (CTE copiado de consumeAwaitingDescription): debe devolver el
-- puntero VIEJO (la CTE lo captura antes de que el UPDATE lo limpie).
WITH claimed AS (
  SELECT awaiting_desc_kind AS kind, awaiting_desc_id AS id
  FROM whatsapp_links
  WHERE phone_e164 = '+56900000000' AND user_id = 'u1' AND deleted_at IS NULL
    AND awaiting_desc_id IS NOT NULL
    AND awaiting_desc_at > NOW() - (300 || ' seconds')::interval
  FOR UPDATE
),
upd AS (
  UPDATE whatsapp_links w
  SET awaiting_desc_kind = NULL, awaiting_desc_id = NULL,
      awaiting_desc_at = NULL, updated_at = NOW()
  FROM claimed
  WHERE w.phone_e164 = '+56900000000' AND w.user_id = 'u1' AND w.deleted_at IS NULL
  RETURNING claimed.kind AS kind, claimed.id AS id
)
INSERT INTO desc_claim_out (attempt, kind, id) SELECT 1, kind, id FROM upd;

-- Segundo claim, ya sin puntero (el "perdedor"): no debe devolver/insertar nada.
WITH claimed AS (
  SELECT awaiting_desc_kind AS kind, awaiting_desc_id AS id
  FROM whatsapp_links
  WHERE phone_e164 = '+56900000000' AND user_id = 'u1' AND deleted_at IS NULL
    AND awaiting_desc_id IS NOT NULL
    AND awaiting_desc_at > NOW() - (300 || ' seconds')::interval
  FOR UPDATE
),
upd AS (
  UPDATE whatsapp_links w
  SET awaiting_desc_kind = NULL, awaiting_desc_id = NULL,
      awaiting_desc_at = NULL, updated_at = NOW()
  FROM claimed
  WHERE w.phone_e164 = '+56900000000' AND w.user_id = 'u1' AND w.deleted_at IS NULL
  RETURNING claimed.kind AS kind, claimed.id AS id
)
INSERT INTO desc_claim_out (attempt, kind, id) SELECT 2, kind, id FROM upd;

DO $$
BEGIN
  IF (SELECT count(*) FROM desc_claim_out WHERE attempt = 1) <> 1
     OR (SELECT kind FROM desc_claim_out WHERE attempt = 1 LIMIT 1) <> 'recorte' THEN
    RAISE EXCEPTION 'desc-claim: el primer claim no devolvió el puntero viejo (kind=recorte)';
  END IF;
  IF (SELECT awaiting_desc_id FROM whatsapp_links WHERE phone_e164='+56900000000' AND user_id='u1') IS NOT NULL THEN
    RAISE EXCEPTION 'desc-claim: el puntero no se limpió atómicamente en el mismo statement';
  END IF;
  IF (SELECT count(*) FROM desc_claim_out WHERE attempt = 2) <> 0 THEN
    RAISE EXCEPTION 'desc-claim: el segundo claim devolvió filas (dos textos ganarían el mismo puntero)';
  END IF;
  RAISE NOTICE 'OK desc-claim (reclama+limpia atómico; el segundo consumidor no encuentra nada)';
END $$;

-- ============================================================================
-- 8) library-read-model.ts — fetchLibraryRows: el read-model UNION de la
--    Biblioteca. Prueba que la query es válida contra el esquema real (6 ramas
--    heterogéneas con tipos alineados, LEFT JOIN a la tabla decoradora, filtros
--    centinela). El SQL está COPIADO de netlify/functions/_lib/library-read-model.ts;
--    si tocás la query allá, actualizá esta copia.
--
--    Recreamos las tablas fuente con TODAS las columnas que la query referencia
--    (las secciones previas las crearon con un subconjunto). Las secciones 1–7
--    ya corrieron sus aserciones, así que dropear acá es seguro.
-- ============================================================================
DROP TABLE IF EXISTS
  library_item_overrides, pdf_stamp_assets, pdf_studio_saved_pdfs,
  notas_attachments, recorte_images, recortes, momentos CASCADE;

CREATE TABLE notas_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id),
  owner_type text, owner_id uuid,
  file_name text, mime_type text, byte_size int, storage_key text,
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz);

CREATE TABLE recortes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), text text NOT NULL,
  source_title text, image_key text, capture_mode text, status text,
  source text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz, user_id text NOT NULL REFERENCES users(id));

CREATE TABLE recorte_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorte_id uuid NOT NULL REFERENCES recortes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  storage_key text NOT NULL, mime text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now());

CREATE TABLE momentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text, captured_at timestamptz,
  payload jsonb, note text, origin jsonb NOT NULL DEFAULT '{"kind":"manual"}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz, user_id text NOT NULL REFERENCES users(id));

CREATE TABLE pdf_studio_saved_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES users(id),
  saved_doc_id text, name text, kind text, mime_type text, byte_size int, storage_key text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz);

CREATE TABLE pdf_stamp_assets (
  id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
  kind text, name text, src text, mime_type text, width int, height int, byte_size int,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  last_used_at timestamptz, deleted_at timestamptz,
  PRIMARY KEY (user_id, id));

-- Tabla decoradora (espejo de la migración 20260621130000_library_item_overrides).
CREATE TABLE library_item_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_kind text NOT NULL, item_id text NOT NULL,
  display_title text, tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false, ai_status text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_kind, item_id));

-- Fixtures: una fila por rama + casos límite (override que renombra/oculta,
-- recorte legacy vs multi, momento foto con storageKey, otro usuario).
INSERT INTO users (id, email) VALUES ('u2', 'u2@test');

-- Rama 1: adjunto subido (documento) + adjunto generado por IA (otro usuario, no debe salir).
INSERT INTO notas_attachments (id, user_id, owner_type, owner_id, file_name, mime_type, byte_size, storage_key, origin, created_at, updated_at) VALUES
 ('c1111111-1111-4111-8111-111111111111','u1','note',NULL,'apunte.txt','text/plain',10,'u1/apunte.txt','{"kind":"manual"}','2026-06-01','2026-06-01'),
 ('c1111111-1111-4111-8111-111111111112','u1','note',NULL,'reporte.pdf','application/pdf',2048,'u1/reporte.pdf','{"kind":"ai"}','2026-06-02','2026-06-02'),
 ('c1111111-1111-4111-8111-111111111113','u2','note',NULL,'ajeno.txt','text/plain',5,'u2/ajeno.txt','{"kind":"manual"}','2026-06-02','2026-06-02');

-- Rama 2/3: un recorte multi-imagen (whatsapp) + un recorte legacy (image_key, sin recorte_images).
INSERT INTO recortes (id, user_id, text, source_title, image_key, source, created_at, updated_at) VALUES
 ('c2222222-2222-4222-8222-222222222221','u1','rec multi','Multi WA',NULL,'whatsapp','2026-06-03','2026-06-03'),
 ('c2222222-2222-4222-8222-222222222222','u1','rec legacy','',  'u1/legacy.webp','captura','2026-06-04','2026-06-04');
INSERT INTO recorte_images (id, recorte_id, user_id, storage_key, mime, position, created_at) VALUES
 ('c3333333-3333-4333-8333-333333333331','c2222222-2222-4222-8222-222222222221','u1','u1/multi-0.webp','image/webp',0,'2026-06-03');

-- Rama 4: momento foto con storageKey + momento nota (no debe salir) + foto sin storageKey (no debe salir).
INSERT INTO momentos (id, user_id, kind, captured_at, payload, origin, created_at, updated_at) VALUES
 ('c4444444-4444-4444-8444-444444444441','u1','foto','2026-06-05','{"caption":"Atardecer","storageKey":"u1/foto.jpg"}','{"kind":"manual"}','2026-06-05','2026-06-05'),
 ('c4444444-4444-4444-8444-444444444442','u1','nota','2026-06-05','{"bodyText":"x"}','{"kind":"manual"}','2026-06-05','2026-06-05'),
 ('c4444444-4444-4444-8444-444444444443','u1','foto','2026-06-05','{"caption":"sin blob"}','{"kind":"manual"}','2026-06-05','2026-06-05');

-- Rama 5: PDF guardado.
INSERT INTO pdf_studio_saved_pdfs (id, user_id, saved_doc_id, name, kind, mime_type, byte_size, storage_key, created_at, updated_at) VALUES
 ('c5555555-5555-4555-8555-555555555551','u1','doc-1','Contrato','creation','application/pdf',4096,'u1/contrato.pdf','2026-06-06','2026-06-06');

-- Rama 6: firma.
INSERT INTO pdf_stamp_assets (id, user_id, kind, name, src, mime_type, byte_size, created_at, updated_at) VALUES
 ('stamp-1','u1','signature','Mi firma','data:image/png;base64,AAAA','image/png',128,'2026-06-07','2026-06-07');

-- Overrides: renombra el apunte; oculta (soft-delete Biblioteca) el PDF guardado.
INSERT INTO library_item_overrides (user_id, item_kind, item_id, display_title, deleted_at) VALUES
 ('u1','notas-attachment','c1111111-1111-4111-8111-111111111111','Apunte renombrado',NULL),
 ('u1','pdf-saved','c5555555-5555-4555-8555-555555555551',NULL, now());

-- Persistimos el resultado del read-model en una tabla throwaway para aseverar.
CREATE TABLE library_probe (
  item_kind text, item_id text, title text, mime_type text, byte_size bigint,
  file_type text, source text, storage_key text, storage_domain text,
  created_at timestamptz, updated_at timestamptz, tags text[], pinned boolean, ai_status text);

-- Caso A: listado por defecto (no eliminados, sin filtros), user u1.
-- (SQL copiado de fetchLibraryRows; ${userId}='u1', ${incluyeEliminados}=false,
--  ${tab}='todo', ${tipo}='', ${fuente}='', ${q}='').
INSERT INTO library_probe
WITH base AS (
  SELECT 'notas-attachment'::text AS item_kind, na.id::text AS item_id, na.user_id AS user_id,
    na.file_name AS title_native, na.mime_type AS mime_type, na.byte_size::bigint AS byte_size,
    CASE
      WHEN na.mime_type LIKE 'image/%' THEN 'image'
      WHEN na.mime_type = 'application/pdf' THEN 'pdf'
      WHEN na.mime_type LIKE 'audio/%' THEN 'audio'
      WHEN na.mime_type LIKE 'video/%' THEN 'video'
      WHEN na.mime_type IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv') THEN 'spreadsheet'
      WHEN na.mime_type IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation') THEN 'presentation'
      WHEN na.mime_type = 'application/msword' OR na.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' OR na.mime_type = 'application/json' OR na.mime_type LIKE 'text/%' THEN 'document'
      ELSE 'other'
    END AS file_type,
    CASE WHEN na.origin->>'kind' = 'ai' THEN 'generado' ELSE 'subido' END AS source,
    na.storage_key AS storage_key, 'notas-attachments'::text AS storage_domain,
    na.created_at AS created_at, na.updated_at AS updated_at
  FROM notas_attachments na WHERE na.deleted_at IS NULL AND na.user_id = 'u1'
  UNION ALL
  SELECT 'recorte-image'::text, ri.id::text, ri.user_id,
    COALESCE(NULLIF(r.source_title, ''), 'Recorte'), ri.mime, NULL::bigint, 'image'::text,
    CASE WHEN r.source = 'whatsapp' THEN 'whatsapp' ELSE 'capturado' END,
    ri.storage_key, 'recortes-media'::text, ri.created_at, r.updated_at
  FROM recorte_images ri JOIN recortes r ON r.id = ri.recorte_id AND r.deleted_at IS NULL
  WHERE ri.user_id = 'u1'
  UNION ALL
  SELECT 'recorte-image'::text, r.id::text, r.user_id,
    COALESCE(NULLIF(r.source_title, ''), 'Recorte'), NULL::text, NULL::bigint, 'image'::text,
    CASE WHEN r.source = 'whatsapp' THEN 'whatsapp' ELSE 'capturado' END,
    r.image_key, 'recortes-media'::text, r.created_at, r.updated_at
  FROM recortes r
  WHERE r.deleted_at IS NULL AND r.user_id = 'u1' AND r.image_key IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM recorte_images ri2 WHERE ri2.recorte_id = r.id)
  UNION ALL
  SELECT 'momento-foto'::text, m.id::text, m.user_id,
    COALESCE(NULLIF(m.payload->>'caption', ''), 'Foto'), NULL::text, NULL::bigint, 'image'::text,
    CASE WHEN m.origin->>'kind' = 'ai' THEN 'generado' ELSE 'capturado' END,
    COALESCE(m.payload->>'storageKey', m.payload->>'primaryStorageKey', m.payload->'items'->0->>'storageKey', m.payload->'photos'->0->>'storageKey'),
    'momentos-media'::text, m.created_at, m.updated_at
  FROM momentos m
  WHERE m.deleted_at IS NULL AND m.kind = 'foto' AND m.user_id = 'u1'
    AND COALESCE(m.payload->>'storageKey', m.payload->>'primaryStorageKey', m.payload->'items'->0->>'storageKey', m.payload->'photos'->0->>'storageKey') IS NOT NULL
  UNION ALL
  SELECT 'pdf-saved'::text, sp.id::text, sp.user_id, sp.name, sp.mime_type, sp.byte_size::bigint,
    CASE
      WHEN sp.mime_type LIKE 'image/%' THEN 'image'
      WHEN sp.mime_type = 'application/pdf' THEN 'pdf'
      WHEN sp.mime_type LIKE 'audio/%' THEN 'audio'
      WHEN sp.mime_type LIKE 'video/%' THEN 'video'
      WHEN sp.mime_type IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv') THEN 'spreadsheet'
      WHEN sp.mime_type IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation') THEN 'presentation'
      WHEN sp.mime_type = 'application/msword' OR sp.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' OR sp.mime_type = 'application/json' OR sp.mime_type LIKE 'text/%' THEN 'document'
      ELSE 'other'
    END,
    'generado'::text, sp.storage_key, 'pdf-studio-saved-pdfs'::text, sp.created_at, sp.updated_at
  FROM pdf_studio_saved_pdfs sp WHERE sp.deleted_at IS NULL AND sp.user_id = 'u1'
  UNION ALL
  SELECT 'pdf-stamp'::text, ps.id, ps.user_id, ps.name, ps.mime_type, ps.byte_size::bigint,
    'image'::text, 'generado'::text, NULL::text, 'pdf-stamp-assets'::text, ps.created_at, ps.updated_at
  FROM pdf_stamp_assets ps WHERE ps.deleted_at IS NULL AND ps.user_id = 'u1'
),
joined AS (
  SELECT base.item_kind, base.item_id, base.user_id,
    COALESCE(o.display_title, base.title_native) AS title,
    base.mime_type, base.byte_size, base.file_type, base.source, base.storage_key, base.storage_domain,
    base.created_at, base.updated_at, o.tags AS tags, o.pinned AS pinned, o.ai_status AS ai_status,
    o.deleted_at AS lib_deleted_at
  FROM base
  LEFT JOIN library_item_overrides o
    ON o.user_id = base.user_id AND o.item_kind = base.item_kind AND o.item_id = base.item_id
)
SELECT item_kind, item_id, title, mime_type, byte_size, file_type, source, storage_key, storage_domain,
  created_at, updated_at, COALESCE(tags, '{}') AS tags, COALESCE(pinned, false) AS pinned, ai_status
FROM joined
WHERE ((false::boolean AND lib_deleted_at IS NOT NULL) OR (NOT false::boolean AND lib_deleted_at IS NULL))
  AND ('todo' = 'todo' OR ('todo' = 'imagenes' AND file_type = 'image') OR ('todo' = 'archivos' AND file_type <> 'image'))
  AND ('' = '' OR file_type = '')
  AND ('' = '' OR source = '')
  AND ('' = '' OR title ILIKE '%' || '' || '%')
ORDER BY updated_at DESC
LIMIT 5000;

DO $$
BEGIN
  -- 7 fuentes activas - 1 oculta por override (pdf-saved) = 6 items visibles.
  IF (SELECT count(*) FROM library_probe) <> 6 THEN
    RAISE EXCEPTION 'biblioteca: esperaba 6 items visibles, hubo %', (SELECT count(*) FROM library_probe);
  END IF;
  -- Aislamiento por usuario: nada de u2.
  IF EXISTS (SELECT 1 FROM library_probe WHERE storage_key LIKE 'u2/%') THEN
    RAISE EXCEPTION 'biblioteca: se filtró un item de otro usuario';
  END IF;
  -- El override renombró el apunte.
  IF (SELECT title FROM library_probe WHERE item_id = 'c1111111-1111-4111-8111-111111111111') <> 'Apunte renombrado' THEN
    RAISE EXCEPTION 'biblioteca: el display_title del override no se aplicó';
  END IF;
  -- El PDF guardado (oculto por override.deleted_at) no aparece.
  IF EXISTS (SELECT 1 FROM library_probe WHERE item_kind = 'pdf-saved') THEN
    RAISE EXCEPTION 'biblioteca: un item con override.deleted_at no se ocultó';
  END IF;
  -- file_type derivado del mime: pdf y document.
  IF (SELECT file_type FROM library_probe WHERE item_id = 'c1111111-1111-4111-8111-111111111112') <> 'pdf' THEN
    RAISE EXCEPTION 'biblioteca: application/pdf no derivó file_type=pdf';
  END IF;
  IF (SELECT source FROM library_probe WHERE item_id = 'c1111111-1111-4111-8111-111111111112') <> 'generado' THEN
    RAISE EXCEPTION 'biblioteca: origin.kind=ai no derivó source=generado';
  END IF;
  -- Recorte multi (whatsapp) y legacy (captura) presentes con su fuente.
  IF (SELECT source FROM library_probe WHERE item_id = 'c3333333-3333-4333-8333-333333333331') <> 'whatsapp' THEN
    RAISE EXCEPTION 'biblioteca: recorte whatsapp no derivó source=whatsapp';
  END IF;
  IF (SELECT storage_key FROM library_probe WHERE item_id = 'c2222222-2222-4222-8222-222222222222') <> 'u1/legacy.webp' THEN
    RAISE EXCEPTION 'biblioteca: recorte legacy no expuso image_key como storage_key';
  END IF;
  -- Momento foto: resuelve storageKey y caption.
  IF (SELECT storage_key FROM library_probe WHERE item_id = 'c4444444-4444-4444-8444-444444444441') <> 'u1/foto.jpg' THEN
    RAISE EXCEPTION 'biblioteca: momento foto no resolvió storageKey del payload';
  END IF;
  IF EXISTS (SELECT 1 FROM library_probe WHERE item_id = 'c4444444-4444-4444-8444-444444444443') THEN
    RAISE EXCEPTION 'biblioteca: foto sin storageKey no debía aparecer';
  END IF;
  -- Firma: storage_key NULL, file_type image.
  IF (SELECT storage_key FROM library_probe WHERE item_kind = 'pdf-stamp') IS NOT NULL THEN
    RAISE EXCEPTION 'biblioteca: pdf-stamp debería tener storage_key NULL';
  END IF;
  RAISE NOTICE 'OK biblioteca read-model (6 ramas, override rename+hide, aislamiento por usuario)';
END $$;

-- Caso B: papelera (incluyeEliminados=true) → solo el PDF oculto por override.
TRUNCATE library_probe;
INSERT INTO library_probe
WITH base AS (
  SELECT 'pdf-saved'::text AS item_kind, sp.id::text AS item_id, sp.user_id AS user_id,
    sp.name AS title_native, sp.mime_type AS mime_type, sp.byte_size::bigint AS byte_size,
    'pdf'::text AS file_type, 'generado'::text AS source, sp.storage_key AS storage_key,
    'pdf-studio-saved-pdfs'::text AS storage_domain, sp.created_at AS created_at, sp.updated_at AS updated_at
  FROM pdf_studio_saved_pdfs sp WHERE sp.deleted_at IS NULL AND sp.user_id = 'u1'
),
joined AS (
  SELECT base.item_kind, base.item_id, COALESCE(o.display_title, base.title_native) AS title,
    base.file_type, base.source, o.deleted_at AS lib_deleted_at
  FROM base LEFT JOIN library_item_overrides o
    ON o.user_id = base.user_id AND o.item_kind = base.item_kind AND o.item_id = base.item_id
)
SELECT item_kind, item_id, title, NULL, NULL, file_type, source, NULL, 'pdf-studio-saved-pdfs', now(), now(), '{}', false, NULL
FROM joined
WHERE ((true::boolean AND lib_deleted_at IS NOT NULL) OR (NOT true::boolean AND lib_deleted_at IS NULL));

DO $$
BEGIN
  IF (SELECT count(*) FROM library_probe WHERE item_kind = 'pdf-saved') <> 1 THEN
    RAISE EXCEPTION 'biblioteca: la papelera (incluyeEliminados=true) no devolvió el item oculto';
  END IF;
  RAISE NOTICE 'OK biblioteca papelera (centinela incluyeEliminados invierte el filtro de lib_deleted_at)';
END $$;

SELECT 'TODOS LOS CTE OK' AS resultado;
