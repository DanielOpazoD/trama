# Sidebar Premium Pack — una sola barra lateral para dos mundos

## Problema

Las barras de Trama y Notas evolucionaron por separado y se notaba: íconos
con estilos distintos entre mundos (activo, tamaños, colapso), el botón
«Configuración» con texto y badge numérico en Trama versus otro pie en
Notas, buscadores diferentes, y un ancho fijo que no se podía ajustar.
Screenshots del usuario como evidencia; el encargo pide premium, ancho
ajustable con el mouse, iconografía de una misma aplicación (abierto y
colapsado), Configuración solo ícono y el pie con la misma firma.

## Piezas

- **`sidebarChrome.tsx` (nuevo)** — chrome compartido, única fuente de
  verdad del lenguaje de ambas barras:
  - `useSidebarWidth()`: ancho persistido en localStorage
    (`trama:sidebar-width`, default 256, clamp 208–384), arrastre con
    pointer capture + rAF, doble clic restaura, flechas ← → ajustan ±16.
  - `SidebarResizeHandle`: `role="separator"` vertical y enfocable;
    invisible en reposo, línea de 2px en hover/foco, acento al arrastrar.
  - `SidebarCollapseButton`: chevron sutil size-7, mismo gesto en ambos
    mundos y en ambos estados.
  - `SidebarSearchTrigger`: el disparador del buscador, idéntico.
  - `SidebarSettingsButton`: Configuración como ícono con Tooltip; las
    alertas son un dot con `animate-pulse-subtle` (fuera el badge numérico).
  - `SidebarBrandLine`: firma `trama · v{versión}` en micro uppercase.
- **`NavButton` generalizado** (`NavItem<V extends string>`): el mundo
  Notas reutiliza el MISMO componente de ítem que Trama — activo con barra
  de acento, tamaños, tooltips y modo colapsado idénticos, con su propio
  `accentColor` (sage) para conservar identidad sin divergencia.
- **`Sidebar.tsx` (Trama)**: ancho gobernado por el hook + handle de
  resize; pie nuevo `AIModeToggle` + fila `[⚙] … [trama · vX]`.
- **`NotasSidebar` (NotasWorldChrome.tsx)**: reescrito sobre el chrome
  compartido en expandido y colapsado; `useSidebarWidth()` va ANTES del
  early-return de collapsed (rules of hooks). El wrapper de cada ítem
  conserva `onSectionIntent` (prefetch por hover/foco).

## Decisiones

- Un solo ancho compartido entre mundos (misma key): la barra se siente
  «el mismo mueble» al cruzar de mundo.
- No se fuerza identidad de acento: Trama mantiene su acento primario y
  Notas su sage — misma gramática, distinta tinta.
- El asa vive dentro del aside (`absolute right-0`), no como columna
  extra: cero coste de layout cuando no se usa.

## Validación

- Suite completa 4957 pass, typecheck, lint, prettier, gates
  (design-tokens, knip, dead-code, structure-ratchets, icon-button,
  focus-ring, form-control-labels, frontend-boundaries), build.
- Navegador (demo, escritorio): drag 256→336 persistido y doble clic
  restaura 256 (`{before: 256, after: 336, stored: "336", afterReset:
256}`); flechas ±16 desde el asa; ambos mundos verificados expandidos y
  colapsados — mismo colapso, mismo buscador, mismo pie, Configuración
  solo ícono con tooltip.
