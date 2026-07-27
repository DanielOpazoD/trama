# La primera pantalla: que se lea entera y que diga la verdad

> Sale de `main`. Se intentó apilarlo sobre el PR #358 —tocan `GraphView.tsx`—
> pero el workflow sólo dispara en PRs contra `main` o `codex/trama-pr*`, así
> que un PR apilado se queda **sin CI**. El solape real es una línea de import y
> el fallback de Suspense, zona que #358 no toca, así que sale suelto. Si #358
> entra primero, este puede pedir un rebase trivial.

## Problema

El estado vacío del Grafo es lo primero que ve alguien que abre Trama sin
datos. Tenía dos fallos, y ninguno de los dos lo veía ningún test.

**1. La instrucción era falsa.** El copy decía «Empieza pegando un texto en la
barra de abajo». Esa pantalla sólo se usa en el Grafo (`EmptyState` no se
importa en ningún otro sitio) y en el Grafo el AskBar **no se monta nunca**:
`blocksAskBar` en `appShellModel.ts` lo bloquea para `chat` y `grafo`. Es decir:
la primera indicación que lee un usuario nuevo apunta a algo que no está en
pantalla y que no puede llegar a estar.

**2. El contenido no cabía y no había forma de alcanzarlo.** El patrón
`h-full flex items-center justify-center` tiene una trampa: cuando el contenido
supera el alto disponible, `items-center` reparte el exceso a partes iguales
arriba y abajo. Lo de abajo se sale de la pantalla y lo de arriba queda en
coordenadas negativas, donde ningún scroll llega porque `scrollTop` no puede ser
menor que cero.

Medido en `main` a 669×359 (un móvil en horizontal):

```
contenedor   t115–b359   (244px de alto)
contenido    276px       → desborda 32px
cita         t83         → por encima del contenedor, recortada
botón        t358–b391   → fuera del viewport (359)
sc.scrollTop = sc.scrollHeight  →  scrollTop sigue en 0
```

El estado vacío necesita 308px y el chrome (topbar + nav móvil) se lleva 115,
así que se rompe por debajo de ~423px de alto disponible.

## Piezas / Cambios

- **`CenteredPane` (nuevo).** Separa las dos responsabilidades que el patrón
  mezclaba: el contenedor exterior scrollea (`h-full overflow-y-auto`) y el
  interior centra **sólo cuando sobra sitio** (`min-h-full flex items-center`).
  Si el contenido crece, el interior crece con él y el exterior le da scroll de
  verdad.
- **Cuatro sitios migrados**: `EmptyState` (el confirmado), `ViewRouter`
  (fallback de error), `ChatView` (aviso offline) y `GraphView` (fallback de
  Suspense).
- **El copy del estado vacío** deja de mandar a una barra inexistente y nombra
  las dos vías que sí existen desde ahí: cargar el ejemplo, o ir a Inicio.
- **Escala tipográfica** en `EmptyState`: `text-2xl md:text-3xl` → `text-h2
md:text-h1`, `text-sm` → `text-body`, `text-xs` → `text-caption`.
- **Baseline de design-tokens** bajado de 499 a 423.
- **Guard e2e nuevo** que comprueba que la acción del estado vacío se alcanza en
  pantallas bajas.

## Decisiones

- **Un componente, no una utility CSS.** El arreglo necesita dos elementos
  anidados con responsabilidades distintas; una clase suelta no lo expresa y se
  volvería a copiar mal. Con cuatro sitios repitiendo el mismo error, extraer
  gana claramente.
- **El guard usa la rueda del ratón, no `scrollIntoViewIfNeeded`.** Este fue el
  hallazgo importante al escribirlo: `scrollIntoViewIfNeeded` mueve `scrollTop`
  **por API**, y un `overflow: hidden` acepta que se lo muevan por código aunque
  el usuario no pueda tocarlo. Con esa versión el test **pasaba sobre el bug**.
  La rueda sólo mueve lo que de verdad scrollea, que es lo que hace una persona.
- **El viewport del guard es 667×340, no 812×375.** A 812px de ancho manda el
  layout de escritorio, el chrome baja a ~50px y el contenido entra: el test no
  probaría nada. Hace falta un ancho por debajo de `md` para que monte la nav
  móvil y el alto disponible se quede corto. También se verificó que falla en
  dos corridas seguidas, porque la cita se elige al azar entre cinco de largos
  distintos.
- **La migración tipográfica es fiel, no una reinterpretación.** `text-sm` y
  `text-xs` van a `body` y `caption`, que son exactamente los mismos 14 y 12px.
  El único cambio de tamaño real es la cita (24→20px en móvil, 30→32px en
  escritorio), y va en la dirección correcta: le quita altura justo donde no
  cabía.
- **Bajar el baseline de tokens de 499 a 423 es lo que le devuelve el filo al
  gate.** Sólo 3 de esos 76 son de este pack; el resto ya estaba migrado y el
  baseline se había quedado viejo. Con 499, cabían 76 aliases nuevos sin que
  nadie se enterara.

### Lo que a propósito NO se tocó

- **No se añadió un botón que navegue a Inicio.** Habría que bajar un callback
  de navegación por `ViewRouter` → `GraphView` → `EmptyState`, y ese plumbing
  choca justo con lo que reestructura el PR #358. El copy honesto resuelve el
  problema real —la instrucción falsa— sin encadenar cambios.
- **Los demás estados vacíos** (Biblioteca, Momentos, Stamps) tienen su propio
  componente y no usan el patrón roto; se revisó y no lo comparten.

## Validación

- `node scripts/run-vitest.mjs run` — suite completa.
- `npm run typecheck`, `npm run lint`, `npm run format:check`.
- Los once gates de frontend y repo, incluido `design-tokens` con el baseline
  nuevo en 423/423.
- `npm run build` + `node scripts/check-bundle-size.mjs`.
- Guard nuevo: **rojo sin el arreglo** (falla en `toBeInViewport`, dos corridas
  seguidas) y **verde con él**. El resto del gate anti-oclusión sigue en verde.
- Medido en el navegador a 812×375 tras el arreglo: aparece un scroller real
  (98px de recorrido), el botón queda en `bottom: 335` con el viewport en 375 y
  la cita se lee entera con el scroll arriba del todo.
