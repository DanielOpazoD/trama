import { NodeDetailPanel } from './NodeDetailPanel'
import { ProposalPanel } from './ProposalPanel'
import type { ExtractionProposal } from '../types'
import { useEntitiesQuery } from '../state'
import { EntitySigil } from './EntitySigil'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { IconButton } from './IconButton'
import { Tooltip } from './Tooltip'

export type PendingProposal = { text: string; proposal: ExtractionProposal }

/**
 * Panel flotante a la derecha (desktop) / sheet abajo (mobile).
 *
 * Cubre dos casos exclusivos:
 *   - Hay una propuesta IA pendiente → renderiza ProposalPanel
 *   - Hay una entidad seleccionada (sin propuesta) → renderiza NodeDetailPanel
 *
 * ω-panel: el detalle se puede **minimizar** a una pestaña anclada al borde
 * derecho. Minimizado no hay velo, así el grafo queda visible con la selección
 * encendida (las relaciones que el panel tapaba). La propuesta NO se minimiza
 * —pide una decisión— y su velo se mantiene; el del detalle es transparente
 * para no apagar el mapa.
 *
 * Si todo es null, no se renderiza. El padre decide cuándo cerrar por ahí:
 * click en el backdrop dispara `onClose` con ambos a null.
 */
export function RightPanel({
  isMobile,
  pendingProposal,
  selectedEntityId,
  minimized,
  onToggleMinimize,
  onCloseProposal,
  onCloseDetail,
  onBackdropClose,
  onOpenThreadFromDetail,
}: {
  isMobile: boolean
  pendingProposal: PendingProposal | null
  selectedEntityId: string | null
  /** Detalle colapsado a la pestaña del borde. */
  minimized: boolean
  onToggleMinimize: () => void
  onCloseProposal: () => void
  onCloseDetail: () => void
  /** Click fuera de la card: cerrar lo que sea que esté abierto. */
  onBackdropClose: () => void
  /** Click en "Hablar" dentro de NodeDetailPanel: navegar a chat con
      el thread focalizado en la entidad. */
  onOpenThreadFromDetail: (threadId: string) => void
}) {
  const showProposal = pendingProposal !== null
  const showDetail = !showProposal && selectedEntityId !== null
  const open = showProposal || showDetail
  if (!open) return null

  // Minimizar solo aplica al detalle en desktop (en mobile el sheet ya se
  // desliza; la propuesta pide una decisión, no se minimiza).
  const canMinimize = showDetail && !isMobile
  const isMinimized = canMinimize && minimized

  // Detalle minimizado → solo la pestaña, sin velo. El grafo queda a la vista.
  if (isMinimized && selectedEntityId) {
    return <MinimizedDetailTab entityId={selectedEntityId} onRestore={onToggleMinimize} />
  }

  return (
    <>
      {/* Backdrop SOLO para la propuesta (decisión modal): velo tenue + click
          fuera cierra. El detalle NO lleva backdrop —si no, un velo a pantalla
          completa se tragaría los clics del grafo aunque sea transparente—; el
          grafo/lista de fondo queda interactuable y el detalle se cierra con la
          X, con Escape o deseleccionando en el grafo. */}
      {showProposal && (
        <button
          onClick={onBackdropClose}
          aria-label="Cerrar panel"
          className="fixed inset-0 z-10 cursor-default bg-ink-900/20"
          tabIndex={-1}
        />
      )}
      {/* Desktop: glass card anchored to the right. Mobile: bottom sheet
          that slides up from below, covering most of the screen. */}
      <div
        className={
          isMobile
            ? 'fixed inset-x-0 bottom-0 top-12 z-20 animate-slide-up pointer-events-none'
            : 'fixed top-4 right-4 bottom-4 w-[40rem] max-w-[calc(100vw-2rem)] z-20 animate-slide-in-right pointer-events-none'
        }
      >
        <div
          className={
            isMobile
              ? 'relative paper-grain h-full pointer-events-auto rounded-t-2xl border-t border-x border-ink-100 bg-paper-50 shadow-2xl shadow-ink-900/20 overflow-hidden'
              : 'relative paper-grain h-full pointer-events-auto rounded-xl border border-ink-100 bg-paper-50 shadow-2xl shadow-ink-900/15 overflow-hidden'
          }
        >
          {/* Drag handle on mobile — visual cue de que es un sheet. */}
          {isMobile && (
            <div className="pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-ink-200/70" />
            </div>
          )}
          {/* Agarradera de minimizar — cuelga del borde izquierdo (mirando al
              grafo). Empuja el panel afuera para ver el mapa. */}
          {canMinimize && (
            <div className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
              <Tooltip content="Minimizar — ver el grafo">
                <IconButton
                  label="Minimizar panel"
                  onClick={onToggleMinimize}
                  className="size-7 flex items-center justify-center rounded-full border border-ink-100 bg-paper-50 text-ink-400 shadow-md shadow-ink-900/10 transition-colors hover:text-ink-700 hover:bg-paper-100"
                >
                  <ChevronRightIcon size={16} />
                </IconButton>
              </Tooltip>
            </div>
          )}
          {showProposal && pendingProposal && (
            <ProposalPanel
              proposal={pendingProposal.proposal}
              sourceText={pendingProposal.text}
              onClose={onCloseProposal}
              onConfirmed={onCloseProposal}
            />
          )}
          {showDetail && selectedEntityId && (
            <NodeDetailPanel
              entityId={selectedEntityId}
              onClose={onCloseDetail}
              onOpenThread={onOpenThreadFromDetail}
            />
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Pestaña del detalle minimizado — anclada al borde derecho, con el sello de
 * la entidad y un chevron para traerla de vuelta. Resuelve la entidad del
 * cache (useEntitiesQuery ya está poblado por el grafo/lista).
 */
function MinimizedDetailTab({
  entityId,
  onRestore,
}: {
  entityId: string
  onRestore: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const entity = entities.find((e) => e.id === entityId)
  return (
    <div className="fixed right-0 top-1/2 z-20 -translate-y-1/2 animate-slide-in-right">
      <button
        onClick={onRestore}
        aria-label={entity ? `Abrir detalle de ${entity.name}` : 'Abrir detalle'}
        className="flex items-center gap-2 rounded-l-xl border border-r-0 border-ink-100 bg-paper-50 py-3 pl-2.5 pr-2 shadow-lg shadow-ink-900/10 transition-colors hover:bg-paper-100 focus-ring"
      >
        <ChevronLeftIcon size={16} className="text-ink-400" />
        {entity && <EntitySigil name={entity.name} type={entity.type} size="sm" />}
      </button>
    </div>
  )
}
