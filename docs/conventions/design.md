# Design tokens + accesibilidad + patterns δ

## Design tokens (escalas canónicas)

El sistema visual usa tokens semánticos definidos en `tailwind.config.js`. **NO uses arbitrary values (`text-[Npx]`, `tracking-[Xem]`) — significa que el sistema ya tiene un nombre para eso.**

**Type scale — 6 niveles:**
| Token | Tamaño | Para qué |
|---|---|---|
| `text-micro` | 10px | chips, badges, eyebrows uppercase, kbd |
| `text-caption` | 12px | labels, metadata, dates |
| `text-body` | 14px | default UI |
| `text-lead` | 16px | primer párrafo, intros |
| `text-h2` | 20px | títulos de sección |
| `text-h1` | 32px | títulos de vista |
| Legacy aliases `text-xs/sm/base/lg/xl/2xl/3xl/4xl` siguen existiendo pero el código nuevo debe usar los semánticos. |

**Icon sizes — 5 valores:**
| Valor | Para qué |
|---|---|
| `size={10}` | indicadores inline, chips de aviso (• IA, • offline) |
| `size={12}` | default UI, toolbar |
| `size={14}` | botones medianos, nav icons |
| `size={18}` | CTAs primarios, hero |
| `size={22}` | logo Trama, splash |

**Letter spacing — 5 valores:**
| Token | Valor | Para qué |
|---|---|---|
| `tracking-tight` | -0.02em | serif headings compactos |
| `tracking-normal` | 0 | body (default) |
| `tracking-wider` | 0.05em (Tailwind) | uppercase sutil en metadata |
| `tracking-eyebrow` | 0.18em | chips, eyebrows uppercase emphatic |
| `tracking-shout` | 0.3em | greetings, separator labels |

**Animaciones — 6 canónicas:** `animate-fade-up`, `animate-slide-in-right`, `animate-slide-up`, `animate-shimmer`, `animate-pulse-subtle`, `animate-node-breathe`. Todas usan `cubic-bezier(0.25, 1, 0.5, 1)` ("ease-out-quart") salvo `node-breathe` que es `ease-in-out` (pulso simétrico). Si querés otra animación, primero pensá si una de estas no resuelve.

**Vertical rhythm — 8 steps (commit δ1):**
| Token | Valor | Para qué |
|---|---|---|
| `--space-1` | 5.5px | ajustes finos |
| `--space-2` | 11px | separación entre líneas de metadata |
| `--space-3` | 16.5px | padding interno de card / form |
| `--space-4` | 22px | rhythm-unit base |
| `--space-5` | 33px | padding generoso de section header |
| `--space-6` | 44px | separación entre secciones grandes |
| `--space-8` | 66px | padding hero / portada editorial |
| `--space-12` | 99px | espacio de ornament / pull-quote breathing |

Utilities Tailwind que consumen estos tokens:
- `.stack-N` → margin-top entre hijos directos (= space-y-N en el sistema)
- `.pad-block-N` → padding-block

Usar SOLO para spacing vertical en headers de vista, padding de cards, separación entre secciones grandes. El horizontal sigue con la escala de Tailwind (px-N, gap-N).

## Accesibilidad (estado actual)

- `lang="es"` en `<html>`
- Semantic HTML: `<main>`, `<aside>`, `<nav>`, `<header>`, `<footer>` usados consistentemente
- Jerarquía de headings: un solo `<h1>` por pantalla (vive en TopBar; el wordmark "Trama" del Sidebar es `<span>` decorativo)
- `aria-label` en 48+ icon buttons; `aria-describedby` automático en `<Tooltip>`
- `role="alert"` en ErrorBoundary fallback y banners de error
- `role="status"` en ToastHost (`aria-live="polite"`)
- `role="tooltip"` en `<Tooltip>` con id linkeado al trigger
- `:focus-visible` global con outline azul (no se recorta por overflow:hidden)
- `prefers-reduced-motion` respetado en shimmer del skeleton

