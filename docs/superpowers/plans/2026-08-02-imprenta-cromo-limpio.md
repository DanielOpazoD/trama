# Imprenta: el cromo deja de ocupar el doble que el documento

## Problema

Medido en el navegador con un documento de 4 páginas a 1440×900: **321 px de
cromo** antes del primer contenido, y el contenido medía **152 px**. Tres barras
horizontales apiladas, 19 controles persistentes (10 con texto) y la cuenta de
páginas repetida **tres veces simultáneamente**, a 300 px de distancia de sí
misma.

## Piezas

**`PdfStudioOperationalStatus`**. Devuelve `null` salvo que tenga algo accionable.

**`BulkBar`**. Flotante y contextual: solo existe con hojas marcadas.

**`PdfStudioDocumentToolbar`**. No se pinta con el documento vacío y sin
historial.

## Decisiones

**Un aviso se gana su sitio solo si cambia lo que harías.** El modelo de
autoguardado ya traía un `tone` (`neutral` | `working` | `safe` | `restored` |
`risk`) que nadie estaba aprovechando: se dicen `risk` —puedes perder el
trabajo— y `restored` —apareció contenido que no trajiste, conviene saber de
dónde salió—; `saving`/`saved`/`idle` callan, porque que un guardado automático
funcione es lo esperado, no una noticia. Del preflight se dicen bloqueos y
advertencias; `info` queda fuera por ser observación sin acción.

**La barra de hojas se vuelve contextual, no se recorta.** Ocultar acciones
suele empeorar el descubrimiento, pero aquí no se pierde ninguna: el tick de
cada miniatura está siempre visible y ⌘A ya seleccionaba todo (documentado en la
ayuda de atajos). Lo que se quita es la franja permanente con seis acciones en
gris.

**El alcance va en el rótulo, no en el verbo.** «Guardar PDF» y «Exportar» eran
dos verbos distintos para la misma acción con distinto alcance. Ahora la barra
contextual dice «Guardar 2 hojas».

**Los dos «Rotar» pasan a iconos.** La dirección solo vivía en el `aria-label`:
la información existía y se le escondía justo a quien mira la pantalla.

**La excepción del historial se conserva.** Con el documento vacío la barra
desaparece, salvo que haya algo que deshacer: si el vacío viene de borrar las
páginas o de deshacer la importación, esos botones son el camino de vuelta y
ocultarlos dejaría el trabajo irrecuperable. Ese razonamiento ya estaba
documentado en el código y se respeta.

## Lo que NO se tocó

El panel de **Ajustes** se queda como está: sus tres secciones —Encabezado y
pie / Al importar / Al exportar— agrupan por _momento del flujo_, no por tipo de
control. Es la mejor pieza del módulo.

El **estado vacío** conserva su titular en serif cursiva. Tiene voz y no se
parece a nada genérico.

## Validación

- Suite completa: **5272 pasan**, 17 skipped, 0 fallan.
- Seis tests defendían lo que se quita; se reescribieron para defender lo
  contrario, incluido el e2e `imprenta-barra`. **Verificado por mutación**:
  devolver el resumen incondicional rompe uno, volver la barra permanente rompe
  otro, y un control que cambia algo irrelevante deja los 63 en verde.
- Los 38 `check:*`; rojos solo los 4 que exigen Postgres. Typecheck, lint,
  formato, build y budget.
- **En el navegador**, medido antes y después: 321 px → 177 px de cromo, 19 → 10
  controles, 10 → 4 rótulos, la cuenta una vez. Verificados el estado vacío, el
  cargado y la aparición/desaparición de la barra contextual.

## Pendiente: la barra del editor

Auditada pero **no** incluida aquí. Ya está bien factorizada (ocho ficheros,
`EditorToolbar.tsx` en 150 líneas, primitivas compartidas) y es icónica y
compacta. Su defecto real es otro: la barra es `flex-nowrap overflow-x-auto`, así
que **en móvil el zoom y las acciones de objeto quedan fuera de pantalla** tras
un scroll horizontal que no se anuncia — y el zoom es de lo más usado en un
editor de PDF en pantalla pequeña.

Ojo al abordarlo: hay **snapshots visuales de Playwright** que fijan esa barra
(`pdf-studio-toolbar-macbook-air`, `pdf-studio-toolbar-mobile`), y refrescarlos
tiene trampa conocida — la tolerancia esconde derivas y `--update-snapshots` se
niega a refrescar lo que «pasa».
