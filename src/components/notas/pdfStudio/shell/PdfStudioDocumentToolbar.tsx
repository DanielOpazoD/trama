import { pdfCommandTooltip } from '../../../../lib/pdfStudio/model/commands'
import type { AssembleOptions } from '../../../../lib/pdfStudio/assemble/assemble'
import type { DocSettings } from '../../../../lib/pdfStudio/model/model'
import type { PdfTemplateMode } from '../planillas/design/PdfTemplateModeBanner'
import { OverflowMenu, OverflowMenuItem } from '../../../OverflowMenu'
import { WaitingVoice } from '../../../WaitingVoice'
import {
  FilePdfIcon,
  FileIcon,
  PrinterIcon,
  RedoIcon,
  SettingsIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
} from '../../../Icons'
import { CloseButton } from '../../../CloseButton'
import { IconButton } from '../../../IconButton'

const IMAGE_LAYOUT_OPTIONS = [1, 2, 4, 6] as const

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

  // Documento vacío y sin historial: la barra no tiene nada que ofrecer. El
  // lienzo ya muestra la zona de arrastre, que dice "arrastra o haz clic para
  // elegirlos" — un botón "Importar" encima es una segunda puerta a lo mismo,
  // apilada sobre la primera.
  //
  // El historial es la excepción, por el motivo de abajo: si el vacío viene de
  // borrar las páginas o de deshacer la importación, estos botones son el camino
  // de vuelta y ocultarlos dejaría el trabajo irrecuperable. En Planillas no
  // aplica: allí se entra a rellenar una plantilla, no a componer desde cero.
  if (empty && !isTemplates && !undoable && !redoable) return null

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
        {/* Deshacer/rehacer SÍ se quedan con el documento vacío, y a propósito.
            Un documento recién abierto no tiene historial, así que aquí no
            aparece nada: la regla de «vacío = sólo Importar» se cumple sola. Y
            cuando el vacío viene de una acción —borrar las páginas, deshacer la
            importación—, estos dos botones son justamente el camino de vuelta.
            Ocultarlos por «coherencia visual» dejaría el trabajo irrecuperable:
            deshacer la importación y perder el botón de rehacer. */}
        {(undoable || redoable) && (
          <div className="inline-flex items-center overflow-hidden rounded-md bg-ink-100/40">
            <IconButton
              onClick={onUndo}
              disabled={!undoable}
              label="Deshacer"
              title={pdfCommandTooltip('undo', isMac)}
              className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
            >
              <UndoIcon size={14} />
            </IconButton>
            <IconButton
              onClick={onRedo}
              disabled={!redoable}
              label="Rehacer"
              title={pdfCommandTooltip('redo', isMac)}
              className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
            >
              <RedoIcon size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {/* Con el documento vacío sólo tiene sentido traer algo: el lienzo ya
          muestra la zona de arrastre con la invitación y los formatos. Antes
          había ocho controles ahí sin nada sobre lo que actuar —el primario
          deshabilitado, ajustes de un documento inexistente, «Nuevo documento»
          en un documento ya nuevo—, y eso es lo que volvía la barra ilegible.
          La interfaz crece con el trabajo: en Imprenta vacía queda «Importar».
          En Planillas no se aplica, porque ahí se entra a rellenar una plantilla
          que se abre de la nube, no a componer desde cero. */}
      <div
        className={`ml-auto flex min-w-0 items-center gap-1.5 ${
          empty && !isTemplates ? 'hidden' : ''
        }`}
      >
        {!empty && (
          <span className="hidden text-micro text-ink-300 tabular-nums sm:inline">
            {total} {total === 1 ? 'página' : 'páginas'}
          </span>
        )}
        {!isTemplates && (
          <OverflowMenu
            label="Ajustes del documento"
            width="w-72"
            triggerClassName="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-200 px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-100/50 hover:text-ink-900"
            triggerContent={
              <>
                <SettingsIcon size={12} />
                <span className="hidden sm:inline">Ajustes</span>
              </>
            }
          >
            {() => (
              <div className="px-2 py-2">
                <p className="mb-2 text-micro uppercase tracking-eyebrow text-ink-300">
                  Encabezado y pie
                </p>
                <label
                  htmlFor="pdf-page-numbers-page"
                  className="flex items-center gap-2 text-caption text-ink-700"
                >
                  <input
                    id="pdf-page-numbers-page"
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
                  htmlFor="pdf-header-page"
                >
                  Encabezado
                </label>
                <input
                  id="pdf-header-page"
                  type="text"
                  value={headerText}
                  onChange={(e) => onSetHeader(e.target.value)}
                  placeholder="Ej: Clínica Norte"
                  className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                />
                <label
                  className="mt-2 block text-caption text-ink-700"
                  htmlFor="pdf-footer-page"
                >
                  Pie de página
                </label>
                <input
                  id="pdf-footer-page"
                  type="text"
                  value={footerText}
                  onChange={(e) => onSetFooter(e.target.value)}
                  placeholder="Ej: Uso interno"
                  className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                />
                <p className="mb-2 mt-3 text-micro uppercase tracking-eyebrow text-ink-300">
                  Al importar
                </p>
                <label
                  className="block text-caption text-ink-700"
                  htmlFor="pdf-images-per-page-page"
                >
                  Imágenes por hoja
                </label>
                <select
                  id="pdf-images-per-page-page"
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
                  {IMAGE_LAYOUT_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? 'imagen' : 'imágenes'}
                    </option>
                  ))}
                </select>

                {/* Marca de agua y compresión vivían en el menú «···», junto a
                    herramientas como el OCR. Eran ajustes del documento igual
                    que la numeración o el encabezado, y estar repartidos entre
                    dos menús sin regla adivinable obligaba a buscar en ambos. */}
                <p className="mb-2 mt-3 text-micro uppercase tracking-eyebrow text-ink-300">
                  Al exportar
                </p>
                <label
                  className="block text-caption text-ink-700"
                  htmlFor="pdf-watermark-page"
                >
                  Marca de agua
                </label>
                <input
                  id="pdf-watermark-page"
                  type="text"
                  value={watermarkText}
                  onChange={(e) => onSetWatermark(e.target.value)}
                  placeholder="Ej: BORRADOR"
                  className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                />
                <label
                  className="mt-2 block text-caption text-ink-700"
                  htmlFor="pdf-compression-page"
                >
                  Compresión
                </label>
                <select
                  id="pdf-compression-page"
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
          </OverflowMenu>
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
            <CloseButton
              onClick={onCancelExport}
              label="Cancelar exportación"
              size={12}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-800"
            />
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
              {/* Descartar el documento estaba PEGADO al botón de guardar: un
                  clic de más y se perdía el trabajo. Baja aquí, marcado como
                  destructivo y lejos de la acción primaria. */}
              {/* `saving` como en las acciones vecinas: descartar el documento
                  a mitad de una exportación la dejaría terminando contra un
                  estado que ya no existe. */}
              <OverflowMenuItem
                danger
                disabled={empty || saving || busy}
                onClick={() => {
                  close()
                  onNewDoc()
                }}
              >
                <TrashIcon size={12} />
                Descartar y empezar de nuevo
              </OverflowMenuItem>
            </>
          )}
        </OverflowMenu>
      </div>
    </div>
  )
}
