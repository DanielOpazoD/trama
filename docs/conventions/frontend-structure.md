# Frontend Structure

Esta convención existe para evitar que las vistas vuelvan a crecer como
mega-componentes difíciles de testear. No exige reescrituras: se aplica cuando
un archivo ya se está tocando por una mejora o bugfix.

## Regla corta

- **Vista = orquestación.** La vista conecta hooks, mutaciones, navegación,
  efectos y composición de secciones.
- **Componentes = UI.** Los componentes reciben props explícitas, pintan markup y
  emiten callbacks. No duplican estado de dominio si la vista ya lo controla.
- **Hooks/modelos = estado derivado.** Filtros, conteos, normalización de
  parámetros, seeds y decisiones puras viven en hooks o módulos `*Model`.

## Cuándo extraer

Extrae una pieza cuando cumple al menos una de estas señales:

- La vista supera el ratchet de líneas o mezcla más de una responsabilidad.
- Un bloque JSX necesita más de 8-10 props implícitas del scope de la vista.
- Hay reglas puras que se pueden testear sin React, red ni DOM.
- Un flujo se repite entre tests de integración y necesita un contrato pequeño.

## Cuándo no extraer

No extraigas solo para crear capas. Si una pieza no tiene nombre claro, contrato
propio o test útil, probablemente debe quedarse donde está hasta que el uso real
muestre la frontera.

## Patrón recomendado

```ts
// Vista: orquesta estado y side effects.
const filter = useMemo(() => buildFeatureFilter(state), [state])

return (
  <FeatureControls
    filter={filter}
    onFilterChange={setFilter}
  />
)
```

```ts
// Modelo: lógica pura, testeable sin React.
export function buildFeatureFilter(input: Input): Filter {
  return { query: input.search.trim() || undefined }
}
```

```tsx
// Componente: markup y callbacks explícitos.
export function FeatureControls({ filter, onFilterChange }: Props) {
  return <button onClick={() => onFilterChange(nextFilter)}>Aplicar</button>
}
```

## Ratchets

Cuando un PR reduce un archivo grande, agrega o ajusta
`scripts/structure-ratchets.mjs` con margen pequeño. El objetivo no es castigar
un archivo por una línea, sino impedir que vuelva a crecer sin una decisión
explícita.

## Surface Diet v1

Las superficies adelgazadas mantienen una frontera simple: la vista conserva
hooks y efectos; los modelos concentran decisiones puras; los componentes nuevos
solo renderizan una sección con props explícitas.

| Superficie           | Frontera extraída                                        | Contrato                                                          |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `App.tsx`            | `appShell/*`                                             | Visibilidad del shell, chrome superior y capa de atención.        |
| `NotasFeedView.tsx`  | `NotasFeedVirtualList` + `notasFeedViewModel`            | Render virtualizado y metadata de fila sin duplicar mutaciones.   |
| `RecorteCard.tsx`    | `RecorteCardBody`, `RecorteCardMenu`, `recorteCardModel` | Media flags, cuerpo colapsable y acciones de triage aisladas.     |
| `CommandPalette.tsx` | `CommandPaletteSearchMode` + `commandPaletteModel`       | Modo búsqueda separado del modo resultados, keys y conteos puros. |
| `Settings.tsx`       | `SettingsNav`, `SettingsPanelContent`, `settingsModel`   | Índice declarativo de secciones y retorno OAuth por provider.     |

Regla para futuros PR: si una de estas superficies necesita crecer, primero
pregunta si la nueva lógica pertenece al modelo, a un componente presentacional
o a la vista. Solo sube el ratchet si el crecimiento es una responsabilidad real
de orquestación.
