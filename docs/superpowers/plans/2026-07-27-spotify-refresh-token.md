# El refresh token de Spotify que se borraba solo

## Problema

Los dos `auth.ts` de OAuth eran los archivos peor cubiertos del backend:
`spotify/auth.ts` al 30.43% y `x/auth.ts` al **2.17%** — el flujo entero de
identidad de X corría sin una sola aserción. Al leerlos para cubrirlos apareció
un bug real.

`spotify_tokens.refresh_token` es `TEXT NOT NULL`, y Spotify declara
`refresh_token` **opcional** en su respuesta de token. Para no violar el NOT
NULL, el callback persiste un vacío:

```ts
// spotify-callback.mts
refreshToken: tokens.refresh_token ?? '',
```

Y el upsert lo escribía tal cual:

```sql
-- spotify/auth.ts, antes
refresh_token = EXCLUDED.refresh_token,
```

Consecuencia: **una re-autorización sin `refresh_token` borra el token bueno y
lo sustituye por cadena vacía.** Y re-autorizar no es un caso raro — el propio
código lo pide cuando cambian los scopes:

> _"Si actualizas los scopes después de que el usuario ya conectó Spotify, hay
> que pedirle re-autorizar (Spotify NO agrega scopes retroactivamente)."_

A partir de ahí, cada refresh manda `refresh_token=''`, Spotify responde 400, y
el sync de cada tres horas falla para siempre. Sin error visible: la app sigue
mostrando "conectado" y simplemente deja de traer nada.

El hermano de X ya lo hacía bien —`COALESCE(EXCLUDED.refresh_token,
x_tokens.refresh_token)` y el callback pasando `?? null`—. Spotify era el caso
desviado.

## Piezas / Cambios

- **El arreglo**, una línea:

  ```sql
  refresh_token = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), spotify_tokens.refresh_token),
  ```

  `NULLIF` convierte el `''` que manda el callback en NULL para que `COALESCE`
  pueda conservar el guardado. Sin `NULLIF` no basta: `COALESCE` sólo atrapa
  NULL, y aquí lo que llega es cadena vacía.

- **`spotify/auth.test.ts` (nuevo)** — 8 casos: la regresión del refresh token,
  el scoping por `user_id`, el margen de 60s antes de vencer, y que el mensaje
  de error del intercambio no arrastre el client secret.

- **`x/auth.test.ts` (nuevo)** — 13 casos: PKCE (que el challenge sea de verdad
  el SHA-256 del verifier, recalculado de forma independiente; largo y alfabeto
  de RFC 7636; que no se repita), que el secret no viaje en la URL de
  autorización, el scoping por usuario de cada consulta, y los cuatro caminos de
  `getValidAccessToken`.

- **Pisos de cobertura propios** para ambos archivos en `vitest.config.ts`.

## Decisiones

- **Cubrir por invariante, no por línea.** El objetivo no era el porcentaje: era
  dejar amarrado lo que falla en silencio. De ahí que los tests miren el hash de
  PKCE, el `WHERE user_id`, y qué token queda guardado tras un refresh — y no,
  por ejemplo, los getters triviales.
- **La aserción del upsert mira el SQL emitido, no una fila.** La semántica real
  de `ON CONFLICT` sólo se comprueba contra Postgres y aquí no hay base. Lo que
  sí se puede comprobar —y es exactamente donde estaba el bug— es que la
  sentencia preserve en vez de pisar. El test lo dice en su docstring para que
  nadie lo confunda con una prueba de integración.
- **`resetEnvCache()` entre tests.** `getEnv()` cachea la primera lectura, así
  que un `vi.stubEnv` posterior no la alcanza. Costó dos fallos entenderlo.
- **Se verificó el rojo antes del verde.** El test de la regresión falla contra
  el código actual mostrando el SQL culpable (`refresh_token =
EXCLUDED.refresh_token`) y pasa con el arreglo.

### Lo que a propósito NO se tocó

- **El 500 genérico cuando el refresh token está revocado.** `x-sync.mts` y su
  equivalente de Spotify tratan un throw del refresh como un fallo cualquiera,
  así que el usuario ve "algo salió mal" en vez de "reconecta tu cuenta".
  Arreglarlo bien pide mirar el status que devuelve el proveedor —un 400
  `invalid_grant` es reconectar, un 503 es reintentar— y tocar varios endpoints.
  Es un pack aparte. En el camino programado no hay problema: `x-scheduled-sync`
  y `spotify-scheduled-sync` envuelven cada usuario en try/catch, registran el
  mensaje concreto y siguen con los demás.
- **El caso de primera conexión sin `refresh_token`.** Si Spotify no devuelve
  uno en la primera autorización, se guarda `''` y la conexión nace inservible.
  Es un fallo del lado de Spotify y merece un error explícito en el callback, no
  un `COALESCE`; queda anotado.
- **La columna sigue siendo `NOT NULL`.** Cambiarla a nullable sería más limpio
  conceptualmente, pero exige migración y no arregla nada que el `NULLIF` no
  arregle ya.

## Validación

- `node scripts/run-vitest.mjs run` — **760 archivos, 0 fallos** (21 tests
  nuevos).
- Cobertura: `spotify/auth.ts` **30.43% → 76.08%**, `x/auth.ts` **2.17% →
  71.73%**. Global de líneas 79.83% → 80.06%.
- Los pisos nuevos pasan con el margen previsto.
- `typecheck`, `lint`, `format:check`.
- Gates: `knip`, `docs-drift`, `script-registry`, `architecture`,
  `user-id-writes`, `auth-rls-contracts`, `api-error-shape`,
  `backend-domain-services`.
- `build` + budget de bundle.
