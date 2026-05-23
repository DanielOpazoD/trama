import { NodeDetailPanel } from './NodeDetailPanel'
import { ProposalPanel } from './ProposalPanel'
import type { ExtractionProposal } from '../types'

export type PendingProposal = { text: string; proposal: ExtractionProposal }

/**
 * Panel flotante a la derecha (desktop) / sheet abajo (mobile).
 *
 * Cubre dos casos exclusivos:
 *   - Hay una propuesta IA pendiente → renderiza ProposalPanel
 *   - Hay una entidad seleccionada (sin propuesta) → renderiza NodeDetailPanel
 *
 * Si ambos son null, el componente no se renderiza. El padre decide
 * cuándo cerrarlos por ahí: click en el backdrop dispara `onClose` con
 * ambos a null.
 */
export function RightPanel({
  isMobile,
  pendingProposal,
  selectedEntityId,
  onCloseProposal,
  onCloseDetail,
  onBackdropClose,
  onOpenThreadFromDetail,
}: {
  isMobile: boolean
  pendingProposal: PendingProposal | null
  selectedEntityId: string | null
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

  return (
    <>
      {/* Backdrop: click fuera cierra. tabIndex=-1 + aria-label para
          que screen readers no anuncien un botón sin propósito visible. */}
      <button
        onClick={onBackdropClose}
        aria-label="Cerrar panel"
        className="fixed inset-0 z-10 cursor-default"
        tabIndex={-1}
      />
      {/* Desktop: glass card anchored to the right. Mobile: bottom sheet
          that slides up from below, covering most of the screen. */}
      <div
        className={
          isMobile
            ? 'fixed inset-x-0 bottom-0 top-12 z-20 animate-slide-up pointer-events-none'
            : 'fixed top-4 right-4 bottom-4 w-[22rem] max-w-[calc(100vw-2rem)] z-20 animate-slide-in-right pointer-events-none'
        }
      >
        <div
          className={
            isMobile
              ? 'relative paper-grain h-full pointer-events-auto rounded-t-2xl border-t border-x border-ink-100/50 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/12 overflow-hidden'
              : 'relative paper-grain h-full pointer-events-auto rounded-xl border border-ink-100/50 bg-paper-50/85 backdrop-blur-md shadow-lg shadow-ink-900/10 overflow-hidden'
          }
        >
          {/* Drag handle on mobile — visual cue de que es un sheet. */}
          {isMobile && (
            <div className="pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-ink-200/70" />
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
