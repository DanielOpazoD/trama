import {
  lazy,
  Suspense,
  type ComponentProps,
  type Dispatch,
  type Ref,
  type SetStateAction,
} from 'react'
import type { QueryHit, QueryInput } from '../../api/query'
import type { Item } from '../../hooks/useCommandSearch'
import { CommandPaletteSearchMode } from './CommandPaletteSearchMode'

const CommandPaletteResults = lazy(() =>
  import('../CommandPaletteResults').then((m) => ({ default: m.CommandPaletteResults })),
)

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const SHORTCUT_KEY = IS_MAC ? '⌘' : 'Ctrl'

export type CommandPaletteResultsState = {
  hits: QueryHit[]
  ast: QueryInput | null
  source?: 'llm' | 'fallback'
  heading: string
}

export function CommandPaletteDialog({
  dialogRef,
  entitiesForPeek,
  focusIdx,
  items,
  mode,
  onBackToSearch,
  onClose,
  onFocusIdx,
  onQueryChange,
  onSaveQuery,
  onSelectHit,
  onSelectItem,
  query,
  results,
  running,
  saving,
  searching,
}: {
  dialogRef: Ref<HTMLDivElement>
  entitiesForPeek: ComponentProps<typeof CommandPaletteSearchMode>['entitiesForPeek']
  focusIdx: number
  items: Item[]
  mode: 'search' | 'results'
  onBackToSearch: () => void
  onClose: () => void
  onFocusIdx: Dispatch<SetStateAction<number>>
  onQueryChange: (value: string) => void
  onSaveQuery: (name: string) => void
  onSelectHit: (hit: QueryHit) => void
  onSelectItem: (item: Item) => void
  query: string
  results: CommandPaletteResultsState | null
  running: boolean
  saving: boolean
  searching: boolean
}) {
  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Buscar"
          aria-modal="true"
          className="w-full max-w-xl md:max-w-3xl pointer-events-auto animate-fade-up"
        >
          <div className="bg-paper-50 border border-ink-100/80 rounded-xl shadow-lg shadow-ink-900/15 overflow-hidden">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Buscar o preguntar…"
                aria-label="Buscar o preguntar"
                className="w-full px-5 py-4 pr-16 bg-transparent text-ink-700 placeholder:text-ink-300 font-serif text-lg leading-none border-b border-ink-100/60"
                autoComplete="off"
              />
              <kbd
                aria-hidden
                className="absolute right-4 top-1/2 -translate-y-1/2 text-micro px-1.5 py-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-400 leading-none font-mono"
              >
                {SHORTCUT_KEY} K
              </kbd>
            </div>
            {mode === 'results' && results ? (
              <>
                <Suspense
                  fallback={
                    <p className="px-5 py-6 text-ink-400 italic text-sm text-center">
                      cargando resultados…
                    </p>
                  }
                >
                  <CommandPaletteResults
                    hits={results.hits}
                    ast={results.ast}
                    source={results.source}
                    heading={results.heading}
                    focusIdx={focusIdx}
                    onFocusIdx={onFocusIdx}
                    onSelectHit={onSelectHit}
                    onBack={onBackToSearch}
                    onSave={onSaveQuery}
                    saving={saving}
                  />
                </Suspense>
                <div className="px-5 py-2 border-t border-ink-100/60 text-micro uppercase tracking-eyebrow text-ink-300 flex justify-between">
                  <span>↑↓ navegar · enter abrir · esc volver</span>
                  <span>{results.hits.length} resultados</span>
                </div>
              </>
            ) : (
              <CommandPaletteSearchMode
                items={items}
                query={query}
                running={running}
                searching={searching}
                focusIdx={focusIdx}
                entitiesForPeek={entitiesForPeek}
                onFocusIdx={onFocusIdx}
                onSelectItem={onSelectItem}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
