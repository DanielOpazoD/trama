# Pendientes declarados

<!-- GENERADO por `npm run pendientes`. No editar a mano: la fuente es la
sección «## Pendiente» de cada plan en docs/superpowers/plans/. Para cerrar
uno, edita el plan de origen (quítalo o márcalo como resuelto) y regenera. -->

**50 pendientes** en 32 planes, 1 marcados «[alto]». Del más reciente al más viejo; dentro de cada plan, los «[alto]» primero.

## 2026-09-10 · Diez avisos de @xmldom/xmldom bloqueaban el CI, y dos eran explotables de verdad

Plan: [2026-09-10-xmldom-0815.md](superpowers/plans/2026-09-10-xmldom-0815.md)

- La allowlist de MIME de la subida no es la puerta a `mammoth`: `helpers.ts` elige el visor con `baseMime === DOCX_MIME || ext === 'docx'`, y esa extensión sale del TÍTULO del item, que el usuario puede reescribir. No es una vulnerabilidad —el archivo es del propio dueño y el HTML se sanitiza con DOMPurify antes de pintarse— pero el enrutado por título es frágil y merece mirarse.

## 2026-09-10 · La columna de página no tenía dónde declararse

Plan: [2026-09-10-primitiva-page.md](superpowers/plans/2026-09-10-primitiva-page.md)

- El ornamento de Inicio queda huérfano cuando Efemérides y WeeklyActivity devuelven null (el caso del modo prueba): 48 px de aire, un glifo de 12 px y otros 48. Pide un separador que se anule solo cuando le falta un vecino, en vez de una guardia local que ya murió una vez.

## 2026-09-10 · Estados vacíos que enseñan: cada vacío ofrece una salida real

Plan: [2026-09-10-estados-vacios.md](superpowers/plans/2026-09-10-estados-vacios.md)

- `NotasWorld` precarga Notas, Biblioteca y Claves con un `import()` suelto, además del de su `lazy`: el mismo patrón que destapó la carrera con los mocks. Hoy no falla, porque la precarga va por hover y el montaje llega después, pero conviene un cargador compartido por módulo.
- «Fotos a Imprenta» se nombra en el vacío de Imprenta pero no se ofrece como acción: Momentos vive en el otro mundo, y cruzar exige cambiar de mundo y de sección desde el shell.
- La salida secundaria de Inicio de Notas («Crear tarea») sigue con un contorno escrito a mano: `Button` no tiene variante secundaria con contorno, y `quiet` es un rótulo. Decidir la variante y migrarla.
- `check:empty-states` reconoce una salida por texto (`action=`, `hint=`, `<button` u `onClick=`), así que no distingue un `hint` que es solo texto de uno interactivo.
- `scripts/pendientes.mjs` descarta cualquier ítem que contenga una de sus palabras de cierre, aunque no hable de cerrar nada. Pasó en esta misma nota: el pendiente del contorno «a mano» llevaba esa palabra y desapareció del registro en silencio; solo lo delató contar los ítems. La marca de cierre debería ir al principio del ítem, con su test.

## 2026-09-10 · La columna de las vistas pasa a Page, y la medición destapa tres defectos

Plan: [2026-09-10-columna-router-y-notas.md](superpowers/plans/2026-09-10-columna-router-y-notas.md)

- La barra de selección de Notas (`NotasImprentaSelectionBar`, que es `fixed bottom-6`) probablemente tapa la última fila en escritorio cuando hay una selección activa: el cierre de la columna ahí es de 40 px. Todo apunta a que el `pb-24` existía para dejarle sitio y el `md:py-10` lo anulaba sin querer. Es hipótesis: medirlo con una selección activa y, si se confirma, reservar su alto como hace el AskBar con `--askbar-h`.
- Pasar el ritmo de Inicio (`space-y-12`, 48 px) a la escala. Con los márgenes muertos ya borrados, pasar a `gap` no resucita nada, pero hay que medir el vector de huecos de cada sección.
- El espacio muerto bajo las listas cortas (Cronología, Atlas, Momentos, Claves) y su cierre: ninguna de las tres vistas de lista lo marca con el `EndMark` que sí usan Entidades y Citas.
- `scripts/pendientes.mjs` solo acepta como continuación de un ítem las líneas con sangría, pero Markdown también admite continuaciones sin sangría. Pasó en esta misma nota: Prettier dejó sin sangría una línea que partía un código en línea, y el registro truncó el pendiente en silencio. Lo delató `format:check` solo porque el trozo perdido llevaba un acento grave; sin él no lo habría visto nadie. No hay más casos en el repo (recorrido completo), pero el generador debería tratar esas líneas como continuación, con su test.

