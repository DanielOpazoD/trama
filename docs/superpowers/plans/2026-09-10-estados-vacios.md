# Estados vacíos que enseñan: cada vacío ofrece una salida real

## Problema

La crítica que abrió este trabajo: el vacío de Imprenta tiene la mejor prosa de
la aplicación y ofrece solo un selector de archivos, mientras las plantillas, la
Biblioteca y los PDF guardados están a un clic. La app no conoce sus propias
capacidades.

Antes de tocar nada hacía falta saber cuántos vacíos eran así, y no había forma
de saberlo: los estados vacíos están repartidos por decenas de vistas y ninguno
declara si lleva a alguna parte.

## Lo que ya estaba roto (medido antes de tocar nada)

1. **Once vacíos sin salida.** Un gate nuevo, `check:empty-states`, recorre
   todos los `EmptyMessage`, `EmptyState` y `MomentosEmptyState` del repo (27) y
   separa los que ofrecen una salida de los que no. Once no la ofrecían: remitían
   a otro lugar con un texto («desde el composer de arriba», «Configuración → X
   (Twitter)») sin llevar ahí. Eran Cronología, X, Favoritos, el álbum y la línea
   de Momentos, Prompts, la galería de Capturas, Sugerencias, Vínculos,
   Biblioteca y el feed de Notas.
2. **Biblioteca decía «No se encontraron archivos» a quien no había subido
   ninguno.** El mismo mensaje servía para la búsqueda sin resultados y para la
   biblioteca estrenada, y ninguno de los dos casos ofrecía qué hacer.
3. **Un fallo de carga del feed de Notas se pintaba como un vacío.** Si la
   consulta fallaba, la vista usaba el componente de los vacíos, con su
   ilustración, y pedía «Vuelve a intentarlo en unos segundos» sin ofrecer un
   botón para hacerlo.
