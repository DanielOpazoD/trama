# Un carril que dice que sigue

## Cómo apareció

El barrido del contrato visual del PR #361 —19 superficies × 3 temas— nunca se
había cosechado. Al correrlo salió limpio, y esa limpieza resultó ser el primer
hallazgo: **sólo corre a 1280×720**. Los cuatro defectos reales de esta serie
aparecieron todos en anchos móviles.

Forzado a 375px pasó de 0 a 12 hallazgos. Verificados uno por uno, los 12 eran
ruido de la sonda:

| hallazgo                            | veredicto                                                             |
| ----------------------------------- | --------------------------------------------------------------------- |
| Entidades ×6 — «23px recortados»    | `line-clamp-1`: truncación deliberada, con elipsis y vista de detalle |
| Notas/tareas ×3 — botón 100% tapado | lo tapa el control de **modo demo**, chrome del arnés                 |
| Notas/inicio ×3 — «92% ocluido»     | el «ocluidor» es el propio elemento, fuera del viewport               |

El defecto real no lo encontró ninguna herramienta: estaba en una captura. La
barra de navegación decía `Tare`.

## Problema

`NotasMobileTabs` a 375px, medido:

```text
8 secciones · contenido 776px · visible 232px
→ 544px ocultos, sólo el 30% a la vista
→ scrollLeft: 0, con la sección ACTIVA cortada 27px a media palabra
→ mask: none · ::after: none · sin degradado, sin flecha
→ scrollbar-width: thin, pero en macOS sólo aparece mientras arrastras
```

Cinco de las ocho secciones del mundo Notas —Prompts, Claves, Imprenta,
Planillas, Biblioteca— **no existían para el usuario**, sin nada que insinuara
lo contrario. Y la app te llevaba a Tareas sin molestarse en traerla a la vista.

**Por qué se escapó de todo.** Ninguno de los 36 gates modela esto. Y el gate
anti-oclusión lo aprueba **con razón**: el contenido _es_ alcanzable con scroll
horizontal, así que `findUnreachable` no tiene nada que decir. Es un fallo de
**descubribilidad**, no de alcanzabilidad — una categoría que no estaba
representada en ninguna parte.

## Cambios

- **`src/hooks/useScrollRail.ts`** — mide qué lado tiene contenido por recorrer
  y reencuadra el elemento activo. Escucha `scroll`, y un `ResizeObserver` sobre
  el contenedor **y sus hijos**: el contenedor no avisa cuando cambia el ancho
  del contenido, y eso se mueve al cargar las tipografías.
- **`.scroll-rail` en `index.css`** — el borde se deshace hacia donde queda
  contenido, y `scroll-margin-inline` reserva ese mismo hueco.
- **`NotasWorldChrome.tsx`** — el carril de secciones lo usa.

## Decisiones

**Máscara, no degradado superpuesto.** Un overlay taparía los botones del borde
— justo la familia de defectos que este proyecto lleva varios PRs cazando. La
máscara no puede ocluir nada, y hay un test que lo fija.

**El desvanecido sólo del lado que tiene contenido.** Si estuviera siempre, no
diría nada. Que su ausencia también signifique —ese lado se acabó— es la mitad
del mensaje.

**Una variable gobierna las dos cosas.** `scrollIntoView` pega el elemento al
borde, que es exactamente donde está el desvanecido: la sección activa
aterrizaba medio disuelta. `scroll-margin-inline: var(--rail-fade)` reserva el
hueco con la misma medida, así que no pueden desincronizarse. Se descubrió
porque el primer test dejó 3px de recorte.

**Sin `smooth`.** Es una corrección de encuadre, no una animación; así no hay
nada que exceptuar bajo `prefers-reduced-motion`.

**Nada de copy.** Un «desliza» sería texto resolviendo lo que debe resolver el
diseño.

## Lo que quedó fuera, y por qué

**`SettingsNav.tsx` usa el mismo patrón y no se pudo medir**: abrir
Configuración en modo demo **tumba la app entera**. Es un defecto preexistente y
ajeno a esta rama — `buildLegacyCutoverChecklist` en `healthPanelModel.ts`
desreferencia `data.auth.clerkConfigured` y en demo esa respuesta no trae `auth`.
Queda reportado aparte; no se toca aquí para no mezclar dos problemas sin
relación.

**No se calibró la sonda para `line-clamp`.** Hasta que distinga la truncación
deliberada de la accidental, el barrido a móvil generaría ruido, y un informe
ruidoso se ignora — peor que no tenerlo.

**La distancia entre `mañana` y `atardecer`** (del PR anterior) sigue sin
tocarse, por lo mismo de siempre: no coexisten en pantalla.

## Validación

Los tres e2e verificados **en rojo** por mutación, y cada uno cae con la suya y
sólo con la suya:

| mutación                                          | qué falla                     |
| ------------------------------------------------- | ----------------------------- |
| sin reencuadre (el estado original, scrollLeft 0) | sólo «la activa llega entera» |
| el hint siempre encendido                         | sólo «el borde se desvanece»  |
| degradado superpuesto en vez de máscara           | sólo «no intercepta el clic»  |

Los unitarios igual: quitar la tolerancia subpíxel tumba el test del resto
subpíxel; no soltar el listener tumba el de la fuga.

Y una comprobación que el atributo no cubre: **si la banda del desvanecido cae
en un hueco entre botones, no se ve nada**. Medido en seis posiciones de scroll,
la banda de 20px siempre tiene entre 16 y 20px cubiertos por contenido — nunca
es invisible.

Medido en el navegador tras el cambio: `scrollLeft` 0 → 44, la sección activa
recortada 27px → **0px**, y los dos bordes anunciando correctamente.

Resto: suite completa (5046 tests), `typecheck`, `lint`, `format:check`, catorce
gates (`design-tokens`, `focus-ring`, `icon-button`, `form-control-labels`,
`frontend-boundaries`, `structure-ratchets`, `modal-overlay`, `knip`,
`dead-code`, `script-registry`, `mock-completeness`), `build`, budget de bundle,
y 26 e2e incluidos a11y, deep links de Notas, notas-mobile-demo y el gate
anti-oclusión completo.

## Nota de método

Mover `scrollLeft` desde el panel de depuración del navegador **no dispara el
evento `scroll`** — ni siquiera a un listener registrado ahí mismo. El carril se
queda mostrando su estado inicial y todo parece correcto. Costó un diagnóstico
en falso; hay que medirlo con Playwright, que evalúa en el mundo principal.
