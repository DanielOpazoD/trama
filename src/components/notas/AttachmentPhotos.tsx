import { useEffect, useRef, useState } from 'react'
import type { NotasAttachment, NotasAttachmentOwner } from '../../api'
import {
  useNotasAttachmentsQuery,
  useUploadNotasAttachment,
  useDeleteNotasAttachment,
  useToast,
} from '../../state'
import { compressImage } from '../../lib/imageCompression'
import { editImage } from '../../lib/imageEditor'
import { downloadAllImages, exportImagesToPdf } from '../../lib/photoExport'
import { requestBlob } from '../../api/request'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { CameraIcon, TrashIcon, DownloadIcon, FilePdfIcon } from '../Icons'
import { AttachmentLightbox } from './AttachmentLightbox'

/**
 * Tira de fotos asociada a un "dueño" de anexos: una semana (`week` + lunes) o
 * una tarea (`task` + id). Miniaturas + botones sutiles para adjuntar (1+
 * imágenes, comprimidas en el cliente), descargar todas, o exportarlas a PDF.
 * Consulta al montarse, así que la carga perezosa se logra montándola solo
 * cuando se quiere ver (el padre decide).
 */
export function AttachmentPhotos({
  ownerType,
  ownerId,
  title,
  compact = false,
}: {
  ownerType: NotasAttachmentOwner
  ownerId: string
  /** Nombre para el archivo PDF exportado (título de la tarea / rango de semana). */
  title?: string
  /**
   * Modo compacto (notas): solo un ícono de fotos —si hay— que abre el visor
   * (con editor); sin tira de miniaturas, adjuntar, descargar ni PDF. La gestión
   * de archivos de la nota vive en su panel de Anexos.
   */
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const query = useNotasAttachmentsQuery({ ownerType, ownerId })
  const upload = useUploadNotasAttachment()
  const remove = useDeleteNotasAttachment()
  const [exporting, setExporting] = useState<'all' | 'pdf' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Visor: índice de la foto abierta (null = cerrado). Mientras el editor está
  // abierto encima, `editorOpen` pausa las teclas del visor; al terminar,
  // `focusAfterEditId` reposiciona el visor sobre el resultado.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [focusAfterEditId, setFocusAfterEditId] = useState<string | null>(null)

  const photos = (query.data ?? []).filter((a) => a.mimeType.startsWith('image/'))

  function pickFiles() {
    inputRef.current?.click()
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || upload.isPending) return
    const picked = Array.from(files)
    const images = picked.filter((f) => f.type.startsWith('image/'))
    const skipped = picked.length - images.length

    if (images.length === 0) {
      toast.show({ message: 'Solo imágenes por ahora.', tone: 'error' })
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    // Subimos en serie: compresión → upload. Cada éxito invalida la query, así
    // la tira se va poblando. (Para editar, se abre la imagen en el visor.)
    let ok = 0
    for (const original of images) {
      try {
        const file = await compressImage(original)
        await upload.mutateAsync({ ownerType, ownerId, file })
        ok++
      } catch (err) {
        toast.show({
          message: err instanceof Error ? err.message : 'No se pudo subir',
          tone: 'error',
        })
      }
    }

    if (ok > 0) {
      toast.show({
        message: ok === 1 ? 'Foto guardada.' : `${ok} fotos guardadas.`,
        tone: 'success',
      })
    }
    if (skipped > 0) {
      toast.show({
        message: `${skipped} archivo(s) no eran imágenes y se omitieron.`,
        tone: 'error',
      })
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  // Editar una foto ya guardada: baja el blob → editor → sube la nueva + borra
  // la vieja. Devuelve el id del anexo creado (para reposicionar el visor sobre
  // él) o null si no hubo cambios / error.
  async function runEdit(photo: NotasAttachment): Promise<string | null> {
    try {
      const original = new File([await requestBlob(photo.url)], photo.fileName, {
        type: photo.mimeType,
      })
      const edited = await editImage(original, {
        outputType: 'image/webp',
        title: 'editar foto',
      })
      if (!edited || edited === original) return null // canceló o sin cambios
      const file = await compressImage(edited)
      const created = await upload.mutateAsync({ ownerType, ownerId, file })
      await remove.mutateAsync({ id: photo.id, ownerType, ownerId })
      toast.show({ message: 'Foto editada.', tone: 'success' })
      return created?.id ?? null
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo editar',
        tone: 'error',
      })
      return null
    }
  }

  // Disparado por el botón "editar" del visor: edita la foto abierta. Marca
  // `editorOpen` para que el visor ignore las teclas mientras el editor está
  // encima, y agenda reposicionar el visor sobre el resultado.
  async function editFromViewer() {
    if (editingId || viewerIndex === null) return
    const photo = photos[viewerIndex]
    if (!photo) return
    setEditingId(photo.id)
    setEditorOpen(true)
    try {
      const newId = await runEdit(photo)
      if (newId) setFocusAfterEditId(newId)
    } finally {
      setEditorOpen(false)
      setEditingId(null)
    }
  }

  // Tras editar, reposiciona el visor sobre la foto resultante cuando aparece en
  // la lista (sin reabrirlo si el usuario lo cerró entretanto).
  useEffect(() => {
    if (!focusAfterEditId) return
    const i = photos.findIndex((p) => p.id === focusAfterEditId)
    if (i >= 0) {
      setViewerIndex((prev) => (prev === null ? null : i))
      setFocusAfterEditId(null)
    }
  }, [photos, focusAfterEditId])

  // Mantiene el índice del visor válido si la lista se achica (p. ej. al borrar).
  useEffect(() => {
    setViewerIndex((prev) => {
      if (prev === null) return null
      if (photos.length === 0) return null
      return prev >= photos.length ? photos.length - 1 : prev
    })
  }, [photos.length])

  async function onDownloadAll() {
    if (exporting || photos.length === 0) return
    setExporting('all')
    try {
      await downloadAllImages(photos.map((p) => ({ url: p.url, fileName: p.fileName })))
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo descargar',
        tone: 'error',
      })
    } finally {
      setExporting(null)
    }
  }

  async function onExportPdf() {
    if (exporting || photos.length === 0) return
    setExporting('pdf')
    try {
      await exportImagesToPdf(
        photos.map((p) => ({ url: p.url, fileName: p.fileName })),
        title?.trim() || 'fotos',
      )
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo generar el PDF',
        tone: 'error',
      })
    } finally {
      setExporting(null)
    }
  }

  // Modo compacto (notas): solo el ícono de fotos —si hay— que abre el visor.
  if (compact) {
    if (photos.length === 0) return null
    return (
      <>
        <button
          type="button"
          onClick={() => setViewerIndex(0)}
          className="touch-target inline-flex items-center gap-1 p-1 rounded-md text-ink-300 hover:text-ink-700 transition-colors"
          title={photos.length === 1 ? 'Ver la foto' : `Ver las ${photos.length} fotos`}
          aria-label={`Ver fotos (${photos.length})`}
        >
          <CameraIcon size={14} />
          {photos.length > 1 && (
            <span className="text-micro tabular-nums">{photos.length}</span>
          )}
        </button>
        {viewerIndex !== null && (
          <AttachmentLightbox
            photos={photos}
            index={viewerIndex}
            onIndexChange={setViewerIndex}
            onClose={() => setViewerIndex(null)}
            onEdit={editFromViewer}
            editing={editingId !== null}
            interactive={!editorOpen}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap pt-1">
      {query.isLoading &&
        photos.length === 0 &&
        [0, 1].map((i) => (
          <span
            key={`sk-${i}`}
            aria-hidden
            className="size-14 rounded-md skeleton-shimmer"
          />
        ))}
      {photos.map((p, i) => (
        <PhotoThumb
          key={p.id}
          photo={p}
          onOpen={() => setViewerIndex(i)}
          onRemove={() => remove.mutate({ id: p.id, ownerType, ownerId })}
        />
      ))}

      <button
        onClick={pickFiles}
        disabled={upload.isPending}
        className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        title="Adjuntar fotos"
        aria-label="Adjuntar fotos"
      >
        <CameraIcon size={14} />
      </button>

      {photos.length > 0 && (
        <>
          <button
            onClick={onDownloadAll}
            disabled={exporting !== null}
            className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
            title={`Descargar ${photos.length === 1 ? 'la foto' : 'todas las fotos'}`}
            aria-label="Descargar todas las fotos"
          >
            <DownloadIcon size={14} />
          </button>
          <button
            onClick={onExportPdf}
            disabled={exporting !== null}
            className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
            title="Exportar a PDF (2 por hoja)"
            aria-label="Exportar fotos a PDF"
          >
            <FilePdfIcon size={14} />
          </button>
          {exporting && (
            <span className="text-micro text-ink-300">
              {exporting === 'pdf' ? 'generando PDF…' : 'descargando…'}
            </span>
          )}
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {viewerIndex !== null && (
        <AttachmentLightbox
          photos={photos}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onEdit={editFromViewer}
          editing={editingId !== null}
          interactive={!editorOpen}
        />
      )}
    </div>
  )
}

/**
 * Una miniatura. El blob vive detrás de un endpoint autenticado, así que NO se
 * puede usar como `<img src>` directo (el browser no manda el bearer de Clerk →
 * 401). Lo bajamos con requestBlob y lo servimos como object-URL vía el hook
 * compartido; mientras viaja, una caja de papel; si falla, queda esa caja.
 * Clic en la miniatura → abre el visor (donde se navega y se edita).
 */
function PhotoThumb({
  photo,
  onOpen,
  onRemove,
}: {
  photo: NotasAttachment
  onOpen: () => void
  onRemove: () => void
}) {
  const { src, status } = useAuthenticatedMediaState(photo.url)
  const ready = status === 'ready' && !!src

  return (
    <span className="group/photo relative">
      <button
        type="button"
        onClick={onOpen}
        title={photo.fileName}
        aria-label={`Ver foto ${photo.fileName}`}
        className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
        style={{ outlineColor: 'var(--accent-primary)' }}
      >
        {ready ? (
          <img
            src={src}
            alt={photo.fileName}
            className="size-14 rounded-md object-cover border border-ink-100/70"
          />
        ) : (
          <span
            aria-hidden
            className={`block size-14 rounded-md border border-ink-100/70 ${
              status === 'error' ? 'bg-paper-100/60' : 'skeleton-shimmer'
            }`}
          />
        )}
      </button>
      <button
        onClick={onRemove}
        aria-label={`Quitar foto ${photo.fileName}`}
        title="Quitar"
        className="absolute -top-1.5 -right-1.5 size-5 inline-flex items-center justify-center rounded-full bg-paper-50 border border-ink-100 text-ink-300 hover:text-[color:var(--accent-clay)] opacity-0 group-hover/photo:opacity-100 focus:opacity-100 transition-opacity"
      >
        <TrashIcon size={11} />
      </button>
    </span>
  )
}