## 2026-09-09 · El grafo encuadraba contra una caja más chica que el dibujo

Plan: [2026-09-09-encuadre-del-grafo.md](superpowers/plans/2026-09-09-encuadre-del-grafo.md)

- El resto de la composición al viewport: Imprenta deja 588 px muertos, Cronología 487 y Atlas 327, y el ritmo vertical usa doce valores distintos (de 4 a 48 px, con un −8 recurrente). Eso pide la primitiva `Page` y la escala enchufada a los `--space-N` que ya existen en `index.css` y que hoy no consume nadie.

## 2026-09-07 · El vigía de arranque: una pantalla en blanco que se explica

Plan: [2026-09-07-vigia-de-arranque.md](superpowers/plans/2026-09-07-vigia-de-arranque.md)

- [alto] En `tramadaod.netlify.app` y en los deploy previews, Clerk rechaza la clave de producción por dominio: la sesión no arranca y ahora se ve el panel del vigía en vez del blanco. Es configuración, no código —hace falta una clave de test para esos contextos, o aceptar que el único dominio válido es `tramahub.app`—. Decidirlo, y si toca, poner la clave por contexto de deploy.

## 2026-09-06 · Producción en blanco con el CI en verde

Plan: [2026-09-06-produccion-en-blanco.md](superpowers/plans/2026-09-06-produccion-en-blanco.md)

- El humo carga `/` sin backend y sin Clerk; no navega. Cubrir Inicio en demo sobre el bundle (con `trama-demo` en localStorage) daría una segunda pantalla real por el mismo precio.

## 2026-09-06 · Fotos de Momentos a Imprenta: el puente entre mundos

Plan: [2026-09-06-momentos-a-imprenta.md](superpowers/plans/2026-09-06-momentos-a-imprenta.md)

- En el arnés de unidad, el mock de `PdfStudioView` no intercepta el import perezoso de `NotasWorld` (se ve el estudio real); el test del drenaje afirma la sección y la cola, y la e2e afirma el resto. Conviene entender por qué.

## 2026-09-06 · ModalShell, PR C: los cuatro PENDING

Plan: [2026-09-06-modal-shell-pr-c.md](superpowers/plans/2026-09-06-modal-shell-pr-c.md)

- `BibliotecaViewer` vive en `z-[100]`, la capa `max` que la escala reserva para depuración; debería ser `z-lightbox` o `z-modal`, y entonces `BibliotecaLinkPicker` podría migrar a `ModalShell`.

## 2026-09-06 · ModalShell, PR B: adopción y trinquete

Plan: [2026-09-06-modal-shell-pr-b.md](superpowers/plans/2026-09-06-modal-shell-pr-b.md)

- `ModalShell` no expone `aria-labelledby`; `ConfirmDestroy` pasa el título como `aria-label`, que para un `alertdialog` de una línea es equivalente.

## 2026-09-06 · Inicio en modo prueba mostraba un error (y el router no sabía qué le faltaba)

Plan: [2026-09-06-inicio-en-demo.md](superpowers/plans/2026-09-06-inicio-en-demo.md)

- El contrato comprueba que cada ruta GET del cliente tenga caso en el router, no que la FORMA coincida con el tipo del cliente (eso solo lo fijan los tests puntuales de `demo.test.ts`: health, x/status, home). Comparar formas pediría tipos en runtime (zod o similar) en `src/api`; es otro pack.

## 2026-09-06 · Contratos de lectura en runtime

Plan: [2026-09-06-contratos-de-lectura.md](superpowers/plans/2026-09-06-contratos-de-lectura.md)

- Extender los contratos a las lecturas de listas (`entities`, `quotes`, `relationships`, `momentos`, `notes`) con esquemas parciales de fila; hoy siguen sin verificación.
- Los contratos son del cliente; las funciones de Netlify no los importan. Compartirlos (que `home.mts` valide su salida con el mismo esquema) cerraría el borde desde los dos lados.

## 2026-09-06 · Fotos a Imprenta también desde el Álbum

Plan: [2026-09-06-album-a-imprenta.md](superpowers/plans/2026-09-06-album-a-imprenta.md)

- Nada nuevo. El toast de «enviadas» sigue viviendo en NotasWorld (ver el plan de `2026-09-06-momentos-a-imprenta`).

## 2026-09-05 · vitest 5

Plan: [2026-09-05-vitest-5.md](superpowers/plans/2026-09-05-vitest-5.md)

- La optimización del entorno de tests (`vmThreads` o `isolate: false`): la suite tarda 5 minutos y la mitad es crear happy-dom. Medir con y sin, y comprobar que ningún test dependía del aislamiento.

## 2026-09-05 · Vite 8

