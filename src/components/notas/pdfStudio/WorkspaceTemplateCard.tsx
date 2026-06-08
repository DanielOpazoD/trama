import { useEffect, useRef, useState } from 'react'
import {
  getSource,
  pageThumbKey,
  type PdfDoc,
  type PdfPage,
} from '../../../lib/pdfStudio/model'
import type { SavedDoc } from '../../../lib/pdfStudio/persistence'
import { renderPageThumb } from '../../../lib/pdfStudio/pdfRender'
import { DuplicateIcon, FilePdfIcon, PencilIcon, TrashIcon } from '../../Icons'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

function TemplateThumb({ doc }: { doc: PdfDoc }) {
  const page = doc.pages[0]
  const source = page ? getSource(doc, page.sourceId) : undefined
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!page || !source) return
    let alive = true
    if (page.kind === 'image') {
      const u = URL.createObjectURL(source.file)
      setUrl(u)
      return () => {
        alive = false
        URL.revokeObjectURL(u)
      }
    }
    setUrl(null)
    renderPdfTemplateThumb(source.file, page)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [page, source])

  return url ? (
    <img
      src={url}
      alt=""
      className="h-full w-full object-contain p-1"
      draggable={false}
    />
  ) : (
    <FilePdfIcon size={16} />
  )
}

function renderPdfTemplateThumb(file: File, page: PdfPage): Promise<string> {
  return page.kind === 'pdf'
    ? renderPageThumb(file, page.pageIndex, pageThumbKey(page))
    : Promise.reject(new Error('La página no es PDF'))
}

function dateLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fieldCountLabel(doc: PdfDoc) {
  const count = doc.formFields?.length ?? 0
  return `${count} ${count === 1 ? 'campo' : 'campos'}`
}

export function WorkspaceTemplateCard({
  saved,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
  onStartRename,
  onUseTemplate,
  onEditStructure,
  onDuplicate,
  onDelete,
  onDownloadPdf,
  onExportJson,
  onExportCsv,
}: {
  saved: SavedDoc
  renameValue: string | null
  onRenameValueChange: (value: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onStartRename: () => void
  onUseTemplate: () => void
  onEditStructure: () => void
  onDuplicate: () => void
  onDelete: () => void
  onDownloadPdf: () => void
  onExportJson: () => void
  onExportCsv: () => void
}) {
  const isRenaming = renameValue !== null
  const skipBlurConfirmRef = useRef(false)

  return (
    <li className="group rounded-md border border-ink-100 bg-paper-50/70 p-1.5 shadow-[0_1px_2px_rgba(31,28,24,0.04)] transition-colors hover:border-ink-200">
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirmRename()
            else if (e.key === 'Escape') {
              skipBlurConfirmRef.current = true
              onCancelRename()
            }
          }}
          onBlur={() => {
            if (skipBlurConfirmRef.current) {
              skipBlurConfirmRef.current = false
              return
            }
            onConfirmRename()
          }}
          className="input-paper flex-1 min-w-0 text-caption px-1.5 py-0.5 rounded border border-ink-200"
        />
      ) : (
        <div className="flex gap-2">
          <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-ink-100 bg-gradient-to-b from-paper-50 to-ink-50 text-ink-300">
            <TemplateThumb doc={saved.doc} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-caption font-medium text-ink-700">
                  {saved.name}
                </span>
                <span className="block text-micro text-ink-400 tabular-nums">
                  {fieldCountLabel(saved.doc)} · {saved.doc.pages.length}{' '}
                  {saved.doc.pages.length === 1 ? 'hoja' : 'hojas'} ·{' '}
                  {dateLabel(saved.savedAt)}
                </span>
              </div>
              <div className="flex shrink-0">
                <button
                  type="button"
                  onClick={onDuplicate}
                  aria-label={`Duplicar planilla ${saved.name}`}
                  title="Duplicar planilla"
                  className={rowBtn}
                >
                  <DuplicateIcon size={13} />
                </button>
                <button
                  type="button"
                  onClick={onStartRename}
                  aria-label={`Renombrar ${saved.name}`}
                  title="Renombrar"
                  className={rowBtn}
                >
                  <PencilIcon size={13} />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label={`Eliminar ${saved.name}`}
                  title="Eliminar de la lista"
                  className={`${rowBtn} hover:!text-[color:var(--accent-clay)]`}
                >
                  <TrashIcon size={13} />
                </button>
              </div>
            </div>

            <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1">
              <button
                type="button"
                onClick={onUseTemplate}
                aria-label={`Rellenar planilla ${saved.name}`}
                title="Rellenar sin modificar la plantilla"
                className="btn-accent inline-flex h-7 items-center justify-center px-2 text-micro"
              >
                Usar planilla
              </button>
              <button
                type="button"
                onClick={onEditStructure}
                aria-label={`Editar estructura de planilla ${saved.name}`}
                title="Editar casilleros"
                className="btn-ghost inline-flex h-7 items-center justify-center gap-1 px-2 text-micro"
              >
                <PencilIcon size={11} />
                Editar
              </button>
            </div>

            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onDownloadPdf}
                aria-label={`Descargar PDF editable de planilla ${saved.name}`}
                title="Descargar PDF editable"
                className="btn-ghost inline-flex h-5 items-center px-1.5 text-[10px]"
              >
                PDF editable
              </button>
              <button
                type="button"
                onClick={onExportJson}
                aria-label={`Exportar variables JSON de planilla ${saved.name}`}
                title="Exportar estructura JSON"
                className="btn-ghost inline-flex h-5 items-center px-1.5 text-[10px]"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                aria-label={`Exportar variables CSV de planilla ${saved.name}`}
                title="Exportar variables CSV"
                className="btn-ghost inline-flex h-5 items-center px-1.5 text-[10px]"
              >
                CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
