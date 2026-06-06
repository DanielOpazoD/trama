import { pdfCommandTooltip } from '../../../lib/pdfStudio/commands'
import type { AssembleOptions } from '../../../lib/pdfStudio/assemble'
import type { DocSettings } from '../../../lib/pdfStudio/model'
import { OverflowMenu, OverflowMenuItem } from '../../OverflowMenu'
import {
  CloseIcon,
  DownloadIcon,
  FileIcon,
  PrinterIcon,
  RedoIcon,
  UndoIcon,
  UploadIcon,
} from '../../Icons'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function PdfStudioDocumentToolbar({
  busy,
  empty,
  exportCompression,
  exportStatus,
  pageNumbers,
  redoable,
  saving,
  total,
  undoable,
  watermarkText,
  onCancelExport,
  onDownload,
  onImport,
  onNewDoc,
  onInspectForms,
  onRedo,
  onSavePdf,
  onSetExportCompression,
  onSetPageNumbers,
  onSetWatermark,
  onUndo,
}: {
  busy: boolean
  empty: boolean
  exportCompression: AssembleOptions['compression']
  exportStatus: string | null
  pageNumbers: DocSettings['pageNumbers']
  redoable: boolean
  saving: boolean
  total: number
  undoable: boolean
  watermarkText: string
  onCancelExport: () => void
  onDownload: () => void
  onImport: () => void
  onNewDoc: () => void
  onInspectForms: () => void
  onRedo: () => void
  onSavePdf: () => void
  onSetExportCompression: (next: AssembleOptions['compression']) => void
  onSetPageNumbers: (next: DocSettings['pageNumbers']) => void
  onSetWatermark: (text: string) => void
  onUndo: () => void
}) {
  const isMac = isMacLike()
  return (
    <div
      role="toolbar"
      aria-label="Acciones del documento PDF"
      className="flex flex-nowrap items-center gap-1.5 border-y border-ink-100/70 bg-paper-50/70 px-1.5 py-1.5 shadow-sm shadow-ink-900/5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onImport}
          disabled={busy}
          aria-label="Importar PDF o imagen"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-100/50 hover:text-ink-900 disabled:opacity-50"
        >
          <UploadIcon size={13} />
          {busy ? 'Agregando…' : 'Importar'}
        </button>
        {(undoable || redoable) && (
          <div className="inline-flex items-center overflow-hidden rounded-md bg-ink-100/40">
            <button
              type="button"
              onClick={onUndo}
              disabled={!undoable}
              aria-label="Deshacer"
              title={pdfCommandTooltip('undo', isMac)}
              className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
            >
              <UndoIcon size={14} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!redoable}
              aria-label="Rehacer"
              title={pdfCommandTooltip('redo', isMac)}
              className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
            >
              <RedoIcon size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        {!empty && (
          <span className="hidden text-micro text-ink-300 tabular-nums sm:inline">
            {total} {total === 1 ? 'página' : 'páginas'}
          </span>
        )}
        <button
          type="button"
          onClick={onSavePdf}
          disabled={empty || saving || busy}
          title="Abrir el visor del navegador para imprimir o guardar todo el documento"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-800 px-2.5 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800"
        >
          <PrinterIcon size={13} />
          {saving ? 'Preparando…' : 'Guardar PDF'}
        </button>
        {exportStatus && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <span role="status" aria-live="polite" className="text-micro text-ink-400">
              {exportStatus}
            </span>
            <button
              type="button"
              onClick={onCancelExport}
              aria-label="Cancelar exportación"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-800"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )}
        <OverflowMenu
          label="Más acciones del documento"
          width="w-64"
          triggerClassName="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-800"
        >
          {(close) => (
            <>
              <OverflowMenuItem
                disabled={empty || saving || busy}
                onClick={() => {
                  close()
                  onDownload()
                }}
              >
                <DownloadIcon size={13} />
                Descargar
              </OverflowMenuItem>
              <OverflowMenuItem
                disabled={empty || busy}
                onClick={() => {
                  close()
                  onNewDoc()
                }}
              >
                <FileIcon size={13} />
                Nuevo documento
              </OverflowMenuItem>
              <OverflowMenuItem
                disabled={empty || saving || busy}
                onClick={() => {
                  close()
                  onInspectForms()
                }}
              >
                <FileIcon size={13} />
                Detectar formularios
              </OverflowMenuItem>
              {!empty && (
                <div className="mt-1 border-t border-ink-100 px-2 py-2">
                  <p className="mb-2 text-micro uppercase tracking-eyebrow text-ink-300">
                    Ajustes
                  </p>
                  <label className="flex items-center gap-2 text-caption text-ink-700">
                    <input
                      type="checkbox"
                      checked={!!pageNumbers}
                      onChange={(e) =>
                        onSetPageNumbers(
                          e.target.checked ? { position: 'center' } : undefined,
                        )
                      }
                    />
                    Numerar páginas
                  </label>
                  {pageNumbers && (
                    <div className="mt-1.5 flex gap-1 pl-6">
                      {(['left', 'center', 'right'] as const).map((position) => {
                        const on = pageNumbers.position === position
                        const label =
                          position === 'left'
                            ? 'Izq.'
                            : position === 'center'
                              ? 'Centro'
                              : 'Der.'
                        return (
                          <button
                            key={position}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onSetPageNumbers({ position })}
                            className={`rounded px-2 py-0.5 text-micro transition-colors ${
                              on
                                ? 'bg-[color:var(--accent-sage)] text-paper-50'
                                : 'text-ink-500 hover:bg-ink-100/60'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <label
                    className="mt-2 block text-caption text-ink-700"
                    htmlFor="pdf-watermark-menu"
                  >
                    Marca de agua
                  </label>
                  <input
                    id="pdf-watermark-menu"
                    type="text"
                    value={watermarkText}
                    onChange={(e) => onSetWatermark(e.target.value)}
                    placeholder="Ej: BORRADOR"
                    className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                  />
                  <label
                    className="mt-2 block text-caption text-ink-700"
                    htmlFor="pdf-compression-menu"
                  >
                    Exportación
                  </label>
                  <select
                    id="pdf-compression-menu"
                    value={exportCompression ?? 'balanced'}
                    onChange={(e) =>
                      onSetExportCompression(
                        e.currentTarget.value as AssembleOptions['compression'],
                      )
                    }
                    className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                  >
                    <option value="balanced">Optimizada</option>
                    <option value="compatibility">Máxima compatibilidad</option>
                  </select>
                </div>
              )}
            </>
          )}
        </OverflowMenu>
      </div>
    </div>
  )
}
