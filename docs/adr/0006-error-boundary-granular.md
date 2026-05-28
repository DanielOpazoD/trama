# ADR-0006: ErrorBoundary granular per-view en ViewRouter

- **Status**: Accepted
- **Date**: 2026-05-27
- **Deciders**: @DanielOpazoD

## Context

Antes había un solo `<ErrorBoundary>` envolviendo todo el `<Shell>` en `App.tsx`. Cualquier crash en cualquier vista (Grafo, Chat, Momentos, etc.) tira la app entera y muestra el fallback fullscreen "la trama se rompió".

Eso es excesivo cuando el problema es de una vista específica. Si Chat tiene un bug que crashea, no tiene sentido perder el acceso a Sidebar y TopBar — el user debería poder cambiar a otra vista y seguir trabajando.

## Decision

Dos capas de ErrorBoundary:

1. **Root** (en `App.tsx`, alrededor de `<Shell>`): fullscreen fallback. Captura crashes catastróficos (Sidebar, TopBar, Providers, AuthGate). Si llega acá, no hay mucho que el user pueda hacer salvo recargar.

2. **Per-view** (en `ViewRouter`, alrededor de cada vista): inline fallback. Sidebar y TopBar siguen vivos; el user puede cambiar de vista o reintentar sin recargar.

El componente `<ErrorBoundary>` acepta un `fallback` prop opcional. Sin fallback → fullscreen default. Con fallback → render prop usado.

El `scope` prop (`'root'` vs `'view:chat'`) viaja al `/api/error-log` POST para distinguir crashes en analytics.

## Consequences

### Positive

- **Granularidad útil**: un crash en ChatView no rompe nada más. La UX degrada localmente.
- **Mejor signal en logs**: el field `context.scope` en `error_log` distingue "crash en chat" vs "crash en sidebar". Las primeras son bugs de feature; las segundas son bugs estructurales.
- **Test plan más simple**: el fallback inline tiene menos surface que el fullscreen — los tests RTL son más simples.
- **Aria-pattern**: `<div role="alert">` en cada fallback. Los screen readers anuncian el crash.

### Negative

- **Más components mounted en cada vista**: cada vista paga el costo de un boundary adicional. Insignificante en perf — boundaries no agregan re-renders cuando no hay error.
- **Doble fetch al endpoint**: si un crash escala (el fallback inline también crashea), el outer boundary lo captura y reporta otra vez. En la práctica, el fallback inline es tan simple que no crashea — pero teóricamente posible.

### Neutral

- El `fallback` render prop expone `error`, `componentStack`, `onReset`, `onReload` — mismo shape que el fallback default. La interfaz es consistente.

## Alternatives considered

1. **Solo boundary root**: lo que teníamos antes. Simple pero rompe demasiado.
2. **Boundary por sección del DOM**: en lugar de per-view, envolver cada panel (sidebar, topbar, main, right-panel) en su propio boundary. Más granular pero más boilerplate. Aceptable si el patrón de uso lo justifica; hoy las vistas son la unidad natural.
3. **react-error-boundary lib**: trae el patrón con menos código. Decidimos mantener nuestro propio `ErrorBoundary` porque (a) ya existía y es simple, (b) tiene el reporte custom a `/api/error-log` que la lib externa no tiene.

## References

- PR #26 `chore: Tier C+D+E — multi-user infra + ErrorBoundary granular + GraphView split` — Tier D implementa el patrón.
- `src/components/ErrorBoundary.tsx` — implementación.
- `src/components/ViewRouter.tsx` — uso per-vista.
