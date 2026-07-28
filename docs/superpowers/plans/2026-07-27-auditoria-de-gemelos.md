# Auditoría de gemelos: lo que una implementación sabe y su hermana no

## Problema

El bug del refresh token de Spotify (#360) no salió de un test ni de un gate:
salió de **leer dos archivos hermanos y notar que diferían**. X protegía el
token con `COALESCE` y Spotify no. La divergencia entre implementaciones
gemelas era la señal.

Trama tiene varios pares así —dos flujos OAuth completos, con sus `login`,
`callback`, `status`, `sync` y `scheduled-sync`—, así que la pregunta era si
ese método daba más.

## Qué se auditó

| par                              | resultado                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{spotify,x}-callback.mts`       | simétrico: método, `error`, `code`, state CSRF, cookie de identidad, `setCurrentRlsUser`, `ensureUserRow`. X añade el verifier de PKCE, que Spotify no usa. |
| limpieza de cookies al salir     | simétrica: cada uno borra las suyas, X incluye el verifier                                                                                                  |
| `{spotify,x}-login.mts`          | simétrico: ambos usan el helper compartido `oauthCookieOptions`, así que los atributos de seguridad no pueden divergir                                      |
| `{spotify,x}-status.mts`         | **tres hallazgos** (abajo)                                                                                                                                  |
| `{spotify,x}-scheduled-sync.mts` | **un hallazgo**                                                                                                                                             |

Que la mayoría saliera limpia también es resultado: el `oauthCookieOptions`
compartido es justo el patrón que impide la clase de divergencia que buscábamos.

## Hallazgos y cambios

### 1. `connected: true` no significaba que la conexión sirviera

Los dos endpoints de estado respondían `connected: true` con que existiera la
fila de tokens. **Es exactamente el estado en el que quedaba una cuenta con el
refresh token borrado**: la app decía "conectado" y el sync llevaba semanas sin
traer nada, sin un solo error a la vista.

Ahora ambos exponen `needsReconnect`, calculado **sin salir a la red**: si el
access token venció —con el mismo margen de 60s que usa `getValidAccessToken`— y
no queda refresh token utilizable, no hay forma de recuperarse solo. Los dos
paneles de Ajustes lo muestran con un aviso sobrio.

### 2. Un fallo que subía el contador sin dejar rastro

En `x-scheduled-sync`, cuando no se podía resolver el `x_user_id` el bucle hacía
`failures++; continue` **sin registrar nada**, mientras todos los demás caminos
de fallo del mismo bucle loguean su motivo. Un hueco imposible de diagnosticar
desde los logs. Ahora registra `x_user_id_unresolved`.

### 3. Respuestas distintas para la misma operación

`DELETE /api/x/status` devolvía `{ ok: true }` con 200; su gemelo de Spotify,
`ApiSuccess.noContent()` con 204. Ahora ambos usan el helper. Es seguro: los dos
clientes ya llamaban con `request<void>` e ignoraban el cuerpo.

## Decisiones

- **`needsReconnect` se calcula, no se consulta.** Preguntarle al proveedor en
  cada carga de Ajustes costaría un round-trip por render. Los datos para
  decidirlo ya están en la fila que el endpoint carga igualmente.
- **La regla vive junto a `getValidAccessToken`**, en cada `auth.ts`, y ambas
  comparten la constante `EXPIRY_SKEW_MS`. Antes el margen de 60s era un literal
  suelto en cada función; si alguien cambiase uno, el estado mostrado y el
  comportamiento real se separarían.
- **El aviso en la UI es sobrio a propósito.** No es un fallo de la app: es una
  autorización que caducó. Un banner de alarma sería el registro equivocado para
  este producto.
- **Los `as never` de los tests se quitaron.** Se colaron por comodidad al
  escribir y no hacían falta: las fixtures ya encajaban con el tipo. Este
  repositorio no tiene ni un cast así, y no iba a empezar por aquí.

### Lo que a propósito NO se tocó

- **El 500 genérico con un token revocado**, que ya quedó anotado en #360.
  `needsReconnect` cubre el caso "no hay con qué renovar"; el caso "el proveedor
  rechazó el refresh" sigue llegando como error genérico y pide distinguir por
  status HTTP.
- **`spotify/sync.ts` (80 líneas) vs `x/sync.ts` (145)** no son gemelos reales:
  bookmarks y reproducciones tienen formas distintas. Compararlos habría sido
  forzar una simetría que el dominio no tiene.

## Una nota sobre el método

El tipado atrapó todos los sitios del frontend que construían un status y ahora
necesitaban el campo nuevo — tres fixtures de test, señaladas al instante.

Pero **no atrapó los mocks de los dos endpoints**: `vi.mock` devuelve un objeto
sin tipar, así que añadir una dependencia al endpoint lo dejó llamando a
`undefined` y los tests fallaron con `INTERNAL` en vez de con un error de
compilación. Vale tenerlo presente: en este repo los mocks de barrel son un
punto ciego del compilador.

## Validación

- `node scripts/run-vitest.mjs run --coverage` — **760 archivos, 0 fallos**
  (5.033 tests). Cobertura de OAuth: `spotify/auth.ts` 76.08% → **78.43%**,
  `x/auth.ts` 71.73% → **74.50%**; los cinco pisos por archivo pasan.
- `typecheck`, `lint`, `format:check`.
- Gates de API: `client-api-contracts`, `api-error-shape`, `runtime-api-routes`,
  `api-request-contracts`, `operational-observability`, `user-id-writes`,
  `auth-rls-contracts`.
- Gates de frontend y repo: `focus-ring`, `icon-button`, `form-control-labels`,
  `modal-overlay`, `frontend-boundaries`, `structure-ratchets`, `knip`,
  `docs-drift`, `architecture`, `design-tokens`.
- `build` + budget de bundle.
