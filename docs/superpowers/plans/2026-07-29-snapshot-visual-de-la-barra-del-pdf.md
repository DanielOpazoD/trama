# El snapshot visual de la barra del PDF vuelve a decir la verdad

## Problema

`e2e/pdf-studio-visual.spec.ts -g "toolbar mobile"` fallaba en main con el árbol
limpio. Pero el fallo era el síntoma menor: **las siete capturas estaban
obsoletas**, y seis pasaban sólo porque su diff caía bajo la tolerancia.

Medido con `maxDiffPixelRatio: 0` en las siete:

| captura                   | píxeles distintos | ratio  | tolerancia | presupuesto | consumido        |
| ------------------------- | ----------------- | ------ | ---------- | ----------- | ---------------- |
| `toolbar-mobile`          | 266               | 0,0179 | 0,015      | 222 px      | **120 %** → roja |
| `toolbar-macbook-air`     | 427               | 0,0087 | 0,01       | 488 px      | **87 %**         |
| `modal-high-zoom`         | 6802              | 0,0066 | 0,015      | 15 360 px   | 44 %             |
| `text-menu`               | 4092              | 0,0040 | 0,01       | 10 240 px   | 40 %             |
| `modal-selection`         | 3549              | 0,0035 | 0,015      | 15 360 px   | 23 %             |
| `shapes-menu`             | 1544              | 0,0015 | 0,01       | 10 240 px   | 15 %             |
| `modal-grouped-selection` | 455               | 0,0004 | 0,015      | 15 360 px   | 3 %              |

### Quién movió la barra

**#257 «Imprenta Firma y Timbre Studio v1»** (`2f82ae87`, 20-jun-2026). Sumó
`stampAssetMenu` al grupo «Insertar» de `EditorToolbar.tsx` —cuatro líneas— y
tocó 22 archivos, ninguno de ellos una captura. Las capturas siguen firmadas
por #201 (`e74ba416`).

El grupo «Insertar» pasó de 34 px (sólo la cámara) a 80 px (`✒ ▾` de «Firma y
timbre» + cámara). Todo lo que va después se corrió ~45 px. En móvil el ancho
visible de la barra es 330 px, así que ese empujón sacó del cuadro al grupo
«Estilo» (`Aa ●`) — que es lo que se veía como «desapareció el grupo Aa».

Las dos capturas del modal cargan además el tooltip abierto que **#295** («Design
system maduro: primitivo IconButton») empezó a mostrar también al **enfocar**:
tras un `click()` de Playwright el botón queda con foco y hover, y a los 400 ms el
tooltip entra en la captura.

### No es una regresión

El grupo «Aa» + color **no desapareció**. Sigue en el DOM y sigue en la captura
de MacBook Air, ahora corrido 45 px. Probado por tres vías:

1. **Sonda de DOM** en ambos viewports, estable a t+0/300/1500/4000 ms: cinco
   grupos, `Insertar → ["Firma y timbre", "Estampar imagen"]`, `Estilo →
["Texto"]` de 74 px. La barra mide 330 px con `scrollWidth` 607: el grupo está
   fuera del cuadro, no fuera de la app (`flex-nowrap` + `overflow-x-auto`).
2. **Prueba de desplazamiento** sobre la captura de MacBook Air: la zona anterior
   a la inserción (x < 233) y el grupo «Vista» —anclado a la derecha con
   `ml-auto`— son **idénticos píxel a píxel** (0 distintos); el resto encaja
   comparado con un offset de −45 px (155 px residuales de antialiasing sobre
   ~29 800). Es una inserción, no una pérdida.
3. El test unitario que #257 sí escribió (`EditorToolbar.test.tsx:254`, «reserva
   una entrada de menú para firmas y timbres») fija esa entrada dentro de
   «Insertar». La estructura estaba cubierta; lo que quedó sin refrescar fueron
   los píxeles.

### Por qué nadie lo vio

No es que la prueba no corra en CI: **sí corre**, en
`.github/workflows/pdf-visual.yml` sobre `macos-latest`. Pero sólo por
`schedule` (martes) y `workflow_dispatch`. Ningún check de PR la ejecuta, así
que #257 mergeó en verde y la corrida semanal lleva seis semanas roja sin
bloquear nada ni mirarla nadie.

Y aunque hubiera corrido en el PR, la captura de MacBook Air **habría seguido
verde**: 427 px de cambio contra 488 px de presupuesto. La tolerancia era lo
bastante ancha para esconder que un grupo entero aparecía en la barra.

