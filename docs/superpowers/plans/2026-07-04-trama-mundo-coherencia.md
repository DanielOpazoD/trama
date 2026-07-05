# Coherencia del mundo Trama — Vínculos, Momentos, Cronología, Inicio

## Problema

Tras rediseñar Entidades y Citas (#349), el resto del mundo Trama se
quedó desalineado: Vínculos, Momentos y Cronología arrastraban el hero
grande, y varias piezas (MomentoEntry, la home) mezclaban aliases
tipográficos legacy (`text-sm/base/lg/xl/xs`) con los tokens semánticos.
El usuario eligió el barrido de coherencia sobre una sola sorpresa
visual.

## Piezas

### Heros compactos

- Vínculos (`RelationshipsView`): de `spacing="normal"` a
  `spacing="tight"` + `density="compact"`.
- Momentos (`MomentosView`) y Cronología (`CronologiaView`): ya en
  `spacing="tight"`, ahora también `density="compact"`.
- Resultado: el título baja a la escala compacta y el contenido sube —
  menos scroll antes de lo que importa, igual que Entidades/Citas.

### Burn-down tipográfico (baja el ratchet)

- `MomentoEntry`: `text-lg`→`text-lead` (título de recorte), varios
  `text-sm`→`text-caption`/`text-body` (menús, caption de foto, enlaces).
- Home: `FeaturedQuote` (`text-xl md:text-2xl`→`text-h2 md:text-3xl`,
  `text-xs`/`text-sm`→`text-caption`), `RecentTimeline`, `HilosSueltos`,
  `FirstMomentPreview` (`text-lg md:text-xl`→`text-lead md:text-h2`).
- Todos a tokens semánticos: el ratchet de aliases legacy baja.

### Layout de relaciones más robusto

- `RelationshipRow`: la fila «sujeto · tipo · objeto» pasó a `flex-wrap`
  con `truncate` en los nombres — ya no desborda en pantallas angostas.

## Decisiones

- **La «sorpresa» de los sellos en Vínculos se descartó tras medir**: la
  vista pasa `from`/`to` como `undefined` a propósito (usa `fromName`/
  `toName` para NO disparar el query wholesale de entidades), así que la
  fila no conoce el TIPO de cada extremo y el sello no podría llevar su
  color. Ir contra esa optimización por estética no valía la pena; me
  quedé con el layout más limpio.
- Inicio (`HomeView`) NO usa `ViewHeader` (patrón ρ-canvas: la fecha
  reemplaza el título) — se respetó; solo se migró su tipografía.

## Validación

- Suite completa 4964 pass, typecheck, lint, prettier, gates
  (design-tokens con menos aliases, knip, dead-code, ratchets,
  icon-button, focus-ring, form-control-labels, boundaries), build y
  budget de bundle.
- Navegador (demo, mundo Trama): heros compactos verificados en Momentos
  (y por paridad Cronología/Vínculos); Vínculos renderiza el layout nuevo
  sin desbordes. Los 25 tests de las 4 vistas intactos.
