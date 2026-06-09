# Filosofía estética de Trama

Este documento es la fuente única de verdad para entender **por qué** Trama
se ve y se siente como se ve. Las reglas tácticas viven en `design.md` (tokens,
escalas, animaciones); acá vive el **norte** que esas reglas implementan.

Cuando una decisión visual nueva esté en duda, este es el documento que se
consulta. Si la regla no está acá ni en `design.md`, hay que preguntarse si el
sistema necesita una regla nueva o si la decisión está fuera del proyecto.

---

## 1. La proposición

> Trama es un **catálogo personal con voz editorial**, no un producto SaaS
> con chrome de productividad.

Todo lo demás se deriva de eso. Si una elección visual hace que la app se
sienta como Notion / Linear / cualquier dashboard, esa elección es
incorrecta — aunque sea "más moderna" o "más limpia". Si una elección hace
que la app se sienta como una página de libro bien tipografiada,
probablemente vamos bien.

El usuario no tiene "usuarios". No hay "team workspace". No hay
"productividad". Hay una persona, sus lecturas, sus citas, sus relaciones,
sus momentos. La estética acompaña esa intimidad — papel, tinta, ornamentos,
serif para los gestos editoriales, manuscrito para la voz del usuario.

---

## 2. Cuatro principios rectores

Toda decisión visual se justifica contra uno (o varios) de estos cuatro.
Si no entra en ninguno, probablemente es ruido.

### 2.1 Disciplina editorial

El producto debe sentirse curado, no configurado. Eso significa **menos
opciones visuales, no más**.

- **Un único accent primario** (`--accent-primary`, prussian deep en Trama).
  Dos ayudantes con uso semántico estricto: `--accent-sage` para confirmaciones,
  `--accent-clay` para destrucción. **Excepción por mundo:** el mundo Notas mapea
  `--accent-primary → --accent-sage` (clase `world-notas` en `<html>`, vía
  `useWorldThemeClass`) para darle su propia voz salvia; sigue siendo un solo
  primario, solo que su valor depende del mundo. Compone con paper/night/vela.
- **Un solo gold** (`--accent-gold`) — el único accent que cambia con la
  hora del día (`useTimeOfDayAccent`), y por eso es el que da personalidad
  ambiental.
- **Cero paleta arcoíris**. No existe `text-purple-500` ni `bg-emerald-200`
  en componentes (las únicas excepciones son `.alert-error` y `.alert-warn`,
  encapsuladas).
- **Type scale: 6 niveles**, no 12. **Tracking: 4 valores**, no 9. Si querés
  un tamaño nuevo, primero preguntate si alguno de los semánticos no resuelve.
- **Iconos: 5 tamaños** (10/12/14/18/22). Cualquier `size={N}` con otro valor
  necesita justificación documentada.

La disciplina no es por dogmatismo; es porque **el catálogo es lo
protagonista, no la UI**. Cada elemento de UI que llama la atención roba
foco del contenido.

### 2.2 Calidez material

El producto evoca **papel impreso** — no skeumorfismo nostálgico, sino el
respeto físico que tiene un libro bien hecho.

- **`paper` + `ink`** son los dos sustantivos. No "background + foreground".
  No "neutral-100 + neutral-900". Papel y tinta.
- **Sombras tintadas cálidas** (`--card-shadow`, `--card-shadow-hover`): el
  componente cromático del gold (~12%) hace que las cards floten en
  "habitación con luz cálida", no en "estudio fotográfico".
- **Paper grain** (`paper-grain` + `bubble-paper`): textura noise SVG inline,
  imperceptible al ojo fijo, presente al barrer. Hace que el color flat de
  CSS deje de sentirse plástico.
- **Tres temas con la misma alma**:
  - **Día** (light): blanco neutro alto contraste — leer largo sin fatiga.
  - **Noche** (dark): neutro técnico oscuro — código y data sin glare.
  - **Vela** (`html.dark.theme-vela`): sepia profundo cálido — el modo
    "lectura nocturna con luz LED baja", inspirado en libros leídos en cama.

Los tres temas mantienen la misma jerarquía y los mismos gestos. No hay
features que solo funcionen en uno.