4. **El test «drena» de NotasWorld (#436) montaba el estudio de Imprenta real
   pese al mock.** Instrumentando el cargador perezoso: al drenar archivos, la
   precarga y el montaje piden el módulo en el mismo tick, y vitest entregó el
   mock al primero y el módulo REAL al segundo, que es el que se montó. El test
   pasaba solo porque el estudio real pinta el título, y dejaba el `lazy`
   resuelto con el módulo real para los tests siguientes del archivo. Lo destapó
   el test nuevo de los caminos de Imprenta, que fallaba solo en la corrida
   completa.

## Cambios

- **`check:empty-states`**, en CI: todo vacío ofrece una salida o se admite con
  motivo en el propio gate. Termina con 27 vacíos y 0 admitidos.
- **`<EmptyAction>`** (en `EmptyMessage.tsx`): la salida principal de un vacío,
  sobre `Button`. Todas las salidas nuevas la usan, y migran las dos que ya
  existían (feed e Inicio de Notas). El alias legacy de la escala tipográfica
  baja de 403 a 402; con los botones escritos a mano habría subido a 418.
- **Una salida por vacío:**
  - Feed de Notas: el fallo de carga pasa a `ErrorState`, con reintentar.
  - Sugerencias: «Pedir una ronda». Vínculos: «Ir a las entidades».
  - Momentos: «Escribir la primera entrada» abre el compositor, y en el álbum
    «Subir la primera foto» lo abre en Foto (el compositor pasa a controlado).
  - Prompts: «Escribir el primero» lleva el foco al título.
  - Biblioteca: estrenada, «Subir archivos»; con filtros, «Limpiar filtros»; la
    papelera vacía no ofrece nada.
  - Galería de Capturas: con filtro, «Limpiar filtros»; sin él, «Volver a la
    lista».
  - Cronología: «Guardar una cita» y «Crear un momento».
  - X: «Conectar X» abre Configuración directamente en su panel.
  - Favoritos: «Configurar la extensión» abre Configuración en «Extensión».
  - Imprenta: bajo la zona de arrastre, retomar el último PDF guardado, ver los
    guardados, traer desde la Biblioteca o desde las notas, y rellenar (o crear)
    una planilla; además nombra «Fotos a Imprenta» de Momentos. En Planillas,
    reabrir las planillas guardadas.
- **Configuración se abre en una sección**: `useAppModals` guarda la sección
  pedida y la olvida al cerrar. El mundo Notas hace lo mismo con su instancia.
- **Lo que pedían los trinquetes estructurales**: las acciones por ítem del feed
  pasan a `useNotasFeedItemActions` (NotasFeedView baja de 428 a 402 líneas con
  el cableado nuevo incluido), y `PdfStudioView` agrupa los resultados de OCR y
  de ajustes del documento como ya hacía con `workspace` (de 364 a 356).
- **NotasWorld comparte una sola importación en vuelo** del estudio de Imprenta
  entre la precarga y el `lazy`.
- El mapa de arquitectura, regenerado: sus estadísticas se habían quedado viejas
  (specs e2e, de 30 a 37).

## Decisiones

- **La salida la decide quien sabe adónde lleva.** `TwitterView` pide la sección
  `x` y `FavoritosPanel` la sección `extension`; el shell solo sabe abrir
  Configuración en una sección. Con props explícitas y no con un contexto: el
  repo reserva los contextos para servicios globales (toasts, modo sin conexión).
- **`EmptyAction` es composición, no primitivo.** Impone su aspecto a propósito,
  para que todos los vacíos se lean igual; las salidas secundarias van en
  `Button` con variante `quiet`, para no competir con la principal. Queda
  documentado en `docs/conventions/design.md`.
- **Los caminos de Imprenta van al lado de la zona de arrastre, no dentro**: la
  zona entera es un `<button>`, y un botón dentro de otro es HTML inválido.
- **«Ver los guardados» solo con el panel plegado.** Con guardados, el panel se
  abre solo al cargar, y ofrecer abrirlo sobraba. Lo destapó el test de
  cableado, que suponía lo contrario.
- **Configuración olvida la sección al cerrarse**: abrirla después desde la
  barra lateral no debe caer en la sección que pidió un vacío.
- **La carrera se arregla en el cargador, no en el test.** Precalentar el módulo
  simulado antes de montar no la evita (medido: el segundo `import()` siguió
  recibiendo el real). Una sola promesa compartida sí, y en el navegador es
  equivalente, porque el mapa de módulos ya unifica las dos importaciones. Si la
  importación falla, se olvida para que el próximo intento la vuelva a pedir.

## Validación

- `check:empty-states`: 27 vacíos y 0 sin salida (primera corrida: 11).
- Cada salida tiene su test en el componente y otro en el cableado que la lleva
  a destino: App, ViewRouter, ShellOverlays y `useAppModals` para Configuración;
  NotasWorld y NotasFeedView en el mundo Notas; `PdfStudioView` con guardados
  reales para Imprenta.
- **E2E nuevos, con el cableado real**: `imprenta-vacio-caminos` (en demo,
  Imprenta lleva a Biblioteca, a Notas y a Planillas) y `vacios-salidas` (sin
  demo: X desconectada abre Configuración en su panel, y Cronología vacía lleva
  a Citas).
- E2E afectados en verde: accesibilidad de todas las secciones de Notas y de
  todas las vistas de Trama, Momentos, notas, recortes, las tres de Imprenta,
  enlaces de Notas, recorte del scroller, Momentos → Imprenta y Recortes →
  Imprenta.
- **Mutaciones: 29 sondas, las 29 caen**, cada una en el test pensado para
  ella. Entre las más informativas: quitar el cableado de App a ViewRouter y a
  X, o de NotasWorld a Imprenta; retomar el guardado más viejo; ofrecer abrir el
  panel cuando ya está abierto; y quitar la importación compartida de
  NotasWorld, que hace volver la carrera y tumba el test de los caminos.
- Suite completa (5 562 tests en 809 archivos), `typecheck`, `lint`,
  `format:check` y los 37 gates requeridos que corren sin Postgres, en verde.
- Build, presupuesto de bundle, grafo de chunks sin ciclos, carga perezosa de
  PDF y humo del bundle de producción, en verde.

## Pendiente

- `NotasWorld` precarga Notas, Biblioteca y Claves con un `import()` suelto,
  además del de su `lazy`: el mismo patrón que destapó la carrera con los mocks.
  Hoy no falla, porque la precarga va por hover y el montaje llega después, pero
  conviene un cargador compartido por módulo.
- «Fotos a Imprenta» se nombra en el vacío de Imprenta pero no se ofrece como
  acción: Momentos vive en el otro mundo, y cruzar exige cambiar de mundo y de
  sección desde el shell.
- La salida secundaria de Inicio de Notas («Crear tarea») sigue con un contorno
  escrito a mano: `Button` no tiene variante secundaria con contorno, y `quiet` es
  un rótulo. Decidir la variante y migrarla.
- `check:empty-states` reconoce una salida por texto (`action=`, `hint=`,
  `<button` u `onClick=`), así que no distingue un `hint` que es solo texto de
  uno interactivo.
- `scripts/pendientes.mjs` descarta cualquier ítem que contenga una de sus
  palabras de cierre, aunque no hable de cerrar nada. Pasó en esta misma nota: el
  pendiente del contorno «a mano» llevaba esa palabra y desapareció del registro
  en silencio; solo lo delató contar los ítems. La marca de cierre debería ir al
  principio del ítem, con su test.
