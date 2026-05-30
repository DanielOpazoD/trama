# Migración a multi-user

> **Estado (mayo 2026): parcialmente implementado.** La autenticación con
> Clerk ya está en producción (`netlify/functions/_lib/auth.ts` verifica el
> Bearer token con `@clerk/backend`) y todas las tablas tienen `user_id`. El
> dueño entra con Clerk y un alias (`LEGACY_OWNER_CLERK_ID`) mapea su sub a
> `legacy-single-user` para ver toda la data pre-Clerk sin migrar nada.
> **Pendiente antes de abrir a la familia:** provisioning de usuarios al
> primer login, cerrar `ALLOW_LEGACY_FALLBACK`, tests de aislamiento por
> `user_id`, y namespacear Spotify + cost-cap por persona. Los "Commit 1–N"
> de abajo se conservan como referencia: varios ya están hechos. El resumen
> vivo está en [`docs/conventions/roadmap.md`](conventions/roadmap.md).

## Cuándo abrir esto

Solo si decides compartir Trama con otra(s) persona(s). Mientras sea
de uso personal, esta migración NO hace falta — está deferida a
propósito para no añadir friction de login a un usuario único.

## Lo que cambia conceptualmente

Hoy: una sola trama global. Cada persona que entra a la URL ve los
mismos datos, comparte el mismo cap de gasto IA, el mismo Spotify
conectado.

Después: cada usuario tiene su propia trama (entidades, citas,
relaciones, chats). Login obligatorio para entrar. La trama de Daniel
no se mezcla con la trama de otro usuario.

## Trabajo en orden

Esta migración es **4-6 commits separados**, no uno solo. Hacerlo en
una sola tanda lo vuelve frágil y casi imposible de rollback.

### Commit 1 — Schema: añadir `user_id` a todas las tablas

Crear migración `<timestamp>_multi_user_schema/migration.sql`:

```sql
-- Una tabla usuarios mínima. El id viene del proveedor de auth (sub
-- del JWT). title/email son opcionales por si queremos dashboard.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,           -- "sub" del JWT, no UUID
  email       TEXT UNIQUE,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usuario "legacy" para los datos que ya existen (Daniel). Cualquier
-- otro UUID estable funciona; este es solo el placeholder hasta que
-- el login se active.
INSERT INTO users (id, display_name)
VALUES ('legacy-single-user', 'Trama (legacy)');

-- Añadir user_id a las tablas de dominio. DEFAULT al usuario legacy
-- para no romper rows existentes.
ALTER TABLE entities ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE relationships ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE quotes ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE chat_threads ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE chat_messages ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE proactive_suggestions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE spotify_tokens ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE spotify_plays ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE ai_task_providers ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-single-user'
  REFERENCES users(id);
ALTER TABLE extraction_log ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE error_log ADD COLUMN user_id TEXT REFERENCES users(id);

-- Índices: cada query típica filtra por user_id. Casi todos los partial
-- indexes existentes deben tener user_id al frente.
CREATE INDEX idx_entities_user_active
  ON entities (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_relationships_user_active
  ON relationships (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_user_active
  ON quotes (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_chat_threads_user
  ON chat_threads (user_id, updated_at DESC) WHERE deleted_at IS NULL;
-- (etc — añadir composites por user_id a cualquier consulta caliente)

-- spotify_tokens y ai_task_providers tenían UNIQUE/PK global; ahora
-- deben ser per-user. Drop el constraint anterior, añadir uno nuevo
-- compuesto con user_id.
ALTER TABLE spotify_tokens DROP CONSTRAINT spotify_tokens_pkey;
ALTER TABLE spotify_tokens ADD PRIMARY KEY (user_id);

ALTER TABLE ai_task_providers DROP CONSTRAINT ai_task_providers_pkey;
ALTER TABLE ai_task_providers ADD PRIMARY KEY (user_id, task);
```

**Importante**: NO eliminar los DEFAULT todavía. Los endpoints siguen
operando como single-user contra `legacy-single-user`. Esta migración
es backward-compatible.

### Commit 2 — Elegir e integrar provider de auth

