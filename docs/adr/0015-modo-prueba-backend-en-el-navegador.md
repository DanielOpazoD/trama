# ADR-0015: El modo prueba es un backend completo dentro del navegador

- **Status**: Accepted
- **Date**: 2026-07-31
- **Deciders**: @DanielOpazoD

## Context

Trama necesita Postgres (Neon), Clerk y al menos una clave de LLM para
funcionar. Eso vale para quien la usa a diario, pero convierte en imposible
tres cosas que sí importan:

1. **Que alguien vea la aplicación** sin provisionar media infraestructura.
   Un programador que abre el repositorio no va a montar Netlify + Neon + Clerk
   para decidir si el proyecto le interesa.
2. **Verificar cambios de interfaz de forma determinista.** Con datos reales,
   una captura o una medición dependen de qué haya hoy en la base.
3. **Correr e2e sin red.** Los tests de Playwright necesitan un backend
   predecible; montarlo de verdad en CI es lento y frágil.

Lo que **no** sabíamos al decidir: cuánto iba a costar mantener sincronizadas
dos implementaciones del mismo contrato de API.

## Decision

El modo prueba (`localStorage['trama-demo'] === '1'`) intercepta en
`src/api/request.ts` y **no llega a `/api/*`**: delega en `src/lib/demoRouter.ts`,
que sirve desde un store en `localStorage` sembrado con datos de ejemplo.

Es un backend completo, no una maqueta: se puede **crear, editar y borrar**
entidades, relaciones, citas, notas, tareas, momentos, prompts y claves. Las
respuestas tienen la forma del **servidor** (`snake_case`), de modo que los
transforms de `src/api/` corren igual que contra Postgres — el resto de la
aplicación no sabe en qué modo está.

Las funciones de IA quedan desactivadas: no gastan API de nadie.

## Consequences

### Positive

- La aplicación se puede probar **en un clic** desde el README (`?demo=1`), sin
  cuenta ni base de datos. Antes había que descubrir un botón dentro de la
  pantalla de acceso.
- Los e2e corren contra un backend **determinista y sin red**.
- La verificación visual de un cambio es reproducible: las capturas del README
  se regeneran con `npm run capturas` contra este mismo modo.
- Es una demo honesta: los datos viven en el navegador de quien prueba y en
  ningún otro sitio.

### Negative

- **Dos implementaciones del mismo contrato.** Cada ruta nueva de `/api/*`
  necesita su rama en `demoRouter`, o la sección aparece vacía en demo sin que
  nada falle. Ha pasado: los bookmarks de X devolvían `connected: false` y la
  sección entera era invisible en modo prueba hasta que alguien lo miró.
- **La deriva no rompe la compilación.** `demoRouter` devuelve `unknown` en
  cada caso, así que una respuesta con forma equivocada no da error de tipos.
  (Pendiente: tiparlas.)
- Un bug que sólo exista en el backend real **no aparece** en demo, y al revés.

### Neutral

- El store vive en `localStorage`, así que su tamaño está acotado por el
  navegador. Suficiente para datos de ejemplo; no para uso real.

## Alternatives considered

- **MSW (Mock Service Worker) sólo para tests.** Resuelve los e2e, pero no da
  una demo pública ni permite editar: no sirve para que alguien pruebe la app.
- **Una instancia pública de demostración con backend real.** Cuesta dinero,
  hay que moderarla y los datos de un visitante quedarían en un servidor ajeno.
- **Capturas y un vídeo en el README.** Es lo barato, y es lo que hace todo el
  mundo — pero no se puede tocar, y envejece en silencio.
- **Sembrar la base local con un `docker-compose`.** Sigue exigiendo Docker y no
  resuelve la demo pública.

## References

- `src/lib/demo.ts`, `src/lib/demoRouter.ts`, `src/lib/demoStore.ts`
- ADR [0004](./0004-multi-user-progressive-rollout.md) — el rollout gradual que
  hizo conveniente tener un modo sin Clerk.
- PR #377 — `?demo=1` y las capturas del README generadas desde este modo.
