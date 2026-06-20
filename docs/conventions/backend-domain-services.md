# Backend Domain Services

Este contrato ordena los handlers Netlify de alto riesgo sin cambiar rutas ni
agregar un framework. La regla es simple: el handler puede coordinar auth, SQL,
RLS y `Response`, pero las decisiones puras de dominio deben vivir en servicios
testeables.

## Objetivo

Evitar que los handlers vuelvan a crecer como archivos monolíticos donde se
mezclan:

- parsing HTTP;
- construcción de valores para mutaciones;
- mappers de respuesta;
- ranking o planes de búsqueda;
- copy de WhatsApp;
- lógica de rollback o fallback;
- SQL transaccional.

No buscamos una capa genérica de repositorios ni una arquitectura hexagonal
completa. El patrón es deliberadamente pequeño: extraer funciones puras cuando
reducen drift y se pueden testear sin DB.

## Regla De Frontera

| Vive en handler                         | Vive en servicio                       |
| --------------------------------------- | -------------------------------------- |
| `getAuthedUser()` y `ensureUserRow()`   | normalizar body parseado               |
| `parseJsonBody()` / `parseSearchParams` | armar drafts de create/patch           |
| `sqlTyped(...)` y CTEs                  | decidir si un cambio requiere re-embed |
| `runWithSystemRls()`                    | mapear filas fusionadas a respuesta    |
| `ApiErrors.*` y `Response.json`         | copy estable de WhatsApp               |
| observabilidad con request/user         | helpers sin efectos colaterales        |

Si una función necesita `Request`, `Context`, `getSql()`, `Netlify.env`,
`runWithSystemRls()` o escribe blobs, probablemente sigue siendo handler o
servicio infra. Si solo transforma datos, debe ir a servicio de dominio.

## Servicios Actuales

| Dominio  | Handler                     | Servicio                           | Cubre                                                    |
| -------- | --------------------------- | ---------------------------------- | -------------------------------------------------------- |
| Recortes | `_lib/recortes-endpoint.ts` | `_lib/recortes-service.ts`         | drafts create/patch, sugerencia, image keys              |
| Momentos | `_lib/momentos-endpoint.ts` | `_lib/momentos-service.ts`         | create/patch drafts, owner fallback de filas compartidas |
| Search   | `_lib/search-endpoint.ts`   | `_lib/search-service.ts`           | plan lexical/semantic, RRF helpers, response mapping     |
| WhatsApp | `whatsapp-webhook.mts`      | `_lib/whatsapp/webhook-replies.ts` | copy, deep-link line, tags inline, fallback de captura   |

## Cuándo Extraer

Extraer al servicio si se cumple al menos una:

- la rama tiene dos o más callers potenciales;
- el test unitario puede probar edge cases sin mockear DB;
- el handler necesita el mismo mapper en más de un branch;
- el código toca copy/shape público y conviene congelarlo con tests;
- el handler queda sobre el ratchet de líneas.

No extraer si:

- solo envuelve una query SQL sin simplificar nada;
- obliga a pasar media docena de dependencias infra;
- es una abstracción de un solo uso que oculta el flujo;
- cambia semántica de auth/RLS para limpiar el handler.

## Guardrail

El contrato ejecutable vive en:

```bash
npm run check:backend-domain-services
```

El script valida:

- que cada handler importe/use los helpers esperados;
- que cada servicio exporte las funciones esperadas;
- que los handlers principales no vuelvan a superar sus límites;
- que los servicios nuevos tampoco se transformen en otro monolito.

La salida JSON sirve para revisión:

```bash
node scripts/backend-domain-services.mjs --json
```

## Cómo Agregar Un Nuevo Servicio

1. Escribir primero un test pequeño del helper deseado.
2. Crear `netlify/functions/_lib/<dominio>-service.ts`.
3. Mover solo lógica pura: mappers, drafts, planes, selección de keys, copy.
4. Reemplazar el código inline en el handler.
5. Correr el test del servicio y el test del handler.
6. Si es superficie estable, agregarlo a `scripts/backend-domain-services.mjs`.

## Anti-Patrones

- `service.ts` que recibe `sql`, `req`, `context`, `requestId` y `userId` para
  hacer lo mismo que el handler.
- Mover CTEs transaccionales a strings opacos sin tests de integración.
- Duplicar schemas Zod en el servicio; la frontera HTTP sigue en el handler.
- Extraer una función sin test rojo-verde.

## Criterio De Éxito

Un reviewer debería poder abrir el handler y ver rápidamente:

1. auth y ownership;
2. validación de request;
3. query/mutación SQL;
4. respuesta.

Y luego abrir el servicio para ver cómo se construyen los valores o shapes
públicos sin leer una Lambda completa.