**Texto vs contraste**: `text-ink-300` (#63636b) es el muted más claro permitido para texto legible — pasa AA con ~5.1:1 sobre `paper-50` blanco, incluso en `text-micro` (10px) que requiere 4.5:1 por ser texto pequeño. Era #71717a hasta ε5 (axe lo cazó en 4.43, justo bajo el umbral). `text-ink-200` (#d4d4d8) NO se usa para texto, solo para iconos decorativos, separators (·), o disabled states.

**Pendiente para futuro audit** con axe-core en CI: color contrast de chips de tipos sobre fondo de card (algunos `typeAccent` claros podrían fallar), touch target sizes en mobile (algunos icon buttons son <44px).

**Trampa común: `label-content-name-mismatch`** — si un botón tiene visible text "Entidades 63" Y un `aria-label`, el aria-label DEBE contener literalmente ese texto (axe-core compara substring case-insensitive post-normalize). `aria-label="Entidades (63)"` falla por los paréntesis; `aria-label="Entidades 63"` pasa. Cuando agregues `aria-label` a un botón con texto visible, hacelos coincidir literalmente — o mejor, omití el aria-label y dejá que el text content lo nombre. Lección de γ4 + δ8.

## Patterns canónicos δ (motion + life)

Después del sprint δ varias técnicas pasaron a ser el patrón estándar para sus casos. Cuando agregues algo similar, usá estos en vez de reinventar.

**NumberTicker (`src/components/NumberTicker.tsx`)** — para mostrar cualquier count que pueda cambiar (sidebar nav counts, totales). Anima dígito por dígito en ~420ms con out-quart, respeta `prefers-reduced-motion`. Es siempre `<span class="tabular-nums">`, así que se puede usar inline en oraciones. NO usar para timestamps ni valores que cambien continuamente — fue pensado para deltas humanos (+1, +10, +100), no para ticking de relojes.

**`useAchievements({ entities, quotes, relationships })`** — corre en App.tsx con los counts de las queries. Dispara un toast efímero cuando se cruza un umbral (10, 25, 50, 100, 250, 500, 1000+). Persiste lo que ya fue notificado en localStorage `trama:achievements-seen`. Si cruzás varios umbrales a la vez (e.g. import masivo) muestra solo el mayor. Si querés agregar un dominio nuevo (e.g. `chatMessages`), extendé la signature y agregá un branch en `pickMessage`.

**`useHiloOfTheDay(entities, quotes)` + `readHiloOfTheDay()`** — compute corre en HomeView con la data, escribe en localStorage `trama:hilo-date` + `trama:hilo-text` una vez por día. Read es la función pura que el Splash importa para mostrar la frase personalizada en vez del aforismo random. Detecta aniversarios (mismo MM-DD, al menos 1 año atrás). Si no hay aniversario hoy, limpia la cache → splash vuelve a aforismo random. **Importante:** el splash NO puede computar esto in-line porque corre antes que las queries terminen — el split entre compute y read es deliberado.

**`useTimeOfDayAccent()`** — corre en App.tsx, muta `--accent-gold` y `--accent-gold-soft` en `<html>` cada 30 min según hora local: cobre cálido en la mañana, dorado al mediodía, ámbar al atardecer, lavanda azulada en la noche. Todo lo que use `var(--accent-gold)` hereda el shift automáticamente. NO crear un hook análogo para otras variables; si necesitás shift de tema, extendé este.

**`ReadingModeEssay`** (`src/components/ReadingModeEssay.tsx`) — modal serif fullscreen para LEER essays largos. Spectral 17px / leading 1.75, max-w-prose, drop-cap si el texto arranca con >= 60 chars, ornamentos arriba/abajo. Atajo Escape cierra. **NO confundir con el "Modo lectura" del input** que procesa textos largos para extracción. Este es OUTPUT-only — leer lo que ya escribiste.

**`.section-eyebrow-serif`** (`src/index.css`) — para eyebrows editoriales de alta carga visual (cita destacada, ornaments). Spectral con `font-variant-caps: small-caps` + `text-transform: lowercase`, tracking 0.08em. Reemplaza el patrón `text-micro uppercase tracking-eyebrow` cuando querés algo MÁS refinado y MENOS shouty. Nota: Spectral en Google Fonts NO trae glyphs smcp reales; el browser los sintetiza (decente, no perfecto). Si fuera crítico, importar Spectral con `&display=swap&text=…` específico — pero no vale la pena hoy.

**Acknowledged-but-active pattern (γ3)** — para indicadores que avisan de algo (dot rojo de health alerts) Y que el usuario puede "reconocer" sin resolver. La función `acknowledgeHealthAlerts(codes)` se llama al abrir Settings; persiste los códigos vistos en localStorage. Si un código NUEVO aparece después, vuelve a iluminar. Si una alerta se va y vuelve (mismo código), también re-aparece — el set se REEMPLAZA por completo, no se acumula. Replicable para cualquier sistema de "notificación que el usuario puede silenciar hasta que cambie".
