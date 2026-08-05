# CloseButton reenvía la ref (el tooltip de cerrar volvía a morir)

## Problema

El PR #391 arregló `IconButton` con `forwardRef` porque `Tooltip` clona su
hijo y le inyecta un ref para medir dónde posicionarse. Pero `CloseButton`
—el wrapper estándar de la X de cerrar, montado SOBRE IconButton— seguía
siendo una función plana: la ref moría un nivel más arriba de donde se
arregló. Síntoma observado en la vista de detalle de entidad
(`EntityHeader`): React avisa «Function components cannot be given refs»
con traza `Tooltip → CloseButton`, y el tooltip «Cerrar panel» no abre
nunca (`show()` sale temprano con `triggerRef.current` null). El mismo bug
de #391, reintroducido por composición.

## Cambios

- **`CloseButton.tsx`**: pasa a `forwardRef<HTMLButtonElement, …>` y reenvía
  la ref a `IconButton` (que ya la lleva al `<button>` nativo). Doc comment
  actualizado con el porqué, espejando el de IconButton.
- **`CloseButton.test.tsx`**: dos sondas nuevas que muerden:
  1. la ref de `createRef` queda asignada al `<button>` nativo;
  2. un `Tooltip` que envuelve a `CloseButton` abre de verdad al hover
     (fake timers + `fireEvent.mouseEnter`, el idiom de `Tooltip.test.tsx`).

## Decisiones

- **Barrido del repo**: los hijos directos de `Tooltip` son todos
  `IconButton` salvo este `CloseButton` de EntityHeader — no hay más casos
  rotos hoy. Otros componentes con `IconButton` como raíz (`DemoBanner` en
  AuthGate, `PinButton`/`DownloadButton` en BibliotecaViewer,
  `SelectionCircle`) **se dejan sin forwardRef a propósito**: no reenvían
  props hacia un consumidor externo con ref ni viven bajo `Tooltip`;
  agregarlo sería especulativo. Si alguno entra bajo Tooltip algún día, la
  sonda patrón de este pack es el molde.
- No se generaliza con un lint/gate «wrapper de IconButton ⇒ forwardRef»:
  un caso real en ~2 meses no justifica un gate nuevo (maquinaria sin
  problema que la pida).

## Validación

- **Rojo→verde**: las 2 sondas nuevas fallan contra el código viejo
  (el mutante real) y pasan con el fix; las 4 preexistentes verdes siempre.
- **Mutante de control** (ícono 14→13, inyección verificada en el diff):
  las sondas siguen verdes — miden la ref, no se alarman ante cualquier
  cambio. Revertido tras la corrida.
- Suite completa + typecheck + lint + format + gates de frontend + build +
  budget de bundle en verde (ver PR).
- **Navegador** (dev server, modo demo, panel de detalle de entidad):
  consola sin el warning con el panel montado, y al hover sobre la X el
  tooltip abre de verdad — medido en el DOM: `role="tooltip"` con texto
  «Cerrar panel», `opacity: 1`, card `rgb(9,9,11)`, rect 46×36 anclado al
  botón, y `aria-describedby` del botón apuntando al id del tooltip. (La
  captura de píxeles del panel recorta el borde derecho del viewport real,
  así que la evidencia es la medición numérica, no el screenshot.)
