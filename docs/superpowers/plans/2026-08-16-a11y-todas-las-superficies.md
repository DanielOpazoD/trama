# El gate de accesibilidad deja de mirar sólo un tercio

## Problema

`e2e/a11y.spec.ts` pasaba axe por 5 superficies. Del mundo Notas cubría 3 de sus
8 secciones, y dejaba fuera **Imprenta y Planillas**, que son las dos con más
controles de todo el producto, además de Claves, Biblioteca e Inicio.

Peor que el hueco era que nada lo señalaba. Cada sección tenía su test copiado a
mano, así que una sección nueva simplemente entraba sin prueba y el gate seguía
verde informando sobre las secciones de siempre.

## Cambios

- **Una tabla y un runner compartido** reemplazan a los tests copiados. Eran el
  mismo bloque con el título cambiado, y esa forma es justo la que encarece
  añadir la novena sección.
- **Las 8 secciones de Notas** se auditan: Inicio, Notas, Tareas, Prompts,
  Claves, Imprenta, Planillas y Biblioteca.
- **Un ratchet** contrasta la tabla contra `NOTAS_SECTIONS`, que es la misma
  constante que consume el enrutador. Una sección nueva aparece ahí sola, y este
  test la reclama antes de que llegue a producción sin revisar.

## Decisiones

- **La lista se deriva del enrutador, no se escribe a mano.** Un inventario
  paralelo envejece en silencio: es exactamente cómo se llegó a 3 de 8. Al leer
  `NOTAS_SECTIONS`, el gate no puede quedarse atrás sin que el CI lo diga.
- **El test del recorte en el feed se queda aparte.** Audita contenido POBLADO
  con su menú de acciones, que es un caso distinto del baseline vacío y aporta
  cobertura que la tabla no da.
- **Los tests de Prompts y Tareas se borran**, porque la tabla los cubre igual:
  eran el baseline con un `waitFor` de encabezado. Mantener las dos versiones
  sería duplicación sin señal extra.
- **No se tocó ningún componente.** Las 5 superficies nuevas entraron limpias:
  los gates estáticos que ya existían —`check:focus-ring`,
  `check:icon-button`, `check:form-control-labels`— venían haciendo su trabajo.
  Este PR no arregla accesibilidad, cierra el punto ciego.

## Validación

- `e2e/a11y.spec.ts`: **16 pruebas**, todas en verde (eran 9).
- `typecheck`, `lint`, `format:check` y los gates de docs, registro, knip y
  avisos de dependencias en verde.

**Verificado por mutación** — porque un verde nuevo puede significar que la
sonda no está mirando nada:

- Se inyectó un `<img>` sin `alt` en el dropzone de Imprenta → la auditoría de
  esa sección falla nombrando la violación: `[critical] image-alt: Images must
have alternative text`, con el nodo. La cobertura nueva ve contenido real.
- Se quitó `biblioteca` de la tabla → el ratchet falla nombrando la sección que
  faltó.

## Pendiente

- El mundo `trama` (grafo, momentos, atlas, citas, chat) sigue con tests
  escritos a mano y sin ratchet equivalente: sus vistas no viven en una
  constante como `NOTAS_SECTIONS`. Cerrar ese lado pide primero un inventario
  de vistas del que derivarlo.
- Todas las auditorías corren a un único viewport de escritorio. Los defectos
  históricos de esta serie aparecieron en anchos móviles.