**Opción recomendada**: **Netlify Identity** (también llamado "Netlify
Auth"). Ventajas:

- Ya estás en Netlify, no agrega un vendor nuevo.
- Free tier hasta 1k usuarios MAU.
- Magic links + email/password + Google/GitHub OAuth de fábrica.
- Inyecta el JWT en `context.clientContext.user` de las Netlify
  Functions. Cero parsing manual.

Alternativas si Netlify Identity te molesta:

- **Clerk** (más polish, free tier 10k MAU, pero vendor extra).
- **Magic.link** (passwordless via email, sin UI propia).
- **Auth.js + GitHub OAuth** (full DIY, máximo control, máximo trabajo).

Pasos para Netlify Identity:

1. Netlify dashboard → Site → Identity → Enable.
2. Configurar (registration: invite-only, providers: Google + email/pwd).
3. Invitar a Daniel + los usuarios que quieras.
4. Frontend: añadir `<script src="https://identity.netlify.com/v1/netlify-identity-widget.js">` o usar `netlify-identity-widget` como dep.
5. Crear un `AuthGate` component que rodea `<Shell />` en App.tsx: si
   no hay sesión → muestra botón "Iniciar sesión"; si hay → muestra la
   app.

### Commit 3 — Functions: extraer userId del request

Crear `netlify/functions/_lib/auth.ts`:

```ts
import type { Context } from '@netlify/functions'

export type AuthedUser = { id: string; email?: string }

export class UnauthenticatedError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Extrae el usuario autenticado del JWT inyectado por Netlify Identity.
 * Si no hay sesión, lanza UnauthenticatedError (que withObservability
 * captura como 401).
 *
 * Durante la transición, podés permitir un fallback al legacy user via
 * env var ALLOW_LEGACY_FALLBACK=true. Quitar cuando todos los usuarios
 * estén migrados.
 */
export function getAuthedUser(context: Context): AuthedUser {
  const user = context.clientContext?.user
  if (user?.sub) {
    return { id: user.sub, email: user.email }
  }
  if (Netlify.env.get('ALLOW_LEGACY_FALLBACK') === 'true') {
    return { id: 'legacy-single-user' }
  }
  throw new UnauthenticatedError()
}
```

Update `handler-wrap.ts` para convertir `UnauthenticatedError` en 401.

### Commit 4 — Endpoints: filtrar todo por user_id

Cada endpoint en `netlify/functions/*.mts` necesita:

```ts
import { getAuthedUser } from './_lib/auth.js'

export default withObservability('foo', async (req, context) => {
  const user = getAuthedUser(context)
  const sql = getSql()

  // En cada SELECT, INSERT, UPDATE — añadir user_id = ${user.id}.
  const rows = await sql`
    SELECT ... FROM entities
    WHERE deleted_at IS NULL AND user_id = ${user.id}
  `
  // ...
})
```

Es trabajo mecánico pero numeroso (~15 endpoints). Recomiendo hacerlo
endpoint por endpoint en un solo commit, con un script que busque
`FROM entities WHERE deleted_at IS NULL` y advierta donde falta el
filtro.

### Commit 5 — Frontend: gate de auth + estado de sesión

1. `<AuthGate>` en App.tsx: redirect a login si no hay sesión.
2. Endpoint `/api/me` → devuelve `{ user, displayName, ... }`.
3. Settings: mostrar "logueado como X" + botón logout.
4. AskBar / GraphView / etc: si una request devuelve 401, redirect a
   login (limpieza de cache de TanStack).

### Commit 6 — Quitar legacy fallbacks

Cuando todos los datos viejos estén migrados al usuario real (Daniel
inició sesión y sus datos se reasignaron de `legacy-single-user` a su
sub real):

```sql
-- Migrar datos del usuario legacy al real
UPDATE entities SET user_id = '<sub-de-daniel>' WHERE user_id = 'legacy-single-user';
-- (repetir para todas las tablas)

-- Quitar el usuario legacy
DELETE FROM users WHERE id = 'legacy-single-user';

-- Quitar los DEFAULT de las columnas user_id (ya no hace falta)
ALTER TABLE entities ALTER COLUMN user_id DROP DEFAULT;
-- (etc)
```

Y en código: quitar el `ALLOW_LEGACY_FALLBACK` y borrar la env var.

## Cosas que parecerán fáciles pero NO

- **Embeddings**: el HNSW index ya existe y NO se ve afectado. Pero las
  queries de cosine SI deben filtrar por user_id. Si no, un usuario
  podría "ver" entidades de otro vía búsqueda semántica. Asegurate de
  añadir `AND user_id = ${user.id}` a TODA query de embedding.
- **Cost cap mensual**: `AI_MONTHLY_BUDGET_CENTS` es global. Si compartís,
  considera hacerlo per-user (columna `monthly_budget_cents` en `users`).
- **Spotify**: cada usuario debe conectar su propia cuenta. El OAuth
  callback debe asociar el token al user_id del que inició el flow.
- **Backup/export JSON**: el endpoint `/api/export` debe respetar el
  user_id, no exportar la trama entera de la DB.

## Coste estimado de la migración

Aproximadamente:

- Schema (commit 1): 2 horas.
- Auth setup (commit 2): 2 horas.
- Functions filtering (commit 4): 4-6 horas, el más largo.
- Frontend (commit 5): 3 horas.
- Cleanup (commit 6): 1 hora.

**Total: ~12-15 horas** de trabajo concentrado.

## Cómo NO romper la app durante la transición

Mantener `ALLOW_LEGACY_FALLBACK=true` durante todos los pasos. Hace
que los endpoints sigan respondiendo a usuarios no autenticados como
el `legacy-single-user`, así Daniel puede seguir usando la app
mientras se va construyendo el otro lado. Quitarlo solo cuando todo
esté completo y verificado.

## Estado real + checklist de go-live (auditoría 2026-05)

El schema y el aislamiento por `user_id` ya están en casi todo. Auditoría de
los 53 handlers:

**🟢 Aislado correctamente:** entities, quotes, relationships, momentos (+merge
/restore/upload/audio-upload/orphaned-blobs/file — los blobs van namespaced
`${userId}/…`), notes, tasks, chat, search, cronologia, atlas, cronicas,
extraction-log, error-log, ai-settings, spotify-sync, spotify-plays/timing/
status, proactive-suggestions, reindex, voz, quote-reflect/echoes. entity-types
y relationship-types son **taxonomía global por diseño** (no per-user) — OK.

**🟢 Arreglado:** `health.mts` — antes agregaba counts/costos/errores GLOBALES;
ahora filtra todo por `user_id` (con su contract test `health-endpoint.test`).

**🔴 Bloqueantes que faltan antes de encender (código):**

1. **Spotify OAuth per-user** (callback/login/scheduled-sync). Hoy el callback
   guarda el token en la fila `'default'` sin saber qué usuario autorizó.
   Arreglo: codificar `userId` en el `state` del OAuth (login) y leerlo en el
   callback; el cron `spotify-scheduled-sync` debe iterar por usuario. Es el
   ítem "Spotify per-user" del roadmap — una feature aparte.
2. **`cost-alert-check.mts`** (cron): suma el costo GLOBAL. Debe iterar por
   usuario y alertar por usuario.

**Operativo (lo hace Daniel en Netlify, no se puede automatizar):**

3. Setear en Netlify env: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `LEGACY_OWNER_CLERK_ID` (mapea tu cuenta Clerk al `legacy-single-user`
   existente, para no perder tus datos).
4. Provisionar `users.monthly_budget_cents` por usuario (o dejar que caiga al
   `AI_MONTHLY_BUDGET_CENTS` global).
5. **Recién entonces** quitar `ALLOW_LEGACY_FALLBACK` → modo estricto (401 sin
   token). Verificar login end-to-end ANTES de quitarlo (si no, te bloqueás).

**Guardrail recomendado (siguiente iteración):** un test que recorra los
handlers y falle si una query sobre tabla per-user no menciona `user_id` — para
que un `WHERE user_id` olvidado lo cace el CI, no un usuario en producción.
