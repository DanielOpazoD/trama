import { pdfCommandTooltip } from '../../../lib/pdfStudio/commands'
import { ChevronLeftIcon, ChevronRightIcon, RedoIcon, UndoIcon } from '../../Icons'
import { stepBtn } from './editorStyle'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function PdfTextEditorHeader({
  currentPage,
  redoable,
  total,
  undoable,
  onCancel,
  onDone,
  onNextPage,
  onPrevPage,
  onRedo,
  onUndo,
}: {
  currentPage: number
  redoable: boolean
  total: number
  undoable: boolean
  onCancel: () => void
  onDone: () => void
  onNextPage: () => void
  onPrevPage: () => void
  onRedo: () => void
  onUndo: () => void
}) {
  const isMac = isMacLike()
  return (
    <header className="flex items-center justify-between gap-3 border-b border-ink-100/70 bg-paper-50/95 px-3 py-2 shadow-sm shadow-ink-900/5 shrink-0">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={onPrevPage}
          disabled={currentPage === 0}
          aria-label="Página anterior"
          title="Página anterior"
          className={stepBtn}
        >
          <ChevronLeftIcon size={16} />
        </button>
        <p className="text-sm font-medium text-ink-700 tabular-nums whitespace-nowrap">
          Página {currentPage + 1}{' '}
          <span className="font-normal text-ink-400">de {total}</span>
        </p>
        <button
          type="button"
          onClick={onNextPage}
          disabled={currentPage === total - 1}
          aria-label="Página siguiente"
          title="Página siguiente"
          className={stepBtn}
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="inline-flex items-center rounded-md border border-ink-100 bg-paper-50 overflow-hidden divide-x divide-ink-100">
          <button
            type="button"
            onClick={onUndo}
            disabled={!undoable}
            aria-label="Deshacer"
            title={pdfCommandTooltip('undo', isMac)}
            className={stepBtn}
          >
            <UndoIcon size={15} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!redoable}
            aria-label="Rehacer"
            title={pdfCommandTooltip('redo', isMac)}
            className={stepBtn}
          >
            <RedoIcon size={15} />
          </button>
        </div>
        <button onClick={onCancel} className="btn-ghost text-xs">
          Cancelar
        </button>
        <button onClick={onDone} className="btn-accent text-xs">
          Listo
        </button>
      </div>
    </header>
  )
}
