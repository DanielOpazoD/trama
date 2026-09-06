# Accesibilidad: el mundo Trama entero, y en móvil

## Problema

El gate de axe cubría las ocho secciones de Notas con una tabla y un ratchet,
pero el mundo Trama seguía con cuatro tests copiados a mano (Inicio,
Entidades, Momentos, Atlas) y **siete vistas sin auditar**: Grafo, Citas,
Escuchas, Twitter, Cronología, Chat y Sugerencias. Y todo corría a un solo
viewport de escritorio: los defectos de contraste y de tamaño de objetivo
táctil a 390 px no los veía nadie.

Al enumerar las vistas para escribir la tabla apareció algo peor que un hueco
de cobertura: **Cronología caía en el ErrorBoundary** («Esta vista se rompió»)
con el backend simulado de e2e. El mock devolvía `[]` para cualquier ruta no
listada y la vista hacía `for (const e of page.entradas)` sin comprobar nada.
Un backend roto en producción habría tumbado la vista igual.

## Cambios

- **`VIEW_MODES`** en `src/types/view.ts`: la lista de vistas existía solo
  como tipo; ahora es un `as const` del que se deriva el tipo, y el ratchet
  del e2e la contrasta con la tabla.
- **`e2e/a11y.spec.ts`**: tabla `VISTAS_TRAMA` con la señal de montaje de cada
  vista (el h2 de contenido; el grafo no tiene y se espera a su cromo), tests
  generados para las once, un guard que descarta la vista rota, y un
  `describe` **móvil** (390×844, táctil) que repite las once vistas y las ocho
  secciones de Notas. Los cuatro tests copiados desaparecen.
- **`CronologiaView`**: `page.entradas ?? []`, con test de unidad que sirve
  la respuesta malformada y exige el estado vacío sin errores de consola.
- **`e2e/fixtures.ts`**: stub de `/api/cronologia` con la forma real.
- **`ChatView`**: dos violaciones que solo salieron al auditarlo. El eyebrow
  «conversaciones» era un `h3` antes del primer `h2` (`heading-order`); pasa a
  `h2`. La región de mensajes es scrolleable y, sin hilo activo, no tiene
  nada enfocable dentro (`scrollable-region-focusable`): gana `tabIndex`,
  `role="region"` y etiqueta.

## Decisiones

- **Se audita el estado vacío con datos mínimos**, no una demo completa: es
  lo que el gate ya hacía en Notas, corre en 3 minutos y atrapa la estructura.
  El contraste de contenido real lo cubre `visual-sweep`, que sigue fuera del
  CI (pendiente conocido).
- **El guard de la vista rota es explícito.** Sin él, Cronología habría dado
  verde auditando el ErrorBoundary, que es accesible y no dice nada.
- **Móvil como `describe` y no como proyecto de Playwright**: evita duplicar
  toda la suite e2e a dos viewports; solo la auditoría corre dos veces.

## Validación

- 42 auditorías (11 + 8 en móvil, 11 en escritorio, más las especiales), todas
  en verde en local tras los dos arreglos de Chat. Cronología pasa en los dos
  viewports.
- **Por mutación**: quitar `?? []` de Cronología → falla el test nuevo de la
  vista. Los arreglos de Chat se verificaron al revés: la auditoría fallaba
  antes de tocarlos y pasa después.
- `typecheck`, `lint`, `format:check` y los gates del job `lint` en verde.

## Lo que dijo el CI

- **Grafo**: la señal `main button` pasaba en local y no en el runner. El
  primer botón de `main` es el conmutador de mundo, que en CI queda fuera de
  vista y nunca se da por visible. La señal pasa a ser el selector de lente
  del grafo («por densidad»), que solo existe con el grafo montado.
- **Un flaky ajeno**: `pdf-studio-editor` («abre exactamente la miniatura 8»)
  falló en CI con la hoja 7 centrada. `settled` es el estado del posicionador,
  no del layout; se afirma con `expect.poll` el estado al que converge. En
  local, 1 de 3 repeticiones falla en otra aserción del mismo test (la hoja
  salta 829 px tras 500 ms): eso no se toca aquí porque puede ser un defecto
  real de anclaje, y queda apuntado.

## Pendiente

- Resuelto (pack `2026-09-05-pendientes-del-dia`): el salto no reprodujo en 30
  corridas, pero la compensación de scroll solo miraba secciones completamente
  por encima del viewport; ahora ancla por la primera sección visible y cubre
  también la que asoma a medias.
- Las auditorías usan estado vacío o casi vacío; una vista con datos reales
  puede tener violaciones que aquí no aparecen. Conectar `visual-sweep` con
  axe sobre la demo completa es el siguiente paso.
- `heading-order` y `scrollable-region-focusable` son reglas de
  `best-practice`; si aparecen más como estas al crecer el corpus, conviene
  un test unitario de estructura de encabezados por vista.