Plan: [2026-09-05-vite-8.md](superpowers/plans/2026-09-05-vite-8.md)

- `vitest` 5 salió; entra cuando toque, con su propio pack.

## 2026-09-05 · Una aguja para el sensor: web vitals en el panel de salud

Plan: [2026-09-05-vitals-en-el-panel-de-salud.md](superpowers/plans/2026-09-05-vitals-en-el-panel-de-salud.md)

- FCP y TTFB se guardan pero no se muestran. Son diagnósticos, no Core Web Vitals; entran cuando alguien los necesite para explicar un LCP.
- No hay serie temporal: si el p75 empeora, la tarjeta lo dice, pero no cuándo empezó. Un sparkline diario por métrica es el paso siguiente natural.
- La query no está en `check:query-plans` (pide Postgres local). El índice `idx_web_vitals_metric_time` la cubre, pero conviene confirmarlo con `EXPLAIN` cuando haya base a mano.

## 2026-09-05 · Imprenta: elegir hojas sin apuntar, y un OCR que vuelve

Plan: [2026-09-05-imprenta-teclado-y-ocr-de-vuelta.md](superpowers/plans/2026-09-05-imprenta-teclado-y-ocr-de-vuelta.md)

- Flechas arriba/abajo con Shift para extender la selección desde el teclado sin pasar por el ratón; hoy las flechas reordenan, y cambiarlas de sentido pide decidir primero qué gesto gana.
- Un e2e con un PDF real en Imprenta cubriría lo que la demo no puede.

## 2026-09-05 · Los PDF guardados de Imprenta se pueden recuperar

Plan: [2026-09-05-imprenta-pdfs-guardados-servidos.md](superpowers/plans/2026-09-05-imprenta-pdfs-guardados-servidos.md)

- La miniatura sigue siendo el ícono de tipo: `Thumbnail` solo pide el blob para imágenes. Renderizar la primera hoja con pdf.js en la card es posible ahora que el blob se sirve, pero pesa y conviene medirlo antes.

## 2026-09-05 · Imprenta en un navegador de verdad: elegir hojas y volver desde Biblioteca

Plan: [2026-09-05-e2e-imprenta-seleccion.md](superpowers/plans/2026-09-05-e2e-imprenta-seleccion.md)

- El e2e corre solo en Chromium de escritorio, como el resto de la suite.
- Sigue sin e2e de OCR; si algún día se empaqueta el idioma con la app, entra.

## 2026-09-05 · La llave del vault viaja en el respaldo

Plan: [2026-09-05-claves-llave-en-el-backup.md](superpowers/plans/2026-09-05-claves-llave-en-el-backup.md)

- Re-cifrar las claves de un vault a otro (para fusionar dos respaldos con contraseñas distintas) no existe. Hoy el aviso es honesto: se conservan las locales y las ajenas no se abren.

## 2026-09-05 · Accesibilidad: el mundo Trama entero, y en móvil

Plan: [2026-09-05-a11y-movil-y-mundo-trama.md](superpowers/plans/2026-09-05-a11y-movil-y-mundo-trama.md)

- Las auditorías usan estado vacío o casi vacío; una vista con datos reales puede tener violaciones que aquí no aparecen. Conectar `visual-sweep` con axe sobre la demo completa es el siguiente paso.
- `heading-order` y `scrollable-region-focusable` son reglas de `best-practice`; si aparecen más como estas al crecer el corpus, conviene un test unitario de estructura de encabezados por vista.

## 2026-08-17 · El PDF que se subía y no se podía borrar

Plan: [2026-08-17-imprenta-blob-huerfano.md](superpowers/plans/2026-08-17-imprenta-blob-huerfano.md)

- Queda una carrera anterior a este cambio: si se borra mientras la subida está en vuelo, `syncSavedPdf` todavía hace `putSavedDoc` y resucita el registro local; y como en ese momento no había `serverPdf`, el blob queda huérfano sin rastro. Se arregla con un guard de cancelación en `syncSavedPdf`.

## 2026-08-16 · Un piso de cobertura donde un desplome no se vería

Plan: [2026-08-16-piso-de-ramas-donde-se-decide.md](superpowers/plans/2026-08-16-piso-de-ramas-donde-se-decide.md)

- El umbral global de ramas sigue en 66%. Subirlo pide cubrir superficies concretas, no cambiar el número: cada punto son ~1.000 ramas repartidas por todo el repo.

## 2026-08-16 · Dos maquetadores de imágenes-a-hoja, y sólo hacía falta uno

Plan: [2026-08-16-pila-documental-por-uso-real.md](superpowers/plans/2026-08-16-pila-documental-por-uso-real.md)