## Cambios

- **`e2e/pdf-studio-visual.spec.ts-snapshots/`** — refrescadas las dos capturas
  del **elemento barra** (`toolbar-mobile`, `toolbar-macbook-air`). Son las que
  el diff explica al 100 % y las únicas en riesgo.
- **`e2e/pdf-studio-visual.spec.ts`** — encabezado que dice por qué la suite es
  opt-in, dónde sí corre, cómo refrescarla (y que el modo por defecto de
  `--update-snapshots` **se niega** a reescribir lo que «pasa»: hace falta
  `=all`). Tolerancias de las dos capturas de barra apretadas: 0,01 → **0,002**
  en MacBook Air (488 → 97 px) y 0,015 → **0,004** en móvil (222 → 59 px).
- **`.github/workflows/pdf-visual.yml`** — nuevo disparador `pull_request` con
  `paths`, para que un PR que toca el editor o las piezas compartidas que dibuja
  la barra se entere en el acto.

## Decisiones

**Refrescar sólo dos de las siete.** Las cinco capturas de página/modal también
están obsoletas, pero su diff arrastra estados que no revisé una a una: el
tooltip por foco de #295 y, en `modal-high-zoom`, un cuadro de texto que aparece
en otra posición bajo zoom sin que haya podido atribuirlo a un commit concreto.
Pasan con 3–44 % de su presupuesto: refrescarlas sería bendecir de una sentada
píxeles que nadie miró, que es exactamente el vicio que este PR corrige. Quedan
documentadas en el spec para quien toque esas pantallas.

**Apretar la tolerancia en vez de sólo refrescar.** Con la captura al día el
diff es 0, pero el presupuesto seguía siendo de 488 px: si mañana alguien quita
«Firma y timbre», el diff vuelve a ser 427 px y la prueba **seguiría verde**.
Verificado por mutación: con `{false ? stampAssetMenu : null}` las dos capturas
se ponen rojas (427 px y 266 px). Sin apretar, la de MacBook Air no lo hacía.

**`pull_request` con `paths` y no en cada PR.** Un runner macOS cuesta ~10× un
ubuntu y el camino crítico del CI está en ~3 min; cobrarlo en cada PR no se
justifica. La lista de `paths` es aproximada a propósito —ninguna adivina todo lo
que mueve un píxel— y por eso la corrida semanal se mantiene como red de
seguridad. Si prefieres no pagar minutos macOS en PR, este es el commit a
descartar: los otros dos se sostienen solos.

**Lo que NO se tocó.** La barra necesita 607 px en un cuadro de 330 px, así que
en móvil el estilo y el zoom viven detrás de scroll horizontal. Eso ya era así
antes de #257 (561 px en 330) y el nombre de la prueba —«conserva una sola fila
operacional»— describe justo esa intención: una fila, con scroll. Rediseñar la
barra en móvil es otra conversación, no un arreglo de snapshot.

## Validación

- `npm run e2e:pdf-visual` → **7/7**.
- Mutación (quitar `stampAssetMenu`) → `toolbar-macbook-air` y `toolbar-mobile`
  rojas; revertida.
- Las dos capturas nuevas son **idénticas píxel a píxel** (0 distintos) a las que
  capturé por separado con una sonda propia antes de refrescar: el render es
  reproducible, no un tiro suelto.
- `node scripts/run-vitest.mjs run` → 5087 pasan, 17 skip (767 archivos).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` y
  `node scripts/check-bundle-size.mjs` en verde.
- **33 de los 37 `check:*`** en verde, incluidos todos los de frontend
  (`design-tokens`, `icon-button`, `focus-ring`, `form-control-labels`,
  `frontend-boundaries`, `structure-ratchets`, `modal-overlay`, `knip`,
  `dead-code`) y `pdf-lazy-entrypoints` tras el build.
- **4 sin correr**: `legacy-identity-schema`, `query-plans`, `whatsapp-schema` y
  `pdf-stamp-assets-schema` piden Postgres en `localhost:5433` y en esta máquina
  no hay Docker. Viven en el job `migrations` del CI, que levanta su propio
  servicio; este PR no toca SQL, migraciones ni esquemas.

Confirmado en CI: el job `pdf-visual` corrió **por `pull_request`** (el
disparador nuevo) en `macos-latest` y pasó, así que ese runner reproduce estos
píxeles con las tolerancias más estrechas. Y `migrations` cubrió los cuatro
gates de Postgres que aquí no se pudieron correr.
