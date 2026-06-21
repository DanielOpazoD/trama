# ADR 0011: Legacy Identity Cutover

Fecha: 2026-06-21

Estado: Aceptado

## Estado Operacional

Verificado en producción el 2026-06-21.

`legacy-single-user` ya no es camino operativo normal: producción responde bajo
Clerk estricto, requests anónimos reciben 401, `health.auth.mode` reporta
`clerk` con token válido, y el smoke A/B de aislamiento pasa lectura, mutación y
blobs. Desde este punto, las referencias a legacy deben distinguir:

- **Resuelto**: fallback legacy anónimo y defaults operativos de DB.
- **Pendiente opcional**: reasignación de datos/blobs históricos que siguen bajo
  `legacy-single-user`.

## Contexto

Trama nació como aplicación single-user. Durante el rollout multiusuario se
agregó `user_id` a tablas privadas usando `DEFAULT 'legacy-single-user'` para
que el código existente siguiera funcionando mientras se cableaba Clerk, RLS y
los filtros por dueño.

Ese default fue útil para migrar sin interrumpir el uso personal, pero deja una
ambigüedad peligrosa cuando la aplicación se acerca a uso multiusuario real: si
un endpoint nuevo olvida escribir `user_id`, Postgres no falla; crea la fila
bajo el tenant histórico.

El objetivo de este ADR es separar dos conceptos que antes estaban acoplados:

- `legacy-single-user` como identidad histórica compatible.
- `legacy-single-user` como default operativo implícito.

El primero se conserva. El segundo se elimina.

## Decisión

`legacy-single-user` queda como compatibilidad histórica para datos y blobs
pre-Clerk, pero deja de ser default operativo en las tablas privadas que nacieron
durante el rollout multiusuario.

La migración `20260621010000_legacy_user_id_drop_defaults` ejecuta
`ALTER COLUMN user_id DROP DEFAULT` en las tablas que tenían
`DEFAULT 'legacy-single-user'`.

Desde esta decisión:

- Todo handler que cree filas privadas debe escribir `user_id` explícitamente.
- Un `INSERT` privado sin `user_id` debe fallar con `NOT NULL`.
- El owner histórico puede seguir resolviendo a `legacy-single-user` mediante
  `LEGACY_OWNER_CLERK_ID`.
- Las keys de blob sin prefijo siguen tratándose como legacy solo donde el
  endpoint lo permite explícitamente.

## Invariantes

### 1. Auth fallback no es identidad por defecto de DB

`ALLOW_LEGACY_FALLBACK=true` puede restaurar temporalmente el comportamiento de
auth para requests sin token, pero no reintroduce defaults de base de datos.

Eso es deliberado. Si el código no escribe `user_id`, debe fallar incluso en un
rollback de auth. Volver a default silencioso sería reabrir el problema.

### 2. Owner alias es explícito

El mapping del dueño histórico vive detrás de
`resolveLegacyOwnerAlias({ clerkUserId, legacyOwnerClerkId })`.

No debe aparecer lógica nueva tipo:

```ts
if (payload.sub === process.env.LEGACY_OWNER_CLERK_ID) {
  userId = 'legacy-single-user'
}
```

El helper centraliza el motivo operacional `legacy_owner_mapped`, usado también
para logs de auth.

### 3. Blob legacy sin prefijo requiere opt-in

Las storage keys nuevas tienen formato:

```text
<userId>/<random>.<ext>
```

Las keys antiguas sin slash pertenecen al espacio histórico. Un endpoint solo
puede aceptarlas cuando llama explícitamente:

```ts
storageKeyBelongsToUser(key, userId, {
  allowLegacyUnscopedForLegacyUser: true,
})
```

Sin ese flag, una key sin prefijo no pertenece a nadie para efectos de descarga.

### 4. RLS sigue siendo la barrera de lectura

Este ADR no reemplaza RLS. RLS sigue siendo la defensa de base de datos para
lecturas y mutaciones. El cambio de defaults solo endurece la creación de filas:
evita que datos nuevos caigan accidentalmente en el tenant histórico.

## Gates

### `check:legacy-identity-contracts`

Contrato estático. Revisa todas las migraciones versionadas y calcula el estado
efectivo por orden:

1. Si una tabla define `user_id DEFAULT 'legacy-single-user'`, queda marcada.
2. Si una migración posterior ejecuta `ALTER COLUMN user_id DROP DEFAULT`, queda
   resuelta.
3. Si alguna tabla marcada queda sin resolver, CI falla.

Este check no necesita DB.

### `check:user-id-writes`

Contrato estático sobre código productivo en `netlify/functions`.

Revisa `INSERT INTO <tabla_privada> (...)` y falla si la lista de columnas no
incluye `user_id`. Su propósito no es parsear SQL completo: es proteger la clase
de bug más probable después de quitar defaults.

### `check:legacy-identity-schema`

Contrato contra Postgres real. Corre en el job `migrations`, después de aplicar
todas las migraciones.

Consulta `information_schema.columns` y exige:

- `user_id` existe en las tablas históricas del cutover.
- `user_id` es `NOT NULL`.
- `user_id` no conserva default con `legacy-single-user`.

## No objetivos

Este PR no migra todos los datos históricos del dueño a su `sub` real de Clerk.

Ese paso requeriría:

- Reasignar filas existentes de `legacy-single-user` a `user_<...>`.
- Mover o reescribir storage keys de blobs ya persistidos.
- Coordinar rollback de datos y blobs.
- Revalidar smokes productivos sobre assets históricos.

La decisión actual es más pequeña y segura: conservar compatibilidad histórica,
pero impedir que datos nuevos caigan al tenant histórico por omisión.

## Rollback

Rollback normal:

1. Revertir variables de auth con `ALLOW_LEGACY_FALLBACK=true`.
2. Redeploy.
3. Confirmar que el dueño histórico puede operar.

Ese rollback no restaura defaults de DB.

Rollback excepcional:

Si producción demuestra que una ruta legítima dependía del default removido, la
acción correcta es crear una migración nueva y temporal para una tabla concreta:

```sql
ALTER TABLE <tabla_afectada>
  ALTER COLUMN user_id SET DEFAULT 'legacy-single-user';
```

Esa migración debe ir acompañada de:

- Incidente documentado.
- Test que reproduzca el handler afectado.
- Plan para volver a `DROP DEFAULT`.

No se debe editar una migración aplicada.

## Consecuencias

Positivas:

- Un olvido de `user_id` falla fuerte.
- El contrato de identidad legacy queda verificable por CI.
- Los nuevos usuarios reales no heredan accidentalmente el tenant histórico.
- La compatibilidad de datos/blobs legacy se mantiene.

Costos:

- Los handlers nuevos deben ser más explícitos al crear filas privadas.
- Los tests con SQL mockeado que dependan de defaults deberán actualizarse.
- Rollback de auth y rollback de schema ya no son el mismo interruptor.

La compensación es intencional: reducir ambigüedad de identidad antes de abrir
la aplicación a más usuarios reales.
