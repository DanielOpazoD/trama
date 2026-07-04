# Notas Coherence Pack — todo el mundo Notas habla el mismo idioma

## Problema

Tras #339/#340, Inicio y Notas hablaban el lenguaje nuevo (hero compacto,
composer plegado, pie sereno) pero Tareas, Prompts y Claves seguían con el
hero grande y el composer clásico: el contraste se notaba en cada cambio de
pestaña. Además, la barra superior duplicaba la jerarquía del hero
(«Notas · capturas y anexos» + hero «NOTAS Y CAPTURAS / Notas»).

## Piezas

- **Hero compacto en todo el mundo**: `density='compact'` + `spacing='tight'`
  en Tareas, Prompts y Claves (las dos instancias de Claves: gate del vault y
  vista abierta). Inicio y Notas ya lo tenían.
- **Barra superior sin jerarquía duplicada**: `NotasTopBar` pasa solo el
  título a `TopBar` (sin subtitle) — el h1 utilitario se queda por
  accesibilidad y orientación; el descriptor vivía repetido en el hero.
  `NOTAS_SECTION_TITLES` conserva los subtítulos (los usa el hero-side).
- **Composer de Prompts al lenguaje nuevo y PLEGABLE**: en reposo una línea
  («Nuevo prompt…»); al enfocar o con contenido se despliegan colección,
  cuerpo, chips de anexos y el pie sereno (ícono de adjuntar + pista de
  variables + guardar). Fuera el panel punteado «ANEXOS».
- **`PendingAttachmentsInput` retirado**: sin consumidores tras la
  migración; el módulo queda con `PendingAttachmentChips` (compartido por
  los composers de Notas y Prompts) y su test se reescribió para los chips
  (misma cobertura: tamaños legibles, quitar, busy).
- De paso, los inputs del composer de Prompts pasan de `text-sm` (alias
  legacy) a `text-body` — el ratchet de tokens baja en vez de subir.

## Validación

- Suite completa 4957 pass (el test del panel se consolidó en los chips;
  PromptsView.test consulta por aria-label — el placeholder plegado es
  «Nuevo prompt…»), lint, format, gates (design-tokens, knip, dead-code,
  ratchets, icon-button, focus-ring, form-control-labels), build.
- Navegador (demo, escritorio): Tareas con barra «Tareas» a secas y hero
  compacto; Prompts plegado→expandido verificado por foco; Claves con las
  dos instancias compactas; sin subtítulos duplicados en ninguna pestaña.