### 2.3 Refinamiento tipográfico

La tipografía no es decorativa: es **el contenido**. Cada elección está al
servicio de la legibilidad y del registro.

Tres familias, tres voces:

| Familia      | Para qué                                     | Por qué                                                                                                                  |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Inter**    | UI, body, default                            | sans humanista neutra, screen-first, OpenType rico (`ss01`, `cv11`, `calt`, `kern` habilitados globalmente)              |
| **Spectral** | títulos de vista, citas, ornaments, drop-cap | serif editorial con personalidad italic + small caps reales (smcp + c2sc) — feel "letterpress" sin caer en lo nostálgico |
| **Caveat**   | `userReflection`, marginalia                 | manuscrito casual; señala "esto es ANOTACIÓN del usuario", no UI ni prosa generada — son hojas pegadas en el libro       |

Detalles editoriales que rara vez se ven en apps SaaS y que acá están:

- **Hanging punctuation** (`hanging-punctuation: first last;`) en
  `.quote-block` y `.font-serif` — las comillas y guiones iniciales "cuelgan"
  fuera del bloque, alineando el primer carácter alfabético. Degrada
  silenciosamente en Chrome.
- **Drop caps** (`.drop-cap`) en la cita destacada de Inicio, en gold que
  respira con la hora.
- **Small caps reales** (`.section-eyebrow-serif`) cuando se quiere un
  eyebrow más refinado que el uppercase compuesto sintético.
- **Tabular numerals opt-in** (`.tabular-nums`) — el body usa cifras
  proporcionales para texto fluido, pero los chips/metadata mantienen
  alineación vertical.
- **Letter spacing semántico**: `tight` para serif comprimido, `eyebrow`
  para uppercase sutil, `shout` para greetings y separadores ceremoniales.
- **Letterpress sin ostentación**: ligatures (`liga`, `dlig`) habilitadas
  en Spectral, contextual alternates (`calt`) en mono — el resultado es
  "imprenta cuidada" no "fuente de Etsy".

### 2.4 Animación con propósito

Las animaciones nunca son "decoración". Cada una **comunica un estado o un
gesto físico**.

