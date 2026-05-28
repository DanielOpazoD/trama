# ADR-0007: Lazy loading per-view en ViewRouter

- **Status**: Accepted
- **Date**: 2026-05-27
- **Deciders**: @DanielOpazoD

## Context

Trama tiene 8 vistas top-level (Inicio, Grafo, Entidades, Citas, Escuchas, Momentos, Chat, Sugerencias). Cada una trae sus propias dependencias pesadas:

- **Grafo**: sigma + graphology (~158 KB gzip) — para el render WebGL en tramas grandes.
- **Chat**: hooks de streaming + componentes de mensajes.
- **Momentos**: composer + edit modals (Foto/Recorte/Nota) + helpers de compresión de imagen.
- **Listening**: timing-helpers + Spotify integrations.

Sin code splitting, todo eso entra en el bundle inicial. El usuario que solo viene a leer una cita paga el costo de cargar Sigma, Spotify y la lógica de Momentos antes de ver nada.

## Decision

`React.lazy` por cada vista en `src/components/ViewRouter.tsx`. Cada vista es un chunk separado que el bundler emite con `import('./X')`. El usuario solo descarga el código de la vista que abrió.

```tsx
const GraphView = lazy(() => import('./GraphView'))
const ChatView = lazy(() => import('./ChatView').then((m) => ({ default: m.ChatView })))
// ... etc
```

`HomeView` queda eager (no lazy) — es la primera vista que ve el usuario; lazearla sumaría un flash de loader innecesario al boot.

Cada vista lazy se envuelve en:

1. `<Suspense fallback={<ViewFallback />}>` con un `LoadingHint` centrado durante el download del chunk.
2. `<ErrorBoundary scope="view:<slug>" fallback={ViewErrorFallback}>` granular (ver [ADR-0006](./0006-error-boundary-granular.md)).

## Consequences

### Positive

- **Bundle inicial chico**: ~225 KB vendor-react + ~225 KB index = ~450 KB gzip al boot. Sin lazy serían ~700+ KB.
- **Vistas pesadas pagadas on-demand**: el chunk de Grafo (~32 KB) y MomentosView (~58 KB) solo se descargan cuando el usuario navega ahí por primera vez.
- **Caché por vista**: las cosas que cambian en un sprint específico (ej. solo se tocó Chat) invalidan solo el chunk de ChatView; vendor + otras vistas siguen cacheadas.
- **Refactor friendly**: si en el futuro split-eamos una vista en sub-vistas (ej. MomentosView en Timeline + Composer), el split es transparente — sigue siendo un chunk por entry top-level.

### Negative

- **Primer ingreso a una vista nueva tiene un flash**: hasta que el chunk se descarga, el Suspense muestra el `LoadingHint`. En 4G es ~150ms; en 3G puede ser 600ms+ y se nota. Mitigamos con un fallback minimal (no skeleton) para no parecer roto.
- **Sigma vendor chunk separado**: lo separamos en `vendor-graph` por `manualChunks` en `vite.config.ts` así NO se duplica si dos vistas lo usaran. Hoy solo GraphView lo usa, pero la decisión es robusta.
- **No es preloadable trivialmente**: para precarga (hover sobre el item del sidebar → trigger del import) habría que cablear manualmente con `import()` en un handler. Hoy no lo hacemos.

### Neutral

- Cada lazy import suma 1-2 líneas vs un import directo. Aceptable.

## Alternatives considered

1. **Bundle único monolítico**: lo que teníamos antes. Sencillo pero el boot pesa más cada vez que se agrega una vista.
2. **Route-based code splitting con react-router**: la app NO usa router (las vistas son state local). Si en el futuro adoptamos URLs por vista, este lazy se traduce directo a `<Route lazy>` de react-router 6.4+.
3. **Web Workers para Sigma**: aliviar el main thread cuando se renderiza el grafo. Complejidad alta y la latencia perceptual no es el bottleneck (Sigma corre en GPU). Descartado por ROI bajo.

## References

- `src/components/ViewRouter.tsx` — implementación.
- `vite.config.ts` — `manualChunks` que separa vendors (`vendor-react`, `vendor-query`, `vendor-graph`).
- [ADR-0006: ErrorBoundary granular per-view](./0006-error-boundary-granular.md) — combo del lazy + boundary.
- [scripts/check-bundle-size.mjs](../../scripts/check-bundle-size.mjs) — budget de tamaño en CI.
