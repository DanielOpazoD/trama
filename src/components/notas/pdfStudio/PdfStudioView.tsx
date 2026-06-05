import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addImageSource,
  addPdfSource,
  applyEdits,
  canExport,
  deletePage,
  deletePages,
  duplicatePages,
  emptyDoc,
  getSource,
  movePage,
  movePageByDelta,
  normalizeDoc,
  pageHasAnnotations,
  pageThumbKey,
  reseedIds,
  rotatePage,
  rotatePages,
  subsetDoc,
  type Annotation,
  type PdfDoc,
  type PdfPage,
} from '../../../lib/pdfStudio/model'
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '../../../lib/pdfStudio/history'
import {
  disposePdfStudio,
  forgetThumb,
  getPdfPageCount,
  renderPageThumb,
} from '../../../lib/pdfStudio/pdfRender'
import { assemble } from '../../../lib/pdfStudio/assemble'
import { printPdfBlob } from '../../../lib/pdfStudio/printPdf'
import { clearDraft, loadDraft, saveDraft } from '../../../lib/pdfStudio/persistence'
import { downloadBlob } from '../../../lib/downloadBlob'
import { useCurrentClientUserId } from '../../../lib/clientIdentity'
import { BulkBar } from './BulkBar'
import { PdfTextEditor } from './PdfTextEditor'
import { OverflowMenu, OverflowMenuItem } from '../../OverflowMenu'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  DuplicateIcon,
  FileIcon,
  FilePdfIcon,
  PrinterIcon,
  RedoIcon,
  RotateIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
} from '../../Icons'
import { useToast } from '../../../state'

const ACCENT = 'var(--accent-sage)'
const ACCEPT = 'application/pdf,image/*'

