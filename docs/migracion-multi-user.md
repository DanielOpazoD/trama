# Migración a multi-user

> **El procedimiento de cutover (switch + smoke + rollback) vive en
> [runbook-multiusuario.md](runbook-multiusuario.md).** Este documento es el
> contexto de fondo y la referencia histórica del plan.

> **Estado (2026-06-21): cutover multi-usuario RESUELTO y validado en producción.**
> Producción corre en modo Clerk estricto: `ALLOW_LEGACY_FALLBACK` apagado
> (requests sin token → 401, verificado), las llaves de producción
> (`CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`) están puestas, y el alias
> `LEGACY_OWNER_CLERK_ID` mapea al dueño sobre `legacy-single-user` para ver su
> historia pre-Clerk sin migrar nada. El **aislamiento A/B (lectura, mutación y
> blobs) está verificado con dos usuarios reales** — la evidencia productiva vive
> en **"Estado productivo verificado"** de
> [runbook-multiusuario.md](runbook-multiusuario.md). La auth con Clerk
> (`netlify/functions/_lib/auth.ts` + `@clerk/backend`), `AuthGate`/`UserButton`,
> el `user_id` en tablas privadas, RLS (`app.current_user_id`), el provisioning
> lazy (`ensureUserRow`) y el cost-cap por usuario ya estaban en el código.
> **Deuda OPCIONAL, no bloqueante:** reasignar la data histórica de
> `legacy-single-user` al `sub` real del dueño (inventariada por
> `legacy-data-reassignment:dry-run`). Los "Commit 1–N" de abajo son referencia
> histórica. El resumen vivo está en
> [`docs/conventions/roadmap.md`](conventions/roadmap.md).

> **Estado RLS (junio 2026): implementado como segunda barrera.**
> El código agrega Row Level Security con `FORCE ROW LEVEL SECURITY` en tablas
> privadas. `getSql()` envuelve el cliente Neon HTTP para setear
> `app.current_user_id` dentro de la misma transacción de cada query después de
> `getAuthedUser()`. Los jobs internos que cruzan usuarios usan
> `runWithSystemRls(...)`; los callbacks OAuth declaran `setCurrentRlsUser(...)`
> desde la cookie HttpOnly del flow. Esto es aislamiento fuerte app+DB, **no**
> cero-conocimiento: quien tenga acceso directo a Neon/Netlify/Blobs/vars/logs
> sigue siendo una excepción técnica.

## Cuándo abrir esto

Este runbook aplica cuando decidas compartir Trama con otra(s) persona(s).
Mientras siga siendo de uso personal, el modo `legacy-single-user` conserva la
historia existente; en producción multiusuario el fallback debe estar apagado.

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

Estado 2026: `AuthGate` ya rodea la app y muestra `SignIn` cuando Clerk está
configurado; `UserMenu` monta `UserButton` en el TopBar para cuenta/logout.

1. `<AuthGate>` en App.tsx: redirect a login si no hay sesión. ✅
2. Endpoint `/api/me` → devuelve `{ user, displayName, ... }`.
3. Settings: mostrar "logueado como X" si hace falta una vista de cuenta
   adicional; logout ya está cubierto por `UserButton`.
4. AskBar / GraphView / etc: si una request devuelve 401, redirect a
   login (limpieza de cache de TanStack).

### Commit 6 — Quitar legacy fallbacks (referencia histórica)

El camino recomendado 2026 ya no reasigna toda la data histórica: usa
`LEGACY_OWNER_CLERK_ID` para mapear el sub de Daniel a `legacy-single-user`.
La alternativa de abajo queda como referencia si algún día se decide eliminar
por completo ese alias y migrar rows/blob keys al sub real:

```sql
-- Migrar datos del usuario legacy al real
UPDATE entities SET user_id = '<sub-de-daniel>' WHERE user_id = 'legacy-single-user';
-- (repetir para todas las tablas)

-- Quitar el usuario legacy
DELETE FROM users WHERE id = 'legacy-single-user';

-- Quitar los DEFAULT de las columnas user_id.
-- Desde 20260621010000_legacy_user_id_drop_defaults esto ya está aplicado
-- para las tablas privadas históricas: un INSERT sin user_id debe fallar.
ALTER TABLE entities ALTER COLUMN user_id DROP DEFAULT;
-- (etc)
```

Y en código: quitar el `ALLOW_LEGACY_FALLBACK` y borrar la env var.

## Cosas que parecerán fáciles pero NO

- **Embeddings**: el HNSW index ya existe y NO se ve afectado. Pero las
  queries de cosine SI deben filtrar por user_id. Si no, un usuario
  podría "ver" entidades de otro vía búsqueda semántica. Asegurate de
  añadir `AND user_id = ${user.id}` a TODA query de embedding.
- **Cost cap mensual**: el cap ya opera por usuario. Primero lee
  `users.monthly_budget_cents`; si está `NULL`, cae al default global
  `AI_MONTHLY_BUDGET_CENTS`.
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

