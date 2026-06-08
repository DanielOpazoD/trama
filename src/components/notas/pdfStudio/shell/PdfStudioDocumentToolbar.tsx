import { pdfCommandTooltip } from '../../../../lib/pdfStudio/model/commands'
import type { AssembleOptions } from '../../../../lib/pdfStudio/assemble/assemble'
import type { DocSettings } from '../../../../lib/pdfStudio/model/model'
import type { PdfTemplateMode } from '../planillas/design/PdfTemplateModeBanner'
import { OverflowMenu, OverflowMenuItem } from '../../../OverflowMenu'
import {
  CloseIcon,
  DownloadIcon,
  FilePdfIcon,
  FileIcon,
  PrinterIcon,
  RedoIcon,
  UndoIcon,
  UploadIcon,
} from '../../../Icons'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function PdfStudioDocumentToolbar({
  busy,
  canSaveTemplate,
  empty,
  exportCompression,
  exportStatus,
  formsEnabled,
  pageNumbers,
  redoable,
  saving,
  studioMode,
  templateMode,
  total,
  undoable,
  watermarkText,
  onCancelExport,
  onDownload,
  onDownloadFillable,
  onImport,
  onNewDoc,
  onOpenOcr,
  onInspectForms,
  onPrintTemplate,
  onRedo,
  onSavePdf,
  onStartSaveTemplate,
  onSetExportCompression,
  onSetPageNumbers,
  onSetWatermark,
  onUndo,
}: {
  busy: boolean
  canSaveTemplate: boolean
  empty: boolean
  exportCompression: AssembleOptions['compression']
  exportStatus: string | null
  formsEnabled: boolean
  pageNumbers: DocSettings['pageNumbers']
  redoable: boolean
  saving: boolean
  studioMode: 'editor' | 'templates'
  templateMode: PdfTemplateMode
  total: number
  undoable: boolean
  watermarkText: string
  onCancelExport: () => void
  onDownload: () => void
  onDownloadFillable: () => void
  onImport: () => void
  onNewDoc: () => void
  onOpenOcr: () => void
  onInspectForms: () => void
  onPrintTemplate: () => void
  onRedo: () => void
  onSavePdf: () => void
  onStartSaveTemplate: () => void
  onSetExportCompression: (next: AssembleOptions['compression']) => void
  onSetPageNumbers: (next: DocSettings['pageNumbers']) => void
  onSetWatermark: (text: string) => void
  onUndo: () => void
}) {
  const isMac = isMacLike()
  const isTemplates = studioMode === 'templates'
  const isFillMode = isTemplates && templateMode === 'fill'
  const canDownloadFillable = isTemplates && templateMode === 'design'
  const needsTemplateFields = canDownloadFillable && !empty && !canSaveTemplate
  const primaryLabel = isFillMode
    ? 'Imprimir planilla'
    : needsTemplateFields
      ? 'Agregar casilleros'
      : isTemplates
        ? 'Guardar planilla'
        : 'Guardar PDF'
  const primaryDisabled = isFillMode
    ? empty || saving || busy
    : isTemplates
      ? empty || saving || busy
      : empty || saving || busy
  const primaryTitle = isFillMode
    ? 'Abrir el visor para imprimir la planilla rellenada'
    : needsTemplateFields
      ? 'Abrir el editor para agregar casilleros de texto a esta planilla'
      : isTemplates
        ? 'Guardar esta estructura como planilla reusable'
        : 'Abrir el visor del navegador para imprimir o guardar todo el documento'
  const PrimaryIcon = isTemplates && !isFillMode ? FilePdfIcon : PrinterIcon
  const handlePrimary = isFillMode
    ? onPrintTemplate
    : isTemplates
      ? onStartSaveTemplate
      : onSavePdf
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
        {/* En LLENADO la acción de imprimir vive en el banner contextual
            (PdfTemplateModeBanner), así no se duplica el botón. */}
        {!isFillMode && (
          <button
            type="button"
            onClick={handlePrimary}
            disabled={primaryDisabled}
            title={primaryTitle}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-800 px-2.5 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800"
          >
            <PrimaryIcon size={13} />
            {saving ? 'Preparando…' : primaryLabel}
          </button>
        )}
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
              {canDownloadFillable && (
                <OverflowMenuItem
                  disabled={empty || saving || busy || !canSaveTemplate}
                  onClick={() => {
                    close()
                    onDownloadFillable()
                  }}
                >
                  <FilePdfIcon size={13} />
                  Descargar PDF rellenable
                </OverflowMenuItem>
              )}
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
              {formsEnabled && (
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
              )}
              <OverflowMenuItem
                disabled={empty || saving || busy}
                onClick={() => {
                  close()
                  onOpenOcr()
                }}
              >
                <FileIcon size={13} />
                OCR buscable
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