- Quedan cuatro vendors documentales pesados (`pdf-lib`, el worker de pdf.js, `xlsx`, `mammoth`). Los cuatro se usan de verdad y ya cargan de forma perezosa; no hay redundancia que quitar sin cambiar funcionalidad.

## 2026-08-16 · Imprenta: 16 hojas que pesaban 1,8 GB, y una grilla sin scroll

Plan: [2026-08-16-imprenta-export-peso-y-navegacion.md](superpowers/plans/2026-08-16-imprenta-export-peso-y-navegacion.md)

- El peso real del caso del usuario no se pudo medir contra su libro: las fixtures reproducen la forma del PDF, no el archivo. La proporción medida (16× por el lote, ~300× añadiendo la poda) predice unos pocos MB donde había 1,8 GB, pero conviene confirmarlo con el libro real.
- La barra del documento sigue desplazándose fuera de vista al bajar por la grilla. Con 600 hojas eso obliga a volver arriba para exportar.

## 2026-08-16 · La barra deja de esconderse, y aparece cómo llegar a la hoja 480

Plan: [2026-08-16-imprenta-barra-fija-y-salto-a-hoja.md](superpowers/plans/2026-08-16-imprenta-barra-fija-y-salto-a-hoja.md)

- El salto es un campo numérico. Un carril de posición vertical —un minimapa que muestre dónde estás dentro de las 600— sería mejor affordance, pero es otra decisión de diseño y otro PR.

## 2026-08-16 · El gate del anillo de foco existía en el papel

Plan: [2026-08-16-foco-visual-al-ci.md](superpowers/plans/2026-08-16-foco-visual-al-ci.md)

- Las baselines se generaron en esta máquina (macOS). Si el runner `macos-latest` renderiza distinto, el primer CI lo dirá — y ese desacuerdo sería información, no ruido.
- `visual-sweep` sigue sin correr en ningún sitio. Antes de conectarlo hay que bajarle el ruido; hoy no está en condiciones de bloquear un merge.

## 2026-08-16 · El `.docx` también sale del hilo principal

Plan: [2026-08-16-docx-fuera-del-hilo-principal.md](superpowers/plans/2026-08-16-docx-fuera-del-hilo-principal.md)

- La previsualización completa (descarga → Worker → sanitizado → render) sigue sin poder ejercitarse desde el preview: el `demoRouter` no sirve un `.docx` ni un `.xlsx` reales. El Worker sí se verificó con bytes reales.

## 2026-08-16 · Doce avisos que nadie miraba, y un parser encerrado

Plan: [2026-08-16-deps-vulnerabilidades-y-xlsx-aislado.md](superpowers/plans/2026-08-16-deps-vulnerabilidades-y-xlsx-aislado.md)

- El modo demo no sirve un `.xlsx` real para `demo-sheet-1`, así que el visor completo (descarga → Worker → sanitizado → tabla) no se puede ejercitar de punta a punta desde el preview. El Worker sí se verificó con bytes reales; el cableado del visor queda cubierto por tests.
- `mammoth` sigue parseando `.docx` en el hilo principal. No tiene aviso abierto, pero es material arbitrario del usuario y el Worker ya está construido.

## 2026-08-16 · El peso de exportar deja de ser una sorpresa

Plan: [2026-08-16-corpus-pdf-y-presupuesto-de-peso.md](superpowers/plans/2026-08-16-corpus-pdf-y-presupuesto-de-peso.md)

- La envolvente de memoria sigue sin medirse (ver decisiones).
- El corpus reproduce formas, no archivos reales. Si aparece un libro que rompe de otra manera, la forma nueva se agrega acá y el presupuesto la cubre sola.

## 2026-08-16 · El gate de accesibilidad deja de mirar sólo un tercio

Plan: [2026-08-16-a11y-todas-las-superficies.md](superpowers/plans/2026-08-16-a11y-todas-las-superficies.md)

- El mundo `trama` (grafo, momentos, atlas, citas, chat) sigue con tests escritos a mano y sin ratchet equivalente: sus vistas no viven en una constante como `NOTAS_SECTIONS`. Cerrar ese lado pide primero un inventario de vistas del que derivarlo.
- Todas las auditorías corren a un único viewport de escritorio. Los defectos históricos de esta serie aparecieron en anchos móviles.

## 2026-07-03 · Planillas Trust Pack — estado de nube visible y versiones restaurables

Plan: [2026-07-03-planillas-trust-pack.md](superpowers/plans/2026-07-03-planillas-trust-pack.md)

- Ciclo completo con sesión real: guardar → editar → «Versiones…» muestra la versión anterior → restaurar → aparece la restaurada en otro navegador.