En local/dev se puede mantener `ALLOW_LEGACY_FALLBACK=true` mientras se prueba
el flujo. En producción, el build bloquea `ALLOW_LEGACY_FALLBACK=true` para no
abrir un bypass de auth. La transición segura de producción es:

1. Configurar `CLERK_SECRET_KEY` y `VITE_CLERK_PUBLISHABLE_KEY` juntas.
2. Configurar `LEGACY_OWNER_CLERK_ID` para que Daniel siga viendo la data
   histórica bajo `legacy-single-user`.
3. Verificar login E2E en un deploy preview o entorno controlado.
4. Deployar producción con `ALLOW_LEGACY_FALLBACK` apagado.

## Estado real + checklist de go-live (auditoría 2026-05)

El schema y el aislamiento por `user_id` ya están en casi todo. Auditoría de la
superficie de Netlify Functions:

**🟢 Aislado correctamente:** entities, quotes, relationships, momentos (+merge
/restore/upload/audio-upload/orphaned-blobs/file — los blobs van namespaced
`${userId}/…`), notes, tasks, chat, search, cronologia, atlas, cronicas,
extraction-log, error-log, ai-settings, spotify-sync, spotify-plays/timing/
status, proactive-suggestions, reindex, voz, quote-reflect/echoes. entity-types
y relationship-types son **taxonomía global por diseño** (no per-user) — OK.

**🟢 Arreglado:** `health.mts` — antes agregaba counts/costos/errores GLOBALES;
ahora filtra todo por `user_id` (con su contract test `health-endpoint.test`).

**🟢 Arreglado:** **Spotify OAuth per-user**. El `/login` ahora autentica al
usuario y setea una cookie HttpOnly `spotify_uid` (el userId NUNCA pasa por
Spotify → no se puede forjar); el callback rechaza callbacks sin `spotify_uid`,
provisiona `users(id)` y asocia el token al usuario. El cron
`spotify-scheduled-sync` itera por cada usuario con token. El front pide la
authorize URL por fetch autenticado y navega. (De paso: `handler-wrap` ahora
preserva los Set-Cookie al inyectar el `x-request-id`.)

**🟢 Arreglado:** **X OAuth per-user**. Igual que Spotify: `/api/x/login`
autentica, setea `x_uid` HttpOnly junto al state/verifier PKCE, y el callback
rechaza callbacks sin `x_uid` antes de intercambiar tokens.

**🟢 Arreglado:** **cost-alert-check per-user**. El cron agrupa
`extraction_log` por `user_id`, usa `users.monthly_budget_cents` con fallback a
`AI_MONTHLY_BUDGET_CENTS`, y guarda throttling en `alert_state` como
`cost-cap-warning:<userId>`.

**🔴 Bloqueante que falta antes de encender (código):** no queda un gap de código
conocido en esta checklist; los pasos restantes son operativos y deben validarse
en Netlify/Clerk reales.

**Operativo (lo hace Daniel en Netlify, no se puede automatizar):**

3. Setear en Netlify env: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `LEGACY_OWNER_CLERK_ID` (mapea tu cuenta Clerk al `legacy-single-user`
   existente, para no perder tus datos).
4. Provisionar `users.monthly_budget_cents` por usuario (o dejar que caiga al
   `AI_MONTHLY_BUDGET_CENTS` global).
5. Verificar login end-to-end en deploy preview o entorno controlado.
6. Deployar producción con `ALLOW_LEGACY_FALLBACK` apagado → modo estricto
   (401 sin token). `npm run check:legacy-fallback` también falla si Clerk
   queda configurado solo en frontend o solo en backend.

**Guardrail activo:** `netlify/functions/_lib/isolation-guardrail.test.ts`
recorre handlers y helpers de contexto críticos para fallar si una query sobre
tabla per-user no menciona `user_id`, si un endpoint HTTP queda sin auth
explícita, o si un write con `user_id` no llama a `ensureUserRow`.

## RLS: contrato de privacidad runtime

El objetivo de RLS es que un bug de aplicación no baste para cruzar usuarios.
Aunque una query olvide `AND user_id = ${userId}`, Postgres debe negar filas que
no coincidan con el contexto transaccional `app.current_user_id`.

Reglas:

- Toda request autenticada debe llamar `getAuthedUser(req)` antes de tocar tablas
  privadas. Ese helper registra el usuario actual para `getSql()`.
- Toda query privada que sale por `getSql()` queda envuelta en una transacción
  con `set_config('app.current_user_id', userId, true)`.
- Los endpoints exentos de auth deben declarar su intención: `setCurrentRlsUser`
  para callbacks con userId validado por cookie HttpOnly, o `runWithSystemRls`
  para crons internos multiusuario.
- `runWithSystemRls` no es un permiso normal de producto. Es una llave operativa
  para tareas internas como alertas de costo y sync programado.

Validación pendiente fuera de este entorno: aplicar la migración contra Postgres
real. En esta máquina `npm run db:up` depende de Docker; si Docker no está
instalado, CI/Netlify debe ser la prueba de sintaxis/aplicación de migraciones.
