# Notas Home Polish Pack — Inicio y feed de Notas minimalistas

## Problema

El mundo Notas recibía con densidad sin jerarquía: el hero de sección
costaba ~200px de scroll, el Inicio tenía cinco botones para tres acciones
(capturar nota/tarea + nueva nota/tarea/prompt), las tarjetas vacías
mostraban contadores «0», el composer del feed llegaba desplegado completo
(título + anexos + captura) sin que nadie estuviera escribiendo, y la
píldora de modo prueba flotaba tapando contenido.

## Piezas

### ViewHeader con densidad compacta

- `density='compact'` (opt-in, no cambia el resto de la app): título
  text-3xl fijo, eyebrow/regla/subtítulo apretados, subtítulo en caption.
  OJO ratchet de design-tokens: text-2xl es alias legacy vetado — por eso
  el compacto usa text-3xl fijo.
- Inicio y el feed de Notas lo usan con `spacing='tight'`.

### Inicio sin redundancias

- Los cinco accesos duplicados quedan en TRES dentro de «Turno del día»
  (Nota · Tarea · Prompt, sustantivo limpio + plus, aria-label «Nueva …»).
- Los contadores de las tarjetas del hub solo aparecen cuando dicen algo
  (nada de «0»).
- La píldora «modo prueba» se repliega al ojito a los 6s (clic la reabre;
  IconButton por el gate); ya no tapa contenido.

### Composer del feed plegado

- En reposo: UNA línea limpia («Escribe una nota o pega un enlace…») con un
  ícono sutil de cámara (a la izquierda del ícono de escritura enfocada del
  MarkdownField — se solapaban en right-2.5, quedó right-10).
- Al enfocar o con contenido (`composerActive`): título, tres líneas,
  anexos y el botón de captura, con la animación fade-up existente.
- El alto lo gobierna `useAutosizeTextarea` con `minRows` DINÁMICO
  (1 plegado / 3 activo): sin eso el style.height quedaba pegado en el alto
  expandido al colapsar.
- Gotcha HMR: mover el orden de hooks dentro de `useNotasComposer` crashea
  la sesión caliente ("change in the order of Hooks") — es sólo HMR; carga
  fresca y tests quedan consistentes.

## Validación

- Suite completa 4958 pass (2 asserts del Inicio actualizados a los labels
  nuevos), typecheck, build, gates (design-tokens 499/499, ratchets,
  icon-button, knip…).
- Navegador (demo): Inicio con una sola fila de accesos y tareas visibles
  en el primer viewport; composer 26px en reposo → 78px al enfocar → 26px
  al salir; píldora replegada al ojito; íconos de cámara y foco separados
  (x403 vs x431).
