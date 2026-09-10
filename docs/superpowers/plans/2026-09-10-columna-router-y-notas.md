# La columna de las vistas pasa a Page, y la medición destapa tres defectos

## Problema

El PR #453 dejó `Page` con Imprenta de piloto y cuatro columnas PENDIENTES en
el trinquete: `ViewRouter` (las once vistas del mundo Trama), `NotasWorld`
(las siete secciones de Notas) y sus dos esqueletos.

Migrarlas a mano habría roto tres cosas sin que ningún test lo viera. Y medir
antes de tocar nada destapó otras tres que ya estaban rotas.

## Lo que ya estaba roto (medido antes de tocar nada)

1. **El scroller de Notas se salía de la pantalla.** En las seis secciones,
   `#main-scroll` terminaba en y=943 y `<main>` en y=900: los últimos 43 px
   quedaban fuera de lo visible. La barra superior es hermana del scroller
   dentro de un padre de bloque, y el scroller era `h-full`, así que medía el
   alto entero empezando 43 px más abajo. Lo disimulaba el padding inferior.
2. **El esqueleto de Notas saltaba al cargar.** `SectionSkeleton` declaraba
   su propia columna, y dos de sus tres usos viven DENTRO de la columna de
   Notas, así que el padding se duplicaba. Medido en Biblioteca: el esqueleto
   arrancaba 32 px a la derecha y 40 px más abajo que el contenido que lo
   reemplaza. (La primera sonda dio un «salto cero» falso: midió dos veces el
   esqueleto, y encima el `span` de solo lectores de pantalla.)
3. **Cuatro márgenes muertos.** `-my-2` dos veces en `HomeView` y `mt-16` dos
   veces en `CronicasSection`, anulados por el `space-y-12` que los contiene
   (margen calculado: 48 px). Y el comentario de `HomeView` decía que el ritmo
   era `--space-8` (66 px) mientras la clase ponía 48.

## Lo que habría roto una migración mecánica

1. **El colapso de márgenes.** `Page` era siempre flex, y en un contenedor
   flex los márgenes verticales de los hijos no colapsan. La columna del
   router es un bloque, y en Cronología y Atlas el encabezado (`mb` 24) y el
   contenido (`mt` 32) colapsan a 32 px: en flex habrían pasado a 56. Ahora
   `Page` solo es flex cuando reparte ritmo o alto.
2. **El padding inferior de Notas.** La columna tenía `pb-24` y `md:py-10` a
   la vez. Compilando esas clases con el Tailwind del repo: `pb-24` gana en
   móvil (96 px) y `md:py-10` en escritorio (40 px). Un `paddingBottom="6rem"`
   habría añadido 56 px de aire en escritorio. `Page` acepta
   `paddingBottom={null}` para no poner estilo en línea y dejar que decidan
   las clases.
3. **El `data-testid="notas-world-content"`**, del que dependen un test
   unitario y un e2e. `Page` acepta `testId`.

## Cambios

- `Page`: flex solo si hace falta; `paddingBottom={null}`; `testId`.
- `ViewRouter`, `NotasWorld` y `HomeSkeleton` montan `Page`.
- `NotasWorld`: el padre pasa a `flex flex-col` y el scroller a
  `min-h-0 flex-1`.
- `SectionSkeleton` deja de declarar columna; su único uso fuera de la de
  Notas, el de Imprenta, la recibe de quien lo monta.
- Fuera los cuatro márgenes muertos y el comentario que mentía.
- `check:page-shell`: la lista de pendientes queda vacía.
- `e2e/notas-scroller-recorte.spec.ts`: el scroller de Notas cabe en `<main>`,
  en escritorio y en móvil. happy-dom no calcula layout, así que solo un e2e
  puede vigilarlo.

## Decisiones

- **El router va con `rhythm="none"`.** Sus vistas son fragmentos que se
  espacian con márgenes propios; imponer un `gap` cambiaría el espaciado de
  las once a la vez. El ritmo por vista se migra aparte, midiendo cada una.
- **El único cambio visual deliberado es arriba: de 40 a 44 px**, que es
  `--space-6`, entrar en la escala. En móvil queda en 33 por la compresión que
  ya aplica `index.css`.
- **No se tocó el espacio muerto de las listas cortas**: 443 px en Cronología,
  283 en Atlas, 281 en Momentos, 402 en Claves. Corrige una afirmación mía
  anterior, que ponía Cronología «casi tan mal como Imprenta»: no es el mismo
  defecto. Imprenta era una tarjeta anclada arriba en un espacio de trabajo a
  pantalla completa; éstas son listas cortas en documentos que scrollean.
  Estirar una lista no lo arregla. Es trabajo del PR de estados vacíos.

