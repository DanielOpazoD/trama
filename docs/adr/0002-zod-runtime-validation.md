# ADR-0002: Zod en bodies de POST/PUT como defense-in-depth

- **Status**: Accepted
- **Date**: 2026-05-17
- **Deciders**: @DanielOpazoD

## Context

Los endpoints reciben JSON del cliente. TypeScript NO valida runtime — un body con `{ name: 123 }` cuando el handler espera `name: string` se compila bien y crashea en runtime con un mensaje confuso.

Opciones:

1. **Trust + try/catch**: confiar en que el cliente manda lo correcto, dejar que crashee y atrapar el error. Mensaje feo, hard to debug.
2. **Manual validation**: `if (typeof body.name !== 'string') return apiError(400)`. Funciona pero es muy verboso para shapes complejos.
3. **Zod / runtime schema validator**: declarar el shape una vez, parsear el body con ese schema, dejar que la lib genere el error 400.

## Decision

Zod en TODOS los endpoints que reciben POST/PUT/PATCH bodies. El schema vive en `_lib/admin-schemas.ts` (admin/internal) o `_lib/chat-body-schemas.ts` (chat-specific) o similar. El helper `parseJsonBody(req, Schema, requestId)` devuelve `{ ok: true, data } | { ok: false, response }` igual que `requireSpotifyConnection`.

GET endpoints leen query params y los validan inline (no necesitan Zod por la simpleza).

## Consequences

### Positive

- **Error message útil**: Zod devuelve `{ issues: [{ path: 'name', message: 'expected string, received number' }] }` en `details` del ApiError. El cliente puede mapear esto a UI ("el campo nombre es inválido").
- **Single source of truth**: el schema sirve también para tests (mockear bodies válidos) y para inferir el tipo TS del body (`z.infer<typeof Schema>`).
- **Defense-in-depth**: aún si el frontend nuestro manda algo bien, un cliente curl malicioso puede mandar lo que quiera. Zod lo bloquea consistentemente.
- **Pattern reconocible**: `if (!parsed.ok) return parsed.response` es idéntico en cada handler. Reviewers pueden buscar el pattern y saber que el body está validado.

### Negative

- **Bundle size**: zod pesa ~13KB gzip. En el backend no importa, pero si en algún momento usamos los schemas en el frontend (validación pre-submit), aumenta el bundle. Hoy NO los compartimos.
- **Aprender la API**: `.optional()`, `.nullable()`, `.default()`, `.transform()`, `.refine()` — la curva es modesta pero hay edge cases (especialmente con `coerce` y `transform`).

### Neutral

- Algunos schemas son obvios (`{ id: z.string() }`) y el helper se siente overkill. Pero la consistencia vale más que el ahorro de líneas.

## Alternatives considered

1. **Yup**: librería similar. Menos popular en TS land (los tipos no son tan precisos).
2. **io-ts / fp-ts**: enfoque más funcional. Curva más alta, comunidad más chica.
3. **Custom validators ad-hoc**: lo que teníamos antes de esta decisión. Inconsistente; algunos endpoints validaban exhaustivo, otros confiaban en el cliente.
4. **JSON Schema + ajv**: el formato estándar. ajv es performante pero la DX en TS es peor (los tipos no se infieren igual).

## References

- [Zod docs](https://zod.dev/)
- PR original que migró todos los endpoints: #22 — `chore: Zod en CRUD core + isolation tests por endpoint`
