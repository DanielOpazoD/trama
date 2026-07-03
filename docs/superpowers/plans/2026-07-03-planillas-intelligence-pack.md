# Planillas Intelligence Pack — casilleros con nombre real y perfil propio

## Problema

Dos fricciones de "producto en bruto": (1) las sugerencias de casilleros
nombraban todo `campo_N`, así que había que renombrar a mano cada variable
para que el modo relleno tuviera sentido; (2) los datos que el profesional
repite en toda planilla (nombre, RUT, registro…) se escribían de nuevo en
cada copia.

## Piezas

### 1. Sugerencias con el nombre del formulario

- `render/pdfRender.extractPageTextItems`: capa de texto de la página con
  pdfjs (`getTextContent`) convertida a cajas en RATIOS top-down — misma
  frontera browser-only que ya poseía pdfjs; los escaneos devuelven [].
- `forms/formFieldLabeling.ts` (puro): a cada subrayado detectado se le busca
  la etiqueta impresa a su izquierda en la misma fila (items contiguos se
  unen: "Nombre del" + "paciente:"), se limpia (dos puntos, viñetas,
  guiones bajos) y pasa a ser el NOMBRE de la variable; palabras clave
  infieren el tipo (fecha → date, firma → signature). Los subrayados que ya
  tienen texto encima (texto subrayado, no espacio) se descartan.
- `usePdfTextEditorFormSuggestions` etiqueta sólo páginas `kind: 'pdf'` con
  capa de texto; el resto conserva el flujo genérico. El status reporta
  "N casilleros sugeridos (M con nombre del formulario)". La unicidad de
  nombres la sigue garantizando `uniqueFieldName` al insertar.

### 2. Perfil propio «Mis datos» (modo relleno)

- `fill/pdfTemplateProfile.ts`: pares nombre→valor en localStorage POR
  USUARIO (`trama:pdf-studio:fill-profile:{userKey}`), validación al cargar,
  topes de tamaño; `profileAsFillValues` filtra pares incompletos.
- `PdfTemplateFillProfileSection` (autocontenida, plegable) en el panel de
  variables: filas nombre/valor con sugerencias (Nombre profesional, RUT,
  N° de registro…), «Aplicar a esta copia» reutiliza el MISMO camino que
  importar datos (`applyDraftFormValues`, matching normalizado por nombre) y
  reporta cuántos campos llenó.
- **Privacidad**: es el perfil de quien llena; la UI advierte explícitamente
  que nunca se guarden datos de pacientes y los valores no salen del
  dispositivo (no viaja con la plantilla ni a la nube).

## Validación

- Focales: etiquetado (4: unión de palabras, tipos date/signature, descarte
  de texto subrayado, límite de distancia), perfil (4: persistencia y
  saneo, pares aplicables, flujo agregar→aplicar→persistir, deshabilitado
  sin pares). Suite completa 4946 pass; typecheck; build; gates completos.
- Navegador (demo): la extracción se validó contra un PDF vectorial generado
  en vivo (pdf-lib) — ratios exactos de "Nombre del paciente:" y "Fecha:";
  el flujo Sugerir corrió sobre la plantilla demo (escaneo sin capa de
  texto) degradando limpio a nombres genéricos, 7 sugerencias sin errores;
  «Mis datos» agregó un dato, lo persistió en localStorage, lo aplicó por
  nombre (casillero recibió el valor) y reportó "1 campo completado".

## Limitaciones conocidas

- Escaneos sin capa de texto siguen con nombres genéricos: conectar el OCR
  existente al etiquetado es el siguiente paso natural de este pack.
- La detección asume páginas sin rotación (igual que la detección de líneas).
