# Motion Calm Pack — la página se asienta, no aparece

## Problema

Trama «teleportaba»: cambiar de sección era un fade plano de 180ms sin
movimiento ni fase de salida, y las secciones lazy (Notas, Claves,
Biblioteca, Imprenta/Planillas) mostraban un spinner genérico
(`LoadingHint`) que no se parece en nada al contenido que llega. Los
primitivos buenos ya existían (startViewTransition, FeedSkeleton,
HomeSkeleton, EmptyMessage editorial) pero estaban subutilizados.

## Piezas

- **Entrada de sección con vida**: `view-fade` pasa de opacidad plana a
  fade + rise de 8px con la curva de la casa (ease-out-quart, 220ms).
  Ambos mundos la heredan sin tocar JS (`key={section}` +
  `animate-view-fade` ya existían); `prefers-reduced-motion` la apaga por
  completo.
- **`SectionSkeleton` (nuevo)**: esqueleto genérico de sección — hero
  compacto (eyebrow + título) y siluetas con el shimmer «papel manchado»
  de FeedSkeleton/HomeSkeleton. Dos variantes: `cards` (Claves) y `grid`
  de portadas 3:4 (Biblioteca, Imprenta/Planillas).
- **Spinners fuera del mundo Notas**: los 4 fallbacks de Suspense pasan a
  esqueletos — el feed usa el `FeedSkeleton` que ya tenía para su carga
  interna; ahora también cubre la carga del chunk.

### Segunda tanda — micro-movimiento (más ambición)

- **Stagger de entrada en listas**: `.stagger-children` escalona la
  entrada de los hijos directos (fade + rise, 45ms entre cada uno, tope a
  los primeros ~8 con `:nth-child`). Aplicado a la lista de Prompts
  (cards con `space-y-3`). La animación corre una vez al montar cada hijo,
  así que cambiar de filtro solo anima lo NUEVO. Reduce-motion la apaga.
- **Micro-lift al hover en cards**: `.card-hover-lift` eleva la tarjeta
  1px con una sombra suave (160ms) — el tacto premium de «esto es
  interactivo». En NoteCard y PromptCard (caras de lectura, no edición).
  Solo con `hover: hover`; reduce-motion conserva la sombra y quita el
  movimiento.
- **Toast entra y SALE con gracia + fix de centrado**: el toast salía en
  seco (se desmontaba). Ahora `ToastHost` lo mantiene ~200ms para animar
  la salida (`animate-toast-out`). De paso corrige un bug real: el
  `animate-fade-up` vivía en el MISMO nodo que `-translate-x-1/2`, y su
  `transform: translateY` pisaba el translateX — el toast quedaba
  descentrado media anchura (medido: **200px** de offset con un toast de
  400px). El fix separa el centrado (contenedor) de la animación (hijo):
  offset **0px**. Las animaciones van solo opacity + translateY.

## Decisiones

- No se agregó coreografía extra vía View Transitions API a las
  secciones: `useClampedSection` ya envuelve el cambio en
  `startViewTransition` y sumar una capa nombrada duplicaría el motion.
  La mejora vive en la animación CSS que ya disparaba el `key`.
- El esqueleto anuncia `role="status"` + «Cargando…» sr-only (hallazgo de
  CodeRabbit: el LoadingHint anterior sí exponía texto a lectores); las
  siluetas visuales quedan en un subárbol `aria-hidden`. FeedSkeleton
  recibió el mismo tratamiento por consistencia.

## Validación

- Suite completa 4963 pass (2 nuevos de SectionSkeleton), lint, prettier,
  gates (8), build y **budget de bundle** (lección del PR #345: correr
  `check-bundle-size.mjs` tras el build — todos los chunks dentro).
- E2e de navegación de secciones (deeplinks, mobile-demo, capture): 7/7.
- Navegador: la entrada de sección computa `view-fade 220ms
cubic-bezier(0.25,1,0.5,1)`. Los esqueletos solo se ven en cargas
  frías (en dev el chunk resuelve instantáneo); su render está cubierto
  por tests unitarios — la verificación visual del shimmer en producción
  queda pendiente del primer deploy.
