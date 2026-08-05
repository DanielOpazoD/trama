# El revelado de media: fundido + color dominante

## Problema

Cada imagen autenticada aparecía DE GOLPE: caja papel latiendo → blob resuelto
→ pop. Sin fundido, sin anticipación, repetido cientos de veces por sesión en
una app que es, en buena parte, de fotos. La sensación de calidad de las apps
de fotos vive exactamente en cómo _llega_ una imagen a pantalla.

## Diseño

**Fundido (`useMediaReveal`)** — hook compartido con tres fases:
`waiting` (placeholder pintado) → `fading` (la imagen funde 0→1 en 300ms SOBRE
su placeholder) → `done` (se suelta el fondo — importante para object-contain:
un fondo permanente pintaría el letterbox). `motion-reduce:animate-none`
respeta `prefers-reduced-motion`. Aplicado en la capa compartida de Momentos
(imagen, video, thumb) y en los thumbnails de Biblioteca, anexos de Notas y
galería de capturas.

**La decisión técnica que importa — keyframe, NO transition.** La primera
implementación usó `transition-opacity` y quedó **muerta con los tests verdes**:
varios tiles ya traen `transition-transform` (hover-zoom) y dos utilidades de
transition compiten por `transition-property` — la del caller ganaba y el
computed decía `transform 0.3s`. Lo cazó la verificación en navegador (jsdom
afirma clases, no estilos computados). La animación por keyframes
(`animate-media-reveal`) no toca esa propiedad y quedó verificada corriendo en
vivo (`getAnimations()` → `media-reveal` a t=1198ms tras navegar al álbum).

**Color dominante (`extractDominantColor`)** — canvas de 1×1: el navegador
promedia al escalar. Se extrae al subir (fotos del comprimido; clips de su
póster) y viaja como `dominantColor` (#rrggbb, 7 bytes de payload, ningún
blob). El placeholder del tile se pinta de ese tono: el álbum aparece como un
mosaico de colores que se revela en fotos. Contrato tolerante como sus
hermanos (null ante fallo); hex validado estricto en el schema (termina en un
style inline). Plumbing calcado del checklist póster/miniatura: types, schema,
normalize, edición, composer, renderers — sin backend (un color no es un blob
que referenciar).

**Auditoría de aspecto** — todas las grillas reservan espacio (tamaños fijos,
`aspect-square`, o `aspectRatio` real desde dims guardadas). Única excepción:
portadas legacy sin dimensiones guardadas — sin datos no hay reserva posible;
declarado.

## Incidencias del propio desarrollo (y qué las cazó)

1. **Transition muerta con tests verdes** → la cazó el navegador (arriba).
2. **Violación de orden de hooks** en `Thumbnail` de Biblioteca (puse el hook
   después de un return temprano) → la cazó el test existente del fallback de
   error, que quedó como sonda real del contrato de hooks.

## Validación

- Suite completa en verde; typecheck, lint, format, gates, build y budget.
- **Mutación** (7 sondas): composer sin color cae; normalize descartándolo cae;
  edición perdiéndolo cae; placeholder ignorándolo cae; revelado sin encender
  la animación cae; placeholder que nunca se suelta cae; control (300→280ms)
  verde.
- **Navegador real**: extractor preciso (verde sólido `#4b7355` → `#4b7456`,
  desvío de compresión JPEG; mitad rojo + mitad azul → `#7f007f` exacto);
  animación `media-reveal` corriendo en vivo sobre el álbum demo.

### Límites declarados

- El color dominante solo existe para media NUEVA (sin backfill): las fotos
  viejas siguen con placeholder papel.
- Las imágenes EXTERNAS de recortes (imageUrl directo, sin blob autenticado)
  no participan del revelado gobernado: cargan nativo.
- Los lightbox de recortes/anexos/biblioteca no se tocaron (muestran una
  imagen grande, no grillas); el de Momentos hereda el fundido por usar la
  capa compartida.
