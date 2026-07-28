# Contrato visual: barrer las 19 superficies antes de decidir qué arreglar

## Problema

El gate anti-oclusión encontró tres defectos reales, pero mirando muy poco:

|                            |                        |
| -------------------------- | ---------------------- |
| Vistas del mundo Trama     | 11                     |
| Secciones del mundo Notas  | 8 (123 componentes)    |
| **Superficies totales**    | **19**                 |
| Cubiertas por el gate      | **5**                  |
| Temas (día / noche / vela) | 3, el gate corría en 1 |

Cinco superficies de diecinueve en uno de tres temas: un **9% de la matriz**, con
tres defectos encontrados dentro de ese 9%. La pregunta abierta no era qué
arreglar sino **qué hay en el 91% que nadie miró** — y responderla antes de
comprometerse a un plan es la diferencia entre priorizar y adivinar.

## Piezas / Cambios

- **`e2e/visualContract.ts` (nuevo).** La sonda de oclusión sale de dentro de su
  spec a un módulo compartido, y se le suma una hermana: `findUnreachable`,
  que detecta **contenido recortado sin salida** — la clase que escondía el
  botón "cargar ejemplo" del estado vacío del Grafo y que `CenteredPane`
  arregla. El gate y el barrido usan el mismo código, que es lo que impide que
  midan cosas distintas.
- **`e2e/visual-sweep.spec.ts` (nuevo).** Recorre las 19 superficies en los tres
  temas y **reporta sin fallar**. Opt-in con `VISUAL_SWEEP=1`, igual que
  `PDF_STUDIO_VISUAL`: un test que nunca falla no debe correr en cada PR.
  Los temas se conmutan en la página (son clases sobre `<html>`), así que son 19
  cargas y no 57.
- **Un test de calibración que sí bloquea**, sobre la sonda misma.
- **`occlusion.spec.ts`** pasa a importar la sonda compartida; su
  comportamiento no cambia (8/8 antes y después).

## Lo que devolvió el barrido

Primera pasada: **39 hallazgos en 7 de 19 superficies**, todos de la sonda nueva
— cero oclusiones nuevas, lo que confirma que esa clase está cerrada en toda la
app y no sólo donde el gate miraba.

Pero al triarlos, 36 eran **culpa del instrumento**. Tres exclusiones nuevas los
explican:

1. **`overflow: visible` no recorta nada.** Es la mayoría del ruido: contenedores
   de vista cuyo contenido se sale y sigue pintándose. Incluirlos fue un error
   de concepto, no una decisión de umbral.
2. **`.sr-only` está recortado por diseño** — su caja de 1px es todo el punto de
   la utility.
3. **Un `max-height` inline es un colapso deliberado**: el patrón "preview
   plegado + botón para expandir" de `RecorteCardBody`, que tiene degradado de
   corte y control de expansión. Recorta, pero el usuario tiene salida.

Con ellas: **cero hallazgos en 19 superficies × 3 temas**.

### Inventario completo de puntos ciegos

Las tres de arriba se añadieron calibrando, pero la sonda ya nacía con otras dos.
Como el valor de este pack es saber qué NO ve el instrumento, van las cinco
juntas — y separadas por lo que son:

| exclusión                          | cuándo         | naturaleza                                 |
| ---------------------------------- | -------------- | ------------------------------------------ |
| `overflow` distinto de hidden/clip | calibración    | hecho de CSS                               |
| `.sr-only`                         | calibración    | hecho de diseño                            |
| `max-height` inline                | calibración    | **heurística**                             |
| `clientHeight === 0`               | diseño inicial | hecho estructural: sin caja no hay recorte |
| contenedor con `svg[aria-label]`   | diseño inicial | **heurística**                             |

**Dos son heurísticas y pueden esconder un defecto real:**

- un `max-height` inline sin forma de expandir no se vería;
- cualquier texto recortado dentro de un contenedor que además albergue un SVG
  etiquetado tampoco. Esa regla existe porque el lienzo del Grafo desborda a
  propósito —se navega con pan/zoom, no con scroll— pero es más ancha de lo
  necesario.

Las otras tres no admiten discusión.

## Decisiones

- **Informe antes que gate.** Convertir el barrido en bloqueante de golpe
  obligaba a una de dos cosas malas: romper el CI hasta arreglarlo todo, o meter
  excepciones para tapar lo que saliera. El camino es leer, arreglar por packs y
  **promover cada superficie al gate cuando esté limpia**.
- **Calibrar el instrumento cuenta como hallazgo.** El resultado útil de esta
  fase no fue una lista de bugs: fue descubrir que la sonda nueva tenía un 92%
  de falsos positivos. Un informe con 39 entradas ruidosas habría costado más
  que no tenerlo.
- **Un test que impide calibrar hasta el silencio.** Bajar de 39 a 0 ajustando
  reglas es, literalmente, cómo se construye un gate inútil. Por eso la sonda
  tiene ahora un caso positivo sintético que debe detectar y un control negativo
  que no. Si alguien la afina de más, ese test cae.
- **El inventario de puntos ciegos va completo, no sólo lo que toqué hoy.** La
  primera versión de este documento listaba tres exclusiones —las de la
  calibración— y se dejaba fuera las dos con las que la sonda ya nacía. Contar 3
  de 5 es precisamente lo que este pack dice combatir: si el valor está en saber
  qué NO ve el instrumento, el registro tiene que coincidir con el código. Van
  las cinco, y marcadas las **dos que son heurísticas** y podrían tapar un
  defecto real.

### Lo que a propósito NO se tocó

- **Ningún componente.** Este pack no arregla nada de la app porque, tras
  calibrar, no había nada que arreglar. Añade instrumento y evidencia.
- **El barrido no entra en el CI.** Corre a mano cuando se quiera un mapa. Si
  más adelante se quiere continuo, el paso natural es promover superficies al
  gate de `occlusion.spec.ts`, no volver bloqueante un informe.
- **Un solo viewport en el barrido** (1280×720). El gate ya cubre tres viewports
  sobre las superficies críticas; aquí el objetivo era anchura, no profundidad.

## Validación

- `npm run e2e:visual-sweep`: 19 superficies × 3 temas, **sin hallazgos**.
- Test de calibración de la sonda: detecta el positivo sintético, ignora el
  control con scroll.
- `occlusion.spec.ts`: 8/8, idéntico antes y después de extraer la sonda.
- `typecheck`, `lint`, `format:check`.
- Gates: `knip`, `script-registry`, `docs-drift`, `architecture`,
  `frontend-boundaries`, `structure-ratchets`.