## Validación

Antes y después, a 1440×900 salvo donde se indica:

- **Huecos entre bloques idénticos** en las seis vistas de Trama y las seis
  secciones de Notas. Inicio sigue en 48 ×7: los `-my-2` eran código muerto.
- **La columna sigue siendo un bloque**, y el colapso de Cronología y Atlas
  sigue en 32 px.
- **Virtualizador de Entidades y Citas intacto**: mismas filas, +4 px arriba,
  y al fondo del scroll la primera y la última fila en el mismo sitio.
- **Recorte del scroller de Notas: 43 → 0 px** en las seis secciones, y 0 en
  móvil.
- **Padding inferior de Notas exacto**: 40 px en escritorio y 96 en móvil.
- **Salto del esqueleto de Biblioteca: 32/40 px → 0/0.** Los 12 y 8 px que
  quedan de caja a caja son el área de hover intencional del encabezado
  (`-mx-3 -my-2`), no un salto.
- El `scrollHeight` de Inicio subió 70 px entre las dos medidas, no 4. No es
  la composición: `pickFeaturedQuote` elige la cita con `Math.random()`, así
  que el alto de Inicio cambia en cada carga, y los huecos idénticos descartan
  que venga del espaciado.
- `check:page-shell`: 4 adoptados, 10 exentos, 0 pendientes.
- Suite unitaria completa (5 516 tests), `typecheck`, `lint`, `format:check`
  y todos los gates que corren sin Postgres, en verde.
- Build, presupuesto de bundle (carga inicial 194 KB de 210), grafo de
  chunks sin ciclos, carga perezosa de PDF y humo del bundle de producción,
  en verde.
- E2E afectados en verde: oclusión (tres viewports), Recortes → Imprenta
  (usa `notas-world-content`), Inicio en demo y Momentos → Imprenta.
- **El guardia del recorte falló primero sobre el código CORRECTO.** Medía
  con `getBoundingClientRect` a los ~600 ms, y la animación de entrada de la
  sección todavía desplazaba al padre 2,8 px (8 px en móvil) con `transform`.
  Una serie de muestras lo confirmó: el alto del scroller era constante y
  los bordes coincidían en cuanto terminaba la animación. Ahora mide con
  geometría de layout, que no ve transforms.
- **Mutaciones: las tres caen.** Volver a la cadena `h-full` tumba el guardia
  por los 43 px exactos: «el scroller termina en 943 px y `<main>` mide 900»
  en escritorio, y 830 frente a 787 en móvil. Con la primera versión del
  guardia esta mutación no probaba nada, porque fallaba en los dos estados.
  Hacer `Page` siempre flex tumba la sonda de bloque, e ignorar
  `paddingBottom={null}` tumba la suya. El árbol quedó idéntico tras cada una.

## Pendiente

- La barra de selección de Notas (`NotasImprentaSelectionBar`, que es
  `fixed bottom-6`) probablemente tapa la última fila en escritorio cuando
  hay una selección activa: el cierre de la columna ahí es de 40 px. Todo
  apunta a que el `pb-24` existía para dejarle sitio y el `md:py-10` lo
  anulaba sin querer. Es hipótesis: medirlo con una selección activa y, si
  se confirma, reservar su alto como hace el AskBar con `--askbar-h`.
- Pasar el ritmo de Inicio (`space-y-12`, 48 px) a la escala. Con los márgenes
  muertos ya borrados, pasar a `gap` no resucita nada, pero hay que medir el
  vector de huecos de cada sección.
- El espacio muerto bajo las listas cortas (Cronología, Atlas, Momentos,
  Claves) y su cierre: ninguna de las tres vistas de lista lo marca con el
  `EndMark` que sí usan Entidades y Citas.
- `scripts/pendientes.mjs` solo acepta como continuación de un ítem las
  líneas con sangría, pero Markdown también admite continuaciones sin
  sangría. Pasó en esta misma nota: Prettier dejó sin sangría una línea que
  partía un código en línea, y el registro truncó el pendiente en silencio.
  Lo delató `format:check` solo porque el trozo perdido llevaba un acento
  grave; sin él no lo habría visto nadie. No hay más casos en el repo
  (recorrido completo), pero el generador debería tratar esas líneas como
  continuación, con su test.
