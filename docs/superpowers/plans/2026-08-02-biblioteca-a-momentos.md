# Biblioteca → Momentos, y las barras flotantes que se salían de la pantalla

## Problema

Desde la Biblioteca se podía enviar una selección a Imprenta, pero no a
Momentos: para llevar una foto al álbum había que descargarla y volver a
subirla por el composer.

Al añadir el tercer botón apareció un segundo problema, este preexistente: la
barra flotante de selección **se salía de la pantalla por la derecha**. Medido
en el navegador a 661px de viewport, su borde derecho caía en 960px.

## Piezas

**`src/lib/momentos/import/libraryItemsToMomentoItems.ts`** (nuevo). Espejo de
`libraryItemsToPdfFiles`: un predicado puro que decide qué acepta el destino, y
un adaptador que baja el blob, lo re-sube al store de Momentos y devuelve los
`items[]` del payload. Dependencias inyectadas (bajar, subir, leer dimensiones)
para que sea testeable sin DOM ni red.

**`BibliotecaSelectionBar`**. Botón "Enviar a Momentos" con el mismo tratamiento
que Imprenta: `aria-disabled` en vez de `disabled` nativo para que el Tooltip
siga explicando por qué no se habilita.

**`demoRouter`**. Ruta `POST /api/momentos-upload`, que faltaba. Sin ella la
acción fallaba justo en el modo demo que el README anuncia como puerta de
entrada.

**Seis componentes con el centrado roto.** `BibliotecaSelectionBar`,
`RecorteSelectionBar`, `MergeMomentosBar`, `ReadingMode`, `PromoteModal`,
`LibroModal`.

## Decisiones

**Se re-suben los blobs, no se reusa la storageKey.** Los archivos de la
Biblioteca viven en otros dominios (`library-uploads`, `notas-attachments`,
`recortes-media`) y el barrido de huérfanos de Momentos razona sobre las claves
de SU store. Apuntar un momento a una clave ajena crearía un dueño compartido
invisible: borrar el adjunto original dejaría el momento con una foto rota.
Copiar cuesta una subida y deja cada dominio dueño de lo suyo.

**Un episodio, no N momentos sueltos.** Enviar cinco imágenes produce un momento
de cinco — igual que el composer al elegir varias de una vez. Lo contrario
obligaría a fusionarlas después a mano.

**Las fotos que YA son de Momentos se excluyen.** La Biblioteca proyecta el
store de Momentos, así que sus propias fotos aparecen en la lista; reenviarlas
duplicaría el episodio sin que el usuario entienda por qué ve la foto dos veces.
El botón se deshabilita y el Tooltip lo explica.

**Las dimensiones son best-effort.** Un codec que el navegador no decodifica no
puede costar la subida entera: si el lector falla o devuelve 0, el item va sin
`width`/`height` y el render usa su fallback.

**El centrado deja de usar `transform`.** Los keyframes de `fade-up` y
`slide-up` terminan en `transform: translateY(0)`, que **reemplaza** el
transform entero y borra el `translateX(-50%)`. Se cambia a `inset-x-0` +
`mx-auto`, que centra sin competir con la animación. Se arreglaron los seis
casos, no solo el que tocaba esta PR: son la misma línea y dejar cuatro rotos
a sabiendas sería peor.

**Lo que NO se tocó.** El tope de 10 MB de la subida de Momentos sigue igual: un
video grande enviado desde la Biblioteca falla con "Archivo > 10 MB" y queda
reportado como fallo parcial. Levantarlo exige la ruta de subida directa a R2
que ya usa la Biblioteca — es otro trabajo, no un parche acá.

## Validación

- Suite completa: **5253 pasan**, 17 skipped, 0 fallan.
- 13 tests nuevos del módulo, **verificados por mutación**: quitar la guarda
  anti-duplicado rompe 1; quitar la marca `type: 'video'` rompe 2; y un control
  que cambia algo irrelevante deja los 13 en verde (las sondas no fallan por
  casualidad).
- Gates: design-tokens, icon-button, focus-ring, frontend-boundaries,
  structure-ratchets, knip, dead-code, modal-overlay. Typecheck, lint, formato.
- Build y `check-bundle-size` en verde.
- **En el navegador** (modo demo, 661px): el botón aparece; está deshabilitado
  al seleccionar una foto que ya es de Momentos y habilitado al añadir un
  recorte; al pulsarlo se crea un momento con **un solo** item —el recorte, no
  la foto ya existente— y Momentos pasa de 3 a 4 fotos.
- Centrado medido antes y después: `der: 960 / viewport 661` → `izq: 16,
der: 645`, centrada y sin desbordar.
