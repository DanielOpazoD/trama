import type { Recorte, RecorteTarget } from '../../api'
import {
  EntitiesIcon,
  MomentosIcon,
  PrinterIcon,
  QuoteIcon,
  SparkleIcon,
  TextIcon,
  TrashIcon,
} from '../Icons'
import { AIThinkingLabel } from '../AIThinkingLabel'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import type { PromoteSeed } from './PromoteModal'

export function RecorteCardMenu({
  recorte,
  suggestionReady,
  suggestBusy,
  ocrBusy,
  hasImage,
  hasInternalImage,
  deleting,
  onPromote,
  onSuggest,
  onOcr,
  onArchive,
  onDelete,
  onCancelDelete,
  onStartDelete,
  onSendImagesToPdf,
}: {
  recorte: Recorte
  suggestionReady: boolean
  suggestBusy: boolean
  ocrBusy: boolean
  hasImage: boolean
  hasInternalImage: boolean
  deleting: boolean
  onPromote: (recorte: Recorte, target: RecorteTarget, seed?: PromoteSeed) => void
  onSuggest: () => void
  onOcr: () => void
  onArchive: () => void
  onDelete: () => void
  onCancelDelete: () => void
  onStartDelete: () => void
  onSendImagesToPdf?: (recorte: Recorte) => void
}) {
  return (
    <OverflowMenu
      label="Acciones del recorte"
      width="w-52"
      triggerClassName="touch-target rounded p-1 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
    >
      {(close) => (
        <>
          {recorte.status === 'pending' && (
            <>
              <OverflowMenuItem
                onClick={() => {
                  onPromote(recorte, 'quote')
                  close()
                }}
              >
                <QuoteIcon size={13} /> → cita
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onPromote(recorte, 'entity')
                  close()
                }}
              >
                <EntitiesIcon size={13} /> → entidad
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onPromote(recorte, 'momento')
                  close()
                }}
              >
                <MomentosIcon size={13} /> → momento
              </OverflowMenuItem>
              {!suggestionReady && (
                <OverflowMenuItem
                  onClick={() => {
                    onSuggest()
                    close()
                  }}
                  disabled={suggestBusy}
                >
                  {suggestBusy ? (
                    <AIThinkingLabel />
                  ) : (
                    <>
                      <SparkleIcon size={13} /> sugerir destino
                    </>
                  )}
                </OverflowMenuItem>
              )}
              {hasImage && (
                <OverflowMenuItem
                  onClick={() => {
                    onOcr()
                    close()
                  }}
                  disabled={ocrBusy}
                >
                  {ocrBusy ? (
                    <AIThinkingLabel state="reading" />
                  ) : (
                    <>
                      <TextIcon size={13} /> extraer texto
                    </>
                  )}
                </OverflowMenuItem>
              )}
              {onSendImagesToPdf && hasInternalImage && (
                <OverflowMenuItem
                  onClick={() => {
                    onSendImagesToPdf(recorte)
                    close()
                  }}
                >
                  <PrinterIcon size={13} /> → Imprenta
                </OverflowMenuItem>
              )}
              <OverflowMenuItem
                onClick={() => {
                  onArchive()
                  close()
                }}
              >
                Archivar
              </OverflowMenuItem>
            </>
          )}

          {deleting ? (
            <>
              <OverflowMenuItem
                danger
                onClick={() => {
                  onDelete()
                  close()
                }}
              >
                <TrashIcon size={13} /> Sí, eliminar
              </OverflowMenuItem>
              <OverflowMenuItem onClick={onCancelDelete}>Cancelar</OverflowMenuItem>
            </>
          ) : (
            <OverflowMenuItem danger onClick={onStartDelete}>
              <TrashIcon size={13} /> Eliminar
            </OverflowMenuItem>
          )}
        </>
      )}
    </OverflowMenu>
  )
}
