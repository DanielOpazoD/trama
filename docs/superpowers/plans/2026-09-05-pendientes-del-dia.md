# Los pendientes del día, pagados

## Problema

Las diez notas de pack del 5 de septiembre dejaron pendientes declarados.
Algunos eran defectos (el editor de Imprenta podía correr la hoja abierta tras
«settled»; un `POST` que dejaba blobs huérfanos al re-guardar), otros ruido
(rechazos sin manejar de la View Transitions API), y otros deuda pequeña de
tipos, configuración y herramientas. Este pack los paga juntos, y dice cuáles
no.

## Cambios

- **Editor de Imprenta, anclaje de scroll.** La compensación por inflación
  tardía sumaba solo las secciones COMPLETAMENTE por encima del viewport. La
  hoja anterior a la abierta asoma por arriba: si ella terminaba de renderizar
  después de «settled», su crecimiento empujaba la abierta hacia abajo sin
  compensación. Ahora la foto base guarda la sección **más visible** y su
  distancia al borde, y la compensación la mantiene ahí venga de donde venga
  el cambio. El salto de 829 px no reprodujo en 30 corridas (18 bajo carga de
  CPU), así que esto cierra el único camino conocido, no un caso observado.
- **`startViewTransition`** captura el `AbortError` también en `ready` y
  `updateCallbackDone`: eran los «Transition was skipped» del dev server.
- **`pdf-studio-saved-pdfs` `POST`**: lee el key vivo antes del `UPSERT` y
  borra el blob anterior DESPUÉS, con su manifest. Si el upsert falla, el
  documento conserva su PDF.
- **`ExportPayload`** declara `prompts` y `secrets` con la forma que el
  servidor envía.
- **Registro de pendientes**: «[alto]» al principio de un ítem lo pone
  primero dentro de su plan y lo cuenta en la cabecera.
- **`tsconfig.node.json`** con `allowImportingTsExtensions`; `vite.config.ts`
  importa `./scripts/vite-manual-chunks.ts` y el cargador nativo deja de
  avisar.
- **`pdf-visual.yml`** escucha `merge_group`.
- **X (Twitter) en modo prueba tumbaba la app.** El «flaky» de la e2e de
  Configuración no era el carril: la respuesta demo de `/api/x/status` venía
  sin `counts` (ni `needsReconnect`, `username`, `xUserId`), `XPanel` leía
  `counts.totalBookmarks` y el ErrorBoundary raíz reemplazaba la interfaz
  («La trama se rompió»). Solo se veía cuando la query alcanzaba a resolver
  antes del clic siguiente; bajo carga, siempre. La demo devuelve ahora la
  forma completa, un test de contrato la fija, y el e2e espera a que cada
  panel pinte sus datos antes de pasar al siguiente, que es lo que le faltaba
  para atrapar esto.
- Notas de pack: los pendientes cerrados quedan marcados «Resuelto», y el de
  `StrictMode` como lo que era, un error de lectura: ya estaba activo.

## Decisiones

- **Un «flaky» es un defecto hasta que se demuestre lo contrario.** La
  primera versión de este pack le puso al e2e de Configuración una espera al
  carril; volvió a fallar bajo carga y la captura de Playwright mostraba la
  pantalla de error de la app. El diagnóstico con la consola capturada dio el
  stack en un minuto.
- **Anclar por la sección más visible, no por la primera que asoma.** La
  primera versión anclaba la primera sección con algo dentro del viewport; en
  el escenario real (la anterior asoma por arriba y crece) su top no se mueve
  y la prueba pasaba con la lógica vieja. La mutación lo dijo y el criterio
  cambió.
- **Lo que NO se hace aquí**, con motivo: re-cifrar claves entre vaults, la
  miniatura real de los PDF guardados, la serie temporal de vitals, el barrido
  de axe sobre la demo completa, Shift+flechas en la selección, OCR y otros
  navegadores en e2e, y `vitest` 5. Son funciones o migraciones con su propio
  coste, no deuda del día; siguen en el registro.

## Validación

- Geometría del editor: 12 tests, 2 nuevos; **por mutación**, volver a la
  lógica de «solo las de arriba» hace fallar el escenario de la hoja que
  asoma.
- `viewTransition`: test nuevo con las tres promesas rechazando; quitar el
  `catch` de `ready` produce el «Unhandled Rejection» en vitest.
- Endpoint de PDF guardados: test nuevo del re-guardado, con el orden
  subir → upsert → borrar comprobado.
- Demo: test de contrato de `/api/x/status`; quitar `counts` de la respuesta
  demo lo hace fallar.
- Registro: test de «[alto]»; el registro real baja a 28 pendientes.
- `typecheck`, `lint`, `format:check`, gates del job `lint`, suite de unidad
  y los e2e del editor, Configuración e Imprenta en verde.