/** Botón de control de la miniatura (reordenar/rotar/texto). */
const ctrlBtn =
  'touch-target inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink-400 transition-colors'

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Nombre de archivo del PDF exportado, con fecha local para no pisar descargas. */
function exportName(kind?: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `trama-${kind ? `${kind}-` : ''}${stamp}.pdf`
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
  // El documento vive detrás de un historial (undo/redo). `doc` = presente.
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const [busy, setBusy] = useState(false) // importando
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [textPage, setTextPage] = useState<number | null>(null)
  // Selección múltiple de páginas (por ID → sobrevive reordenar/borrar). El ancla
  // recuerda el último clic para seleccionar rangos con Shift.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const anchorRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Borrador autoguardado por usuario (sin Clerk, `getCurrentClientUserId` es
  // null → clave 'anon'). `loaded` evita autoguardar antes de restaurar.
  const userKey = useCurrentClientUserId() ?? 'anon'
  const [loaded, setLoaded] = useState(false)
  // `toast` cambia de referencia al mostrarse uno (el contexto lleva el actual);
  // se accede por ref para que el efecto de carga NO se re-dispare en loop.
  const toastRef = useRef(toast)
  toastRef.current = toast

  /** Aplica un cambio al documento y lo registra en el historial. */
  const commit = useCallback((next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => {
    setHistory((h) => {
      const value = typeof next === 'function' ? next(h.present) : next
      return pushHistory(h, value)
    })
  }, [])

  // Al desmontar la sección, libera las miniaturas/documentos de pdf.js.
  useEffect(() => () => disposePdfStudio(), [])

  // Al montar: restaura el borrador autoguardado del usuario (si tiene páginas).
  // `reseedIds` continúa el contador de ids para no colisionar tras recargar.
  useEffect(() => {
    let alive = true
    void loadDraft(userKey).then((loadedDoc) => {
      if (!alive) return
      if (loadedDoc && loadedDoc.pages.length > 0) {
        // Compat: anotaciones de borradores viejos (sin `kind`) → texto.
        const restored = normalizeDoc(loadedDoc)
        reseedIds(restored)
        setHistory(initHistory(restored))
        toastRef.current.show({
          message: 'Borrador del editor restaurado.',
          tone: 'success',
        })
      }
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [userKey])

  // Autoguardado debounced del documento de trabajo (tras restaurar).
  useEffect(() => {
    if (!loaded) return
    const t = window.setTimeout(() => void saveDraft(userKey, doc), 600)
    return () => window.clearTimeout(t)
  }, [doc, loaded, userKey])

  // Atajos: ⌘/Ctrl+Z deshace, ⌘/Ctrl+Shift+Z rehace (salvo en inputs o con el
  // editor de texto abierto, que tiene su propio estado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textPage !== null) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setSelectedIds((s) => (s.size > 0 ? new Set() : s))
        anchorRef.current = null
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [textPage])

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
        commit(next)
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
    [doc, toast, commit],
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

  // Libera las miniaturas de las páginas que se van, PERO sólo las que ningún
  // página sobreviviente sigue usando (los duplicados comparten `thumbKey`, así
  // que revocar a ciegas rompería la imagen del que queda).
  function forgetRemovedThumbs(indices: number[]) {
    const drop = new Set(indices)
    const surviving = new Set(doc.pages.filter((_, i) => !drop.has(i)).map(pageThumbKey))
    for (const i of indices) {
      const page = doc.pages[i]
      if (page && !surviving.has(pageThumbKey(page))) forgetThumb(pageThumbKey(page))
    }
  }

  function removePage(index: number) {
    forgetRemovedThumbs([index])
    commit((d) => deletePage(d, index))
  }

  function reorder(from: number, to: number) {
    commit((d) => movePage(d, from, to))
  }

  function nudge(index: number, delta: -1 | 1) {
    commit((d) => movePageByDelta(d, index, delta))
  }

  function rotate(index: number, delta: -1 | 1) {
    commit((d) => rotatePage(d, index, delta))
  }

  function duplicateOne(index: number) {
    commit((d) => duplicatePages(d, [index]))
  }

  // ── Selección múltiple + acciones en lote ────────────────────────────────
  // Índices (en orden de documento) de las páginas seleccionadas que aún existen.
  const selectedIndices = doc.pages.reduce<number[]>((acc, p, i) => {
    if (selectedIds.has(p.id)) acc.push(i)
    return acc
  }, [])
  const selectedCount = selectedIndices.length

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    anchorRef.current = null
  }, [])

  /** Alterna una página; con Shift selecciona el rango desde el último clic. */
  function toggleSelect(index: number, shift: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shift && anchorRef.current !== null) {
        const lo = Math.min(anchorRef.current, index)
        const hi = Math.max(anchorRef.current, index)
        for (let i = lo; i <= hi; i++) {
          const id = doc.pages[i]?.id
          if (id) next.add(id)
        }
      } else {
        const id = doc.pages[index]?.id
        if (id) {
          if (next.has(id)) next.delete(id)
          else next.add(id)
        }
      }
      return next
    })
    anchorRef.current = index
  }

  function bulkRotate(delta: -1 | 1) {
    if (selectedCount > 0) commit((d) => rotatePages(d, selectedIndices, delta))
  }

  function bulkDuplicate() {
    if (selectedCount > 0) commit((d) => duplicatePages(d, selectedIndices))
  }

  function bulkDelete() {
    if (selectedCount === 0) return
    forgetRemovedThumbs(selectedIndices)
    commit((d) => deletePages(d, selectedIndices))
    clearSelection()
  }

  async function extractSelected() {
    if (selectedCount === 0 || saving || busy) return
    setSaving(true)
    try {
      const { blob, skipped } = await assemble(subsetDoc(doc, selectedIndices))
      downloadBlob(blob, exportName('extracto'))
      toast.show({
        message: skipped.length
          ? `Extraído, pero se saltearon ${skipped.length} archivo(s): ${skipped
              .map((s) => s.name)
              .join(', ')}.`
          : `${selectedCount} página(s) extraídas a un PDF nuevo.`,
        tone: skipped.length ? 'error' : 'success',
      })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo extraer.',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  /** Empieza un documento nuevo (descarta el borrador; es deshacible). */
  function newDoc() {
    commit(emptyDoc())
    clearSelection()
    void clearDraft(userKey)
  }

  function closeTextEditor(edits: Record<number, Annotation[]> | null) {
    // El editor permite navegar y editar varias páginas; entrega un mapa
    // índice→anotaciones de las páginas que tocó. Se confirman todas juntas.
    if (edits && Object.keys(edits).length > 0) {
      commit((d) => applyEdits(d, edits))
    }
    setTextPage(null)
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

  /**
   * Imprime el documento (o un subconjunto de páginas) abriéndolo en un iframe
   * oculto. `indices` undefined → todo; si no, sólo esas páginas (en orden de
   * documento). El navegador muestra su propio diálogo/preview de impresión.
   */
  async function printPages(indices?: number[]) {
    if (printing || saving || busy) return
    const target = indices ? subsetDoc(doc, indices) : doc
    if (target.pages.length === 0) return
    setPrinting(true)
    try {
      const { blob, skipped } = await assemble(target)
      printPdfBlob(blob)
      if (skipped.length > 0) {
        toast.show({
          message: `Enviado a imprimir, pero se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      }
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo imprimir.',
        tone: 'error',
      })
    } finally {
      setPrinting(false)
    }
  }

  const total = doc.pages.length
  const empty = total === 0
  const undoable = canUndo(history)
  const redoable = canRedo(history)

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="section-eyebrow text-ink-400">editor de pdf</p>
        <p className="text-caption text-ink-500 max-w-prose">
          Combina PDFs e imágenes en un documento. Reordena, rota, agrega texto o elimina
          páginas, y guárdalo como un PDF nuevo. Todo ocurre en tu navegador: nada se
          sube.
        </p>
      </header>

      {/* Barra de acciones: izquierda (agregar · historial) — derecha (contador · guardar) */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <UploadIcon size={13} />
            {busy ? 'Agregando…' : 'Agregar PDF o imagen'}
          </button>
          {(undoable || redoable) && (
            <div className="inline-flex items-center rounded-md border border-ink-100 bg-paper-50 overflow-hidden divide-x divide-ink-100">
              <button
                type="button"
                onClick={() => setHistory((h) => undo(h))}
                disabled={!undoable}
                aria-label="Deshacer"
                title="Deshacer (⌘Z)"
                className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
              >
                <UndoIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setHistory((h) => redo(h))}
                disabled={!redoable}
                aria-label="Rehacer"
                title="Rehacer (⌘⇧Z)"
                className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
              >
                <RedoIcon size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!empty && (
            <span className="text-micro text-ink-300 tabular-nums">
              {total} {total === 1 ? 'página' : 'páginas'}
            </span>
          )}
          {!empty && (
            <button
              type="button"
              onClick={newDoc}
              title="Empezar un documento nuevo (descarta el borrador; deshacible)"
              className="btn-ghost text-xs"
            >
              Nuevo
            </button>
          )}
          {!empty && (
            <button
              type="button"
              onClick={() => printPages()}
              disabled={saving || busy || printing}
              title="Imprimir todo el documento"
              className="btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <PrinterIcon size={13} />
              {printing ? 'Imprimiendo…' : 'Imprimir'}
            </button>
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
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={onFileInput}
        />
      </div>

      {selectedCount > 0 && (
        <BulkBar
          count={selectedCount}
          total={total}
          busy={saving || busy || printing}
          onRotate={bulkRotate}
          onDuplicate={bulkDuplicate}
          onExtract={extractSelected}
          onPrint={() => printPages(selectedIndices)}
          onDelete={bulkDelete}
          onSelectAll={() => setSelectedIds(new Set(doc.pages.map((p) => p.id)))}
          onClear={clearSelection}
        />
      )}

      {empty ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFiles}
          className="group w-full rounded-2xl border border-dashed border-ink-200 bg-paper-50/40 px-6 py-16 flex flex-col items-center justify-center gap-4 text-center transition-colors hover:border-ink-300 hover:bg-paper-50/70"
        >
          <span
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
            style={{ backgroundColor: 'var(--accent-primary-soft)', color: ACCENT }}
          >
            <FilePdfIcon size={26} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-body font-medium text-ink-700">
              Arrastra PDFs o imágenes aquí
            </span>
            <span className="text-caption text-ink-400">
              o haz clic para elegir archivos
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-ink-400">
            {['PDF', 'JPG', 'PNG'].map((t) => (
              <span key={t} className="rounded bg-ink-100/60 px-1.5 py-0.5">
                {t}
              </span>
            ))}
          </span>
        </button>
      ) : (
        <ul
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFiles}
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5"
        >
          {doc.pages.map((page, index) => (
            <PageCard
              key={page.id}
              doc={doc}
              page={page}
              index={index}
              total={total}
              selected={selectedIds.has(page.id)}
              dragging={dragIndex === index}
              isDropTarget={
                dragIndex !== null && dragOverIndex === index && dragIndex !== index
              }
              onToggleSelect={(shift) => toggleSelect(index, shift)}
              onDragStart={() => setDragIndex(index)}
              onDragEnterCard={() => setDragOverIndex(index)}
              onDragEnd={() => {
                setDragIndex(null)
                setDragOverIndex(null)
              }}
              onDropOn={() => {
                if (dragIndex !== null) reorder(dragIndex, index)
                setDragIndex(null)
                setDragOverIndex(null)
              }}
              onNudge={nudge}
              onRotate={(delta) => rotate(index, delta)}
              onDuplicate={() => duplicateOne(index)}
              onPrint={() => printPages([index])}
              onDelete={removePage}
              onOpenText={() => setTextPage(index)}
            />
          ))}
        </ul>
      )}

      {textPage !== null && (
        <PdfTextEditor doc={doc} pageIndex={textPage} onClose={closeTextEditor} />
      )}
    </section>
  )
}

function PageCard({
  doc,
  page,
  index,
  total,
  selected,
  dragging,
  isDropTarget,
  onToggleSelect,
  onDragStart,
  onDragEnterCard,
  onDragEnd,
  onDropOn,
  onNudge,
  onRotate,
  onDuplicate,
  onPrint,
  onDelete,
  onOpenText,
}: {
  doc: PdfDoc
  page: PdfPage
  index: number
  total: number
  selected: boolean
  dragging: boolean
  isDropTarget: boolean
  onToggleSelect: (shift: boolean) => void
  onDragStart: () => void
  onDragEnterCard: () => void
  onDragEnd: () => void
  onDropOn: () => void
  onNudge: (index: number, delta: -1 | 1) => void
  onRotate: (delta: -1 | 1) => void
  onDuplicate: () => void
  onPrint: () => void
  onDelete: (index: number) => void
  onOpenText: () => void
}) {
  const source = getSource(doc, page.sourceId)
  const [thumb, setThumb] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)

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

  // Rotación visual de la miniatura. En 90°/270° se reescala para que la imagen
  // rotada entre en la caja CUADRADA (depende solo de los aspectos, no de px).
  const rot = ((page.rotationQuarters % 4) + 4) % 4
  let thumbTransform = `rotate(${rot * 90}deg)`
  if (rot % 2 === 1 && nat) {
    const s0 = Math.min(1 / nat.w, 1 / nat.h)
    const dw = nat.w * s0
    const dh = nat.h * s0
    thumbTransform += ` scale(${Math.min(1 / dh, 1 / dw)})`
  }

  return (
    <li
      draggable
      tabIndex={0}
      aria-label={`Página ${index + 1} de ${total}. Flechas izquierda/derecha para reordenar.`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnter={onDragEnterCard}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropOn()
      }}
      onKeyDown={(e) => {
        // Reordenar por teclado cuando la card (no un control interno) tiene foco.
        if (e.target !== e.currentTarget) return
        if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault()
          onNudge(index, -1)
        } else if (e.key === 'ArrowRight' && index < total - 1) {
          e.preventDefault()
          onNudge(index, 1)
        }
      }}
      style={isDropTarget || selected ? { boxShadow: `0 0 0 2px ${ACCENT}` } : undefined}
      className={`group flex flex-col rounded-lg border bg-paper-50 overflow-hidden transition-all duration-150 ${
        dragging
          ? 'opacity-40 scale-[0.97] border-ink-300'
          : isDropTarget || selected
            ? 'border-transparent'
            : 'border-ink-100 hover:border-ink-200 hover:shadow-md hover:shadow-ink-900/5'
      }`}
    >
      {/* Miniatura — doble clic la abre grande (ver y editar) */}
      <div
        onDoubleClick={onOpenText}
        title="Doble clic para ver y editar"
        className="relative aspect-square min-h-0 bg-ink-100/30 flex items-center justify-center cursor-grab active:cursor-grabbing p-1.5"
      >
        {thumb ? (
          <img
            src={thumb}
            alt={`Página ${index + 1}`}
            onLoad={(e) =>
              setNat({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="max-h-full max-w-full object-contain transition-transform duration-200"
            style={{
              transform: thumbTransform,
              boxShadow: '0 1px 5px rgb(0 0 0 / 0.12)',
            }}
            draggable={false}
          />
        ) : (
          <span
            aria-label="cargando"
            className="h-6 w-6 rounded-full border-2 border-ink-100 border-t-ink-300 animate-spin"
          />
        )}
        <button
          type="button"
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(e.shiftKey)
          }}
          aria-pressed={selected}
          aria-label={
            selected
              ? `Deseleccionar página ${index + 1}`
              : `Seleccionar página ${index + 1}`
          }
          title={selected ? 'Deseleccionar' : 'Seleccionar (Shift: rango)'}
          className={`absolute top-1 left-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro tabular-nums text-paper-50 transition-colors ${
            selected ? '' : 'bg-ink-900/65 hover:bg-ink-900/85'
          }`}
          style={selected ? { backgroundColor: ACCENT } : undefined}
        >
          {selected ? <CheckIcon size={10} /> : <KindIcon size={10} />}
          {index + 1}
        </button>
        {pageHasAnnotations(page) && (
          <span
            className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-micro tabular-nums text-paper-50"
            style={{ backgroundColor: ACCENT }}
            title="Tiene texto"
          >
            <TextIcon size={9} />
            {page.annotations.length}
          </span>
        )}
      </div>

      {/* Controles: reordenar · acciones */}
      <div className="flex items-center justify-between px-1 py-1 border-t border-ink-100/70">
        <div className="inline-flex items-center">
          <button
            type="button"
            onClick={() => onNudge(index, -1)}
            disabled={index === 0}
            aria-label="Mover página a la izquierda"
            title="Mover a la izquierda"
            className={ctrlBtn}
          >
            <ChevronLeftIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => onNudge(index, 1)}
            disabled={index === total - 1}
            aria-label="Mover página a la derecha"
            title="Mover a la derecha"
            className={ctrlBtn}
          >
            <ChevronRightIcon size={15} />
          </button>
        </div>
        <OverflowMenu
          label={`Acciones de la página ${index + 1}`}
          width="w-48"
          triggerClassName={ctrlBtn}
        >
          {(close) => (
            <>
              <OverflowMenuItem
                onClick={() => {
                  onOpenText()
                  close()
                }}
              >
                <TextIcon size={13} />{' '}
                {pageHasAnnotations(page) ? 'Editar texto' : 'Agregar texto'}
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onRotate(1)
                  close()
                }}
              >
                <RotateIcon size={13} /> Rotar a la derecha
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onRotate(-1)
                  close()
                }}
              >
                <span className="inline-flex" style={{ transform: 'scaleX(-1)' }}>
                  <RotateIcon size={13} />
                </span>{' '}
                Rotar a la izquierda
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onDuplicate()
                  close()
                }}
              >
                <DuplicateIcon size={13} /> Duplicar página
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onPrint()
                  close()
                }}
              >
                <PrinterIcon size={13} /> Imprimir página
              </OverflowMenuItem>
              <OverflowMenuItem
                danger
                onClick={() => {
                  onDelete(index)
                  close()
                }}
              >
                <TrashIcon size={13} /> Eliminar página
              </OverflowMenuItem>
            </>
          )}
        </OverflowMenu>
      </div>
    </li>
  )
}
