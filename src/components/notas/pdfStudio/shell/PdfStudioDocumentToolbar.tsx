import { pdfCommandTooltip } from '../../../../lib/pdfStudio/model/commands'
import type { AssembleOptions } from '../../../../lib/pdfStudio/assemble/assemble'
import type { DocSettings } from '../../../../lib/pdfStudio/model/model'
import type { PdfTemplateMode } from '../planillas/design/PdfTemplateModeBanner'
import { OverflowMenu, OverflowMenuItem } from '../../../OverflowMenu'
import { WaitingVoice } from '../../../WaitingVoice'
import {
  CloseIcon,
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
  footerText,
  headerText,
  imagesPerPage,
  pageNumbers,
  redoable,
  saving,
  studioMode,
  templateMode,
  total,
  undoable,
  watermarkText,
  onCancelExport,
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
  onSetFooter,
  onSetHeader,
  onSetImagesPerPage,
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
  footerText: string
  headerText: string
  imagesPerPage: NonNullable<DocSettings['imageLayout']>['imagesPerPage']
  pageNumbers: DocSettings['pageNumbers']
  redoable: boolean
  saving: boolean
  studioMode: 'editor' | 'templates'
  templateMode: PdfTemplateMode
  total: number
  undoable: boolean
  watermarkText: string
  onCancelExport: () => void
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
  onSetFooter: (text: string) => void
  onSetHeader: (text: string) => void
  onSetImagesPerPage: (
    next: NonNullable<DocSettings['imageLayout']>['imagesPerPage'],
  ) => void
  onSetPageNumbers: (next: DocSettings['pageNumbers']) => void
  onSetWatermark: (text: string) => void
  onUndo: () => void
}) {
  const isMac = isMacLike()
  const isTemplates = studioMode === 'templates'
  const isFillMode = isTemplates && templateMode === 'fill'
  const canDownloadFillable = isTemplates && templateMode === 'design'
  // En diseño de planilla SIN casilleros aún, no hay botón primario: se agregan
  // casilleros con doble clic en la hoja (entra a "Crear plantilla"). El botón
  // "Agregar casilleros" era redundante con ese gesto.
  const needsTemplateFields = canDownloadFillable && !empty && !canSaveTemplate
  const primaryLabel = isFillMode
    ? 'Imprimir planilla'
    : isTemplates
      ? 'Guardar planilla'
      : 'Guardar PDF'
  const primaryDisabled = empty || saving || busy
  const primaryTitle = isFillMode
    ? 'Abrir la vista previa para imprimir o descargar la planilla rellenada'
    : isTemplates
      ? 'Guardar esta estructura como planilla reusable'
      : 'Abrir la vista previa para imprimir o descargar el PDF'
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
      className="flex flex-nowrap items-center gap-1.5 border-y border-ink-100/70 bg-paper-50/70 px-1.5 py-1 shadow-sm shadow-ink-900/5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onImport}
          disabled={busy}
          aria-label="Importar PDF o imagen"
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-100/50 hover:text-ink-900 disabled:opacity-50"
        >
          <UploadIcon size={12} />
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
        {/* "Nuevo documento" salió del menú "···" y queda como acción a la par
            del guardado (sólo Imprenta; en Planillas sigue en el menú). */}
        {!isTemplates && (
          <button
            type="button"
            onClick={onNewDoc}
            disabled={empty || busy}
            aria-label="Nuevo documento"
            title="Empezar un documento nuevo (descarta el actual)"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-200 px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-100/50 hover:text-ink-900 disabled:opacity-40"
          >
            <FileIcon size={12} />
            <span className="hidden sm:inline">Nuevo documento</span>
          </button>
        )}
        {/* En LLENADO la acción de imprimir vive en el banner contextual
            (PdfTemplateModeBanner), así no se duplica el botón. En diseño sin
            casilleros tampoco hay primario (se entra con doble clic en la hoja). */}
        {!isFillMode && !needsTemplateFields && (
          <button
            type="button"
            onClick={handlePrimary}
            disabled={primaryDisabled}
            title={primaryTitle}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-ink-800 px-2.5 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800"
          >
            <PrimaryIcon size={12} />
            {saving ? 'Preparando…' : primaryLabel}
          </button>
        )}
        {exportStatus && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <span role="status" aria-live="polite" className="text-micro text-ink-400">
              <WaitingVoice
                phrases={[
                  'cosiendo el pliego…',
                  'imponiendo las páginas…',
                  'prensando la tinta…',
                ]}
                className="text-micro"
              />{' '}
              · {exportStatus}
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
              {canDownloadFillable && (
                <OverflowMenuItem
                  disabled={empty || saving || busy || !canSaveTemplate}
                  onClick={() => {
                    close()
                    onDownloadFillable()
                  }}
                >
                  <FilePdfIcon size={12} />
                  Descargar PDF rellenable
                </OverflowMenuItem>
              )}
              {isTemplates && (
                <OverflowMenuItem
                  disabled={empty || busy}
                  onClick={() => {
                    close()
                    onNewDoc()
                  }}
                >
                  <FileIcon size={12} />
                  Nuevo documento
                </OverflowMenuItem>
              )}
              {formsEnabled && (
                <OverflowMenuItem
                  disabled={empty || saving || busy}
                  onClick={() => {
                    close()
                    onInspectForms()
                  }}
                >
                  <FileIcon size={12} />
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
                <FileIcon size={12} />
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
                    htmlFor="pdf-header-menu"
                  >
                    Encabezado
                  </label>
                  <input
                    id="pdf-header-menu"
                    type="text"
                    value={headerText}
                    onChange={(e) => onSetHeader(e.target.value)}
                    placeholder="Ej: Clínica Norte"
                    className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                  />
                  <label
                    className="mt-2 block text-caption text-ink-700"
                    htmlFor="pdf-footer-menu"
                  >
                    Pie de página
                  </label>
                  <input
                    id="pdf-footer-menu"
                    type="text"
                    value={footerText}
                    onChange={(e) => onSetFooter(e.target.value)}
                    placeholder="Ej: Uso interno"
                    className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                  />
                  <label
                    className="mt-2 block text-caption text-ink-700"
                    htmlFor="pdf-images-per-page-menu"
                  >
                    Imágenes por página
                  </label>
                  <select
                    id="pdf-images-per-page-menu"
                    value={imagesPerPage}
                    onChange={(e) =>
                      onSetImagesPerPage(
                        Number(e.currentTarget.value) as NonNullable<
                          DocSettings['imageLayout']
                        >['imagesPerPage'],
                      )
                    }
                    className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                  >
                    <option value={1}>1 imagen</option>
                    <option value={2}>2 imágenes</option>
                    <option value={3}>3 imágenes</option>
                    <option value={4}>4 imágenes</option>
                    <option value={6}>6 imágenes</option>
                  </select>
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
