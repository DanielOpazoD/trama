import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addImageSource,
  addPdfSource,
  canExport,
  deletePage,
  emptyDoc,
  getSource,
  movePage,
  movePageByDelta,
  pageThumbKey,
  type PdfDoc,
  type PdfPage,
} from '../../../lib/pdfStudio/model'
import {
  disposePdfStudio,
  forgetThumb,
  getPdfPageCount,
  renderPageThumb,
} from '../../../lib/pdfStudio/pdfRender'
import { assemble } from '../../../lib/pdfStudio/assemble'
import { downloadBlob } from '../../../lib/downloadBlob'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FilePdfIcon,
  TrashIcon,
  UploadIcon,
} from '../../Icons'
import { useToast } from '../../../state'

const ACCENT = 'var(--accent-sage)'
const ACCEPT = 'application/pdf,image/*'

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Nombre de archivo del PDF exportado, con fecha local para no pisar descargas. */
function exportName(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `trama-${stamp}.pdf`
}

/**
 * Editor de PDF (submódulo del mundo Notas), 100% client-side: combina PDFs e
 * imágenes en un solo documento, a nivel de PÁGINA (estilo iLovePDF). Cada PDF
 * se expande en sus páginas y cada imagen es una página; todas se ven como
 * miniaturas reordenables (botones ◄ ► o arrastrando) y borrables, y se guardan
 * como un PDF nuevo. El modelo es puro y testeado; el render (pdf.js) y el
 * ensamblado (pdf-lib) son perezosos y viven en archivos aparte.
 */
