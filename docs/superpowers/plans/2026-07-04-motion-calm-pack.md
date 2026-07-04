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

## Decisiones

- No se agregó coreografía extra vía View Transitions API a las
  secciones: `useClampedSection` ya envuelve el cambio en
  `startViewTransition` y sumar una capa nombrada duplicaría el motion.
  La mejora vive en la animación CSS que ya disparaba el `key`.
- El esqueleto es `aria-hidden`: los lectores anuncian la sección por el
  h1 del top bar, no el placeholder.

## Validación

- Suite completa 4963 pass (2 nuevos de SectionSkeleton), lint, prettier,
  gates (8), build y **budget de bundle** (lección del PR #345: correr
  `check-bundle-size.mjs` tras el build — todos los chunks dentro).
- E2e de navegación de secciones (deeplinks, mobile-demo, capture): 7/7.
- Navegador: la entrada de sección computa `view-fade 220ms
cubic-bezier(0.25,1,0.5,1)`; los esqueletos solo brillan en cargas
  frías (en dev el chunk resuelve instantáneo — cubierto por tests).
