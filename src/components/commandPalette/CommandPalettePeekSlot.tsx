import { lazy, Suspense, useEffect } from 'react'
import type { CommandSearchEntity } from '../../hooks/commandSearchModel'
import type { Item } from '../../hooks/useCommandSearch'
import { singleFlightImport } from '../../lib/singleFlightImport'
import { ErrorBoundary } from '../ErrorBoundary'

// La ficha del resultado resaltado viaja en su propio chunk: el de la paleta no
// tenía margen en su presupuesto. Se precarga al abrir la paleta.
const loadCommandPalettePeek = singleFlightImport(() =>
  import('../CommandPalettePeek').then((m) => ({ default: m.PeekPanel })),
)
const PeekPanel = lazy(loadCommandPalettePeek)

export function CommandPalettePeekSlot({
  item,
  entities,
}: {
  item: Item | undefined
  entities: CommandSearchEntity[] | undefined
}) {
  useEffect(() => {
    loadCommandPalettePeek().catch(() => {
      /* sin red la ficha no aparece; la paleta sigue */
    })
  }, [])
  if (!item) return null
  return (
    <aside
      aria-label="Vista previa del resultado"
      className="hidden md:block w-72 shrink-0 border-l border-ink-100/60 bg-paper-100/30 max-h-[50vh] overflow-y-auto"
    >
      <ErrorBoundary scope="omnibox-peek" fallback={() => null}>
        <Suspense fallback={null}>
          <PeekPanel item={item} entities={entities} />
        </Suspense>
      </ErrorBoundary>
    </aside>
  )
}