export function PdfStudioView() {
  const toast = useToast()
  const [doc, setDoc] = useState<PdfDoc>(emptyDoc)
  const [busy, setBusy] = useState(false) // importando
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Al desmontar la sección, libera las miniaturas/documentos de pdf.js.
  useEffect(() => () => disposePdfStudio(), [])

  const addFiles = useCallback(
    async (list: FileList | File[] | null) => {
      const files = list ? Array.from(list) : []
      if (files.length === 0) return
      setBusy(true)
      try {
        let next = doc
        const failed: string[] = []
        for (const file of files) {
          try {
            if (isPdf(file)) {
              const count = await getPdfPageCount(file)
              next = addPdfSource(next, file, count)
            } else if (isImage(file)) {
              next = addImageSource(next, file)
            } else {
              failed.push(file.name)
            }
          } catch {
            failed.push(file.name)
          }
        }
        setDoc(next)
        if (failed.length > 0) {
          toast.show({
            message: `No se pudo leer: ${failed.join(', ')} (¿PDF cifrado o formato no soportado?).`,
            tone: 'error',
          })
        }
      } finally {
        setBusy(false)
      }
    },
    [doc, toast],
  )

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    void addFiles(e.target.files)
    e.currentTarget.value = ''
  }

  function onDropFiles(e: React.DragEvent) {
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault()
      void addFiles(e.dataTransfer.files)
    }
  }

  function removePage(index: number) {
    const page = doc.pages[index]
    if (page) forgetThumb(pageThumbKey(page))
    setDoc((d) => deletePage(d, index))
  }

  function reorder(from: number, to: number) {
    setDoc((d) => movePage(d, from, to))
  }

  function nudge(index: number, delta: -1 | 1) {
    setDoc((d) => movePageByDelta(d, index, delta))
  }

  async function save() {
    if (!canExport(doc) || saving) return
    setSaving(true)
    try {
      const { blob, skipped } = await assemble(doc)
      downloadBlob(blob, exportName())
      if (skipped.length > 0) {
        toast.show({
          message: `PDF guardado, pero se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      } else {
        toast.show({ message: 'PDF guardado.', tone: 'success' })
      }
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo guardar el PDF.',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const total = doc.pages.length
  const empty = total === 0

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="section-eyebrow text-ink-400">editor de pdf</p>
        <p className="text-caption text-ink-500 max-w-prose">
          Combina PDFs e imágenes en un documento. Reordena o elimina páginas y guárdalo
          como un PDF nuevo. Todo ocurre en tu navegador: nada se sube.
        </p>
      </header>

      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <UploadIcon size={13} />
          {busy ? 'Agregando…' : 'Agregar PDF o imagen'}
        </button>
        <div className="flex-1" />
        {!empty && (
          <span className="text-micro text-ink-300 tabular-nums">
            {total} {total === 1 ? 'página' : 'páginas'}
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={empty || saving || busy}
          className="btn-ink text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <DownloadIcon size={13} />
          {saving ? 'Guardando…' : 'Guardar PDF'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={onFileInput}
        />
      </div>

      {empty ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFiles}
          className="w-full rounded-xl border border-dashed border-ink-200/80 bg-paper-50/50 px-6 py-14 flex flex-col items-center justify-center gap-3 text-center hover:border-ink-300 transition-colors"
        >
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-ink-100"
            style={{ color: ACCENT }}
          >
            <FilePdfIcon size={22} />
          </span>
          <span className="text-body text-ink-600">
            Arrastra PDFs o imágenes aquí, o haz clic para elegir.
          </span>
          <span className="text-micro text-ink-300">
            Cada PDF se abre por páginas; cada imagen es una página.
          </span>
        </button>
      ) : (
        <ul
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFiles}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {doc.pages.map((page, index) => (
            <PageCard
              key={page.id}
              doc={doc}
              page={page}
              index={index}
              total={total}
              dragging={dragIndex === index}
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDropOn={() => {
                if (dragIndex !== null) reorder(dragIndex, index)
                setDragIndex(null)
              }}
              onNudge={nudge}
              onDelete={removePage}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function PageCard({
  doc,
  page,
  index,
  total,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
  onNudge,
  onDelete,
}: {
  doc: PdfDoc
  page: PdfPage
  index: number
  total: number
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
  onNudge: (index: number, delta: -1 | 1) => void
  onDelete: (index: number) => void
}) {
  const source = getSource(doc, page.sourceId)
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    if (!source) return
    let alive = true
    if (page.kind === 'image') {
      // La imagen entera es la página: object URL directo (lo posee la card).
      const url = URL.createObjectURL(source.file)
      setThumb(url)
      return () => {
        alive = false
        URL.revokeObjectURL(url)
      }
    }
    // Página de PDF: render con pdf.js (el cache posee/revoca el URL).
    setThumb(null)
    renderPageThumb(source.file, page.pageIndex, pageThumbKey(page))
      .then((url) => {
        if (alive) setThumb(url)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [page, source])

  if (!source) return null
  const KindIcon = page.kind === 'pdf' ? FilePdfIcon : FileIcon

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropOn()
      }}
      className={`group flex flex-col rounded-lg border bg-paper-50 overflow-hidden transition-shadow ${
        dragging ? 'opacity-40 border-ink-300' : 'border-ink-100 hover:shadow-sm'
      }`}
    >
      {/* Miniatura */}
      <div className="relative aspect-[3/4] bg-ink-50/40 flex items-center justify-center cursor-grab active:cursor-grabbing">
        {thumb ? (
          <img
            src={thumb}
            alt={`Página ${index + 1}`}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="text-micro text-ink-300">cargando…</span>
        )}
        <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded bg-ink-900/65 px-1.5 py-0.5 text-micro tabular-nums text-paper-50">
          <KindIcon size={10} />
          {index + 1}
        </span>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between gap-0.5 px-1 py-1 border-t border-ink-100/70">
        <button
          type="button"
          onClick={() => onNudge(index, -1)}
          disabled={index === 0}
          aria-label="Mover página a la izquierda"
          title="Mover a la izquierda"
          className="touch-target flex items-center justify-center rounded text-ink-400 hover:text-ink-800 disabled:opacity-25 disabled:hover:text-ink-400 transition-colors"
        >
          <ChevronLeftIcon size={15} />
        </button>
        <button
          type="button"
          onClick={() => onNudge(index, 1)}
          disabled={index === total - 1}
          aria-label="Mover página a la derecha"
          title="Mover a la derecha"
          className="touch-target flex items-center justify-center rounded text-ink-400 hover:text-ink-800 disabled:opacity-25 disabled:hover:text-ink-400 transition-colors"
        >
          <ChevronRightIcon size={15} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(index)}
          aria-label="Eliminar página"
          title="Eliminar página"
          className="touch-target flex items-center justify-center rounded text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
        >
          <TrashIcon size={14} />
        </button>
      </div>
    </li>
  )
}
