# Search + Command Palette

El `CommandPalette` es una superficie transversal: navegar vistas, revelar módulos
de Notas, abrir entidades/citas, consultar resultados remotos y correr consultas
guardadas. La regla de mantenimiento es mantener la UI del palette delgada y la
mezcla de resultados en funciones puras testeables.

## Fronteras

- `src/components/CommandPalette.tsx` conserva presentación, foco, teclado,
  modo búsqueda/resultados y despacho de selección.
- `src/hooks/useCommandSearch.ts` orquesta estado React y queries de datos. No
  debe volver a construir items inline.
- `src/hooks/commandSearchModel.ts` arma, ordena y dedupea items. Es puro: sin
  fetch, sin React, sin efectos.
- `src/hooks/useCommandServerSearch.ts` es el único dueño del debounce lexical,
  cancelación y protección contra respuestas stale.

## Ranking

El ranking local es deliberadamente simple:

- exact match o alias exacto.
- prefijo de label/nombre.
- prefijo de palabra.
- substring en label/nombre.
- match en hint, tipo o descripción.

No agrega IA ni motor nuevo. El server sigue usando `/api/search` en modo
`lexical` desde el palette para mantener bajo costo y latencia.

## Contratos

- Los resultados locales y remotos se dedupean por id antes de renderizar.
- `ask` va al final y no debe tapar hits concretos.
- Los alias con `#` tienen prioridad al revelar secciones de Notas.
- Todo nuevo `Item.kind` debe tener:
  - row visual en `CommandPaletteItems.tsx`.
  - key estable en `commandPaletteModel.ts`.
  - descripción diagnóstica en `commandSearchModel.ts`.
  - test single-axis en `commandSearchModel.test.ts`.

## Ratchets

`CommandPalette.tsx`, `useCommandSearch.ts`, `commandSearchModel.ts` y
`useCommandServerSearch.ts` están bajo `check:structure-ratchets`. Si una mejora
necesita subir un límite, primero debe justificar por qué no corresponde extraer
otra función pura o testear el comportamiento en el modelo.