- **Una curva canónica**: `cubic-bezier(0.25, 1, 0.5, 1)` (out-quart, "Apple
  curve") — empieza rápido, decelera suave. Para transitions >150ms con
  transform. Color-only sigue con `ease` (default).
- **Variantes con overshoot suave** (`0.34, 1.56, 0.64, 1`) solo para
  micro-gestos físicos: `node-spring-in`, `check-pop`, entrada de cards.
- **Cero linear, cero ease-in puro**. Lo único `linear` es `dash-flow`
  porque imita el flujo de tinta.
- **`prefers-reduced-motion` respetado siempre**. Si vas a agregar una
  animación nueva y no podés desactivarla limpiamente, no la agregues.

Animaciones canónicas (ya definidas — usar estas antes de inventar):

| Animación                                    | Para qué                                              |
| -------------------------------------------- | ----------------------------------------------------- |
| `animate-fade-up`                            | cards/lists que entran en escena                      |
| `animate-slide-in-right`                     | paneles laterales, propuestas IA inline               |
| `animate-slide-up`                           | bottom-sheets mobile                                  |
| `animate-ai-arrive`                          | "constellation arrival" — propuesta IA recién llegada |
| `animate-node-breathe`                       | nodos del grafo en idle (4.2s, delta minúsculo)       |
| `animate-halo-pulse`                         | nodo seleccionado                                     |
| `animate-check-pop` + `animate-saved-ripple` | ✓ guardado                                            |
| `animate-dots-pulse`                         | "pensando · · ·" del assistant                        |
| `animate-shimmer`                            | skeletons de loading                                  |
| `animate-pulse-subtle`                       | indicadores en curso (no destructivos)                |
| `animate-shell-*`                            | choreography de entrada de la app (splash → shell)    |

Tres principios de motion:

1. **Vida sutil > estado estático**. El grafo respira en idle (`node-breathe`).
   El drop-cap respira con la hora (`useTimeOfDayAccent`). El producto se
   siente vivo sin gritar.
2. **Confirmación táctil**. `active:scale(0.97)` global en botones — el
   click se siente físico. `check-pop` + `saved-ripple` para confirmar
   guardado.
3. **Choreography para momentos clave**. La carga inicial usa
   `shell-sidebar` (1.05s) + `shell-topbar` (1.05s) + `shell-main` (1.15s)
   en escalera — la app se ensambla pieza por pieza, no aparece de golpe.

---

## 3. Vocabulario visual

Estos son los sustantivos del sistema. Usarlos consistentemente cuando
diseñes o escribas código.

### 3.1 Superficies

- **`paper`** — el fondo del mundo (el "viewport editorial").
- **`surface-sidebar`** / **`surface-topbar`** — chrome de navegación,
  diferenciado del paper por gris muy sutil (no por borde).
- **`bg-card` / `.card-paper`** — la unidad de contenido. **No** "card" en
  abstracto: específicamente "una hoja de papel apoyada sobre el escritorio".
- **`bubble-paper`** — burbuja del assistant en chat, con textura.
- **`ai-panel`** — panel de propuesta IA, con el tinte azul-primary suave +
  border `--accent-primary-ring`.

### 3.2 Marcas

- **`accent-rule`** — la barra primary de 32×2px que va bajo títulos de
  sección. "Vibración sin gritar".
- **`section-eyebrow`** / **`section-eyebrow-serif`** — el label uppercase
  arriba de cada sección. Serif + small caps cuando se quiere refinar
  (cita destacada, splash, ornaments).
- **`accent-rule` + `OrnamentBreak` + `EndMark`** — los tres separadores
  editoriales. Aparecen entre secciones largas como respiraciones.

### 3.3 Acciones

- **`btn-ink`** — acción primaria pesada. Ink-700 background. Para CTAs
  destacados que el usuario reconoce como "la acción".
- **`btn-accent`** — acción primaria editorial. Accent-primary background.
  Para CTAs que invitan ("abrir", "explorar", "ver más").
- **`btn-ghost`** — acción secundaria, ink-300 text con hover. Para acciones
  reversibles o de navegación.
- **`ai-cta`** / **`ai-cta-pill`** — el link discreto de IA en el corner
  de section headers ("descubrir con IA", "pedir ronda"). Siempre
  accent-primary para que la voz de la IA tenga un único color en toda la app.

### 3.4 Estados

Chips de estado por `data-tone`:

- `chip[data-tone='primary']` — accent-primary
- `chip[data-tone='gold']` — accent-gold (IA, featured, "del día")
- `chip[data-tone='sage']` — accent-sage (confirmaciones, conectado)

Alertas semánticas (no Tailwind palette):

- `.alert-error` — destructivo / fallo. Único lugar donde aparecen rojos.
- `.alert-warn` — atención / costo / rate. Único lugar donde aparecen amber.

### 3.5 Voz del usuario vs voz del sistema

- **Voz del sistema** (UI, prosa generada, datos): Inter sans body,
  ink-700.
- **Voz del usuario** (`marginalia-script`, userReflection): Caveat,
  ink-500. "Notas a lápiz" sobre el catálogo, no contenido principal.
- **Voz editorial** (títulos de vista, citas, hilo del día): Spectral
  serif, ink-700/800.

---

## 4. Disciplina (las reglas absolutas)

Estas reglas no se rompen. Si una necesita una excepción, se documenta
explícitamente en el componente (comentario inline) y se agrega al
inventario de "excepciones deliberadas" más abajo.

1. **Nunca arbitrary values en Tailwind** para tokens del sistema:
   - `text-[14px]` → `text-caption`
   - `tracking-[0.18em]` → `tracking-eyebrow`
   - `bg-[#fafafa]` → `bg-paper-100`
   - Excepción: micro-sizes <12px en metadata técnica (timestamps de
     heatmap, etiquetas mono de PlaysTiming) **si y solo si** el token
     `text-micro` (10px) se queda corto Y el contenido es genuinamente
     decorativo. Estos casos se cuentan con los dedos de una mano.

2. **Nunca colores Tailwind genéricos** fuera de `.alert-error` /
   `.alert-warn` / `hover-action-destructive`. No `text-purple-500`, no
   `bg-emerald-200`. Si necesitás otro color, agregalo como CSS var en
   `:root` con un nombre semántico.

3. **Nunca animaciones inline** fuera de las canónicas. Si necesitás una
   nueva, agregala a `src/index.css` con keyframe nombrado, curva
   `out-quart` (o overshoot suave si corresponde), y respeto a
   `prefers-reduced-motion`.

4. **Nunca `dark:` classes** en componentes — los temas viven en las CSS
   vars de `:root` / `html.dark` / `html.dark.theme-vela`. El componente
   no sabe en qué tema corre.

5. **Nunca texto sobre `ink-200`** — `ink-200` (#d4d4d8) es para iconos
   decorativos, separators, disabled. El muted más claro permitido para
   texto legible es `ink-300` (#63636b, ~5.1:1 sobre paper-50 — pasa WCAG
   AA en `text-micro`).

6. **Header de vista canónico**: `<ViewHeader title eyebrow accent? sticky? />`.
   El componente produce el gesto unificado (eyebrow serif → h2 → accent-rule
   → subtitle). Las dos únicas excepciones deliberadas están abajo.

7. **Card de lista canónica**: `.card-paper` / `.card-paper-hover` /
   `.card-paper-elevated`. Si te encontrás escribiendo
   `bg-paper-50/40 border border-ink-100/50 rounded-xl`, parate y usá la
   utility.

8. **`focus-visible` global respetado**. No usar `outline-none` salvo que
   se reemplace por un anillo equivalente (ej. inputs con `border-color`
   shift + `box-shadow` ring).

9. **Vertical rhythm**: usar `--space-N` / `.stack-N` / `.pad-block-N`
   para spacing vertical de headers de vista, padding de cards,
   separación entre secciones grandes. El horizontal sigue con la escala
   Tailwind (px-N, gap-N).

10. **Hanging punctuation y drop caps no se quitan**. Pertenecen al
    registro editorial. Si alguien propone "limpiarlos para que se vea
    más moderno", la respuesta es no.

---

## 5. Patrones canónicos (atajos)

Reconocer estos patrones evita reinventarlos. Catálogo no exhaustivo —
para detalles ver `design.md`.

- **`<ViewHeader />`** → header de vista (6 de 8 vistas de Trama, y todas
  las secciones de página del mundo Notas — Hoy, Notas, Tareas, Prompts,
  Claves — con `accent` salvia; Imprenta/Planillas quedan fuera por ser
  layouts tipo app de ancho completo).
- **`.card-paper-hover`** → fila de lista interactiva (con micro-tilt 0.4°
  - shadow tintada al hover).
- **`.card-paper-elevated`** → panel/modal prominente (sin hover state,
  con shadow estática).
- **`.ai-panel`** → contenedor de propuesta IA (background primary-soft +
  border primary-ring).
- **`.bubble-paper`** → burbuja del assistant en chat (textura noise +
  paper-100/55).
- **`.section-eyebrow-serif`** → eyebrow refinado para momentos
  ceremoniales (cita del día, splash).
- **`<NumberTicker />`** → cualquier count que pueda cambiar
  (out-quart, ~420ms, respeta reduced-motion).
- **`<OrnamentBreak />`** + **`<EndMark />`** → separadores editoriales.
- **`useTimeOfDayAccent()`** → si querés que algo "respire con la hora",
  usá `var(--accent-gold)` — ya está enchufado.
- **Acknowledged-but-active pattern (γ3)** — para indicadores que avisan
  Y se pueden reconocer sin resolver (dot rojo de health alerts).

---

## 6. Excepciones deliberadas

Estas dos rompen una regla pero la rompen **a propósito**. Cualquier
cambio que las pretenda "normalizar" hacia el resto del sistema necesita
discusión explícita.

### 6.1 `<Greeting />` en HomeView

No usa `<ViewHeader />` porque la home page no es "una vista" en el
sentido de Trama: es **la portada**. Específicamente:

- El título no es "Inicio" (redundante con sidebar + topbar) sino la
  **fecha de hoy** ("Sábado, 24 de mayo") en serif tracking-tight — un
  gesto editorial de portada de diario.
- El eyebrow es un **greeting personalizado** (`tracking-shout`,
  "Buenos días" / "Buenas noches") — registro distinto al eyebrow de
  sección normal.
- El wash de fondo es `--accent-gold-soft` con
  `useTimeOfDayAccent` aplicado — la portada respira con la hora real.

### 6.2 Header de `ChatView` (panel de conversación)

No usa `<ViewHeader />` porque su título cambia por hilo (`activeThread.title`),
y el subtitle es contextual (`threadSubtitle(activeThread.context)`).
Funcionalmente es **el header de una conversación específica**, no de la
vista "Chat". Si se forzara a ViewHeader habría que aceptar mb-8 fijo y
perder el border-b sutil que separa título de mensajes.

---

## 7. Cómo agregar algo nuevo

Antes de escribir nada visual, las preguntas en orden:

1. **¿El sistema ya tiene una palabra para esto?**
   - Si sí → usá esa. Sin excepciones.
   - Si no → pregunta 2.

2. **¿Esta cosa va a aparecer en >2 lugares?**
   - Si sí → agregala como utility en `src/index.css` con nombre semántico,
     documentá en `design.md`, considerá si modifica esta filosofía.
   - Si no → inline está bien, pero **sin arbitrary values** — usá
     tokens existentes incluso en un one-off.

3. **¿Está dentro de los cuatro principios rectores?**
   - Disciplina editorial / Calidez material / Refinamiento tipográfico /
     Animación con propósito.
   - Si sentís que necesitás defender la decisión contra alguno de los
     cuatro, probablemente la decisión está mal.

4. **¿Funciona en los tres temas (día / noche / vela)?**
   - Si usás CSS vars, probablemente sí.
   - Si usás colores hardcodeados, probablemente no — vuelve a vars.

5. **¿Respeta `prefers-reduced-motion` si tiene animación?**

6. **¿Pasa WCAG AA en color contrast?**
   - Texto sobre paper: usar `ink-300` o más oscuro.
   - Touch targets: 44×44 mínimo en mobile (clase `.touch-target` si el
     elemento visual es <40px).

---

## 8. Anti-patrones (lo que la app NO es)

Si te encontrás escribiendo algo así, paralo:

- **"Dashboard" feel**: muchos counters grandes, gradientes brillantes,
  iconos coloridos saturados. Trama no es un dashboard de KPIs.
- **"Material 3 / Apple HIG genérico"**: shadows sin tinte, accent
  rainbow, pill buttons saturados. Tenemos identidad propia.
- **"Notion-like blocks"**: bloques generic con drag handles visibles
  todo el tiempo. Nuestras hover-actions aparecen al hover (o siempre
  en touch).
- **"Vapor stack"**: tints saturados, neón sutil, glass morphism
  excesivo. Usamos backdrop-blur con criterio (sticky headers, modals,
  hover-actions), no como estética.
- **"Productividad SaaS"**: empty states con cohetes 🚀, tooltips "tip
  pro", upsells. Trama es un objeto íntimo.
- **Emojis decorativos en UI**. Texto del usuario sí (es suyo); UI no.
- **Mensajes de éxito tipo "¡Bien hecho!"**. Confirmamos con un ✓
  silencioso y una onda. La app no celebra al usuario; le hace lugar.

---

## 9. Cómo evoluciona este documento

Si en una sesión descubrís un patrón, una excepción justificada, una
regla nueva que el sistema necesita:

1. **¿Es un principio rector?** → reescribir sección 2.
2. **¿Es vocabulario nuevo?** → agregar a sección 3.
3. **¿Es una regla nueva?** → agregar a sección 4 (numerada).
4. **¿Es un patrón reutilizable?** → agregar a sección 5 + utility en
   `src/index.css` + entrada en `design.md`.
5. **¿Es una excepción deliberada?** → agregar a sección 6 con
   justificación.
6. **¿Es un anti-patrón nuevo?** → agregar a sección 8.

El objetivo es que `filosofia-estetica.md` se mantenga corto (<400
líneas) pero exhaustivo en alma. Si está creciendo en detalles tácticos,
mover esos detalles a `design.md` y dejar acá solo el norte.
