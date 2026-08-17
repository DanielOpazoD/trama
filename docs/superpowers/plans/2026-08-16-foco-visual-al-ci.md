# El gate del anillo de foco existía en el papel

## Problema

`e2e/focus-ring-visual.spec.ts` tenía todo lo que necesita un gate: script en
`package.json` (`e2e:focus-visual`), baselines commiteadas para claro y oscuro, y
hasta una línea en `docs/conventions/design.md` que lo cita como la verificación
visual del sistema de anillos.

No lo corría **ningún workflow**.

La prueba de que eso importa apareció al ejecutarlo por primera vez en meses: la
baseline estaba podrida. El pack #391 subió el botón de herramienta de la barra
del editor de **30×28 a 32×32** —un cambio deliberado, `h-8 min-w-8`— y el
snapshot se quedó con las medidas viejas. Nadie se enteró, porque nadie corría el
gate.

## Corrección del diagnóstico original

El informe que originó este PR decía «pasar los snapshots visuales de opt-in
macOS a gate real en CI». Al ir al código, esa premisa estaba **desactualizada**:

- `pdf-visual.yml` ya corre en cada PR que toca `pdfStudio`, con filtro de rutas,
  sobre macOS. Se arregló tras el incidente #257, donde una deriva vivió seis
  semanas en `main`.
- `pdf-studio-visual.spec.ts` ya tiene snapshot **móvil** de la barra, así que
  tampoco era cierto que todo corriera a un único viewport de escritorio.

Lo único que de verdad no corría era el anillo de foco. Este PR se reduce a eso,
que es lo que faltaba.

## Cambios

- Las dos baselines de foco se refrescan al tamaño real (`48×48` de recorte, que
  es el botón de 32×32 más los 8px de margen que deja entrar el anillo).
- `pdf-visual.yml` gana un paso que corre `e2e:focus-visual`, con `if: always()`
  para que un fallo del snapshot del editor no lo deje sin ejecutar: son dos
  señales distintas y conviene ver las dos.
- El filtro de rutas del workflow incluye ahora el spec de foco y sus snapshots.
- `design.md` deja de afirmar que estos snapshots «no corren en CI».

## Decisiones

- **Se bendice la baseline nueva en vez de tratarla como regresión.** El botón
  mide 32×32 porque `segBtnTool` dice `h-8 min-w-8`: es el diseño deliberado del
  pack #391, no una deriva. Lo podrido era el snapshot.
- **`visual-sweep` NO se convierte en gate.** También corre en ningún sitio, pero
  cuando se forzó a 375px dio 12 hallazgos y los 12 eran ruido. Volver bloqueante
  una herramienta ruidosa entrena a ignorar el rojo, que deja peor que no
  tenerla.
- **Va en el workflow macOS existente y no en uno nuevo.** Comparte runner,
  comparte la barra del editor que captura, y no añade un minuto de CI a los PR
  que no tocan nada visual.

## Validación

- `e2e:focus-visual`: 2 pruebas en verde con las baselines nuevas.
- `e2e:pdf-visual`: 8 pruebas en verde, sin tocar.
- `check:docs-drift` en verde tras corregir `design.md`.

**Verificado por mutación:** subir el botón de herramienta a `h-9 min-w-9` pone
el gate en rojo nombrando el cambio de tamaño (`Expected an image 48px by 48px,
received 52px by 52px`). El gate ve cambios estructurales, no sólo antialiasing.

## Pendiente

- Las baselines se generaron en esta máquina (macOS). Si el runner
  `macos-latest` renderiza distinto, el primer CI lo dirá — y ese desacuerdo
  sería información, no ruido.
- `visual-sweep` sigue sin correr en ningún sitio. Antes de conectarlo hay que
  bajarle el ruido; hoy no está en condiciones de bloquear un merge.
