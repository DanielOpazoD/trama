import { useRef, useState } from 'react'
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
import { apiFetch } from '../../api/request'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { CameraIcon, TrashIcon, DownloadIcon, FilePdfIcon, PencilIcon } from '../Icons'

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
}: {
  ownerType: NotasAttachmentOwner
  ownerId: string
  /** Nombre para el archivo PDF exportado (título de la tarea / rango de semana). */
  title?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const query = useNotasAttachmentsQuery({ ownerType, ownerId })
  const upload = useUploadNotasAttachment()
  const remove = useDeleteNotasAttachment()
  const [exporting, setExporting] = useState<'all' | 'pdf' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Si la próxima selección debe pasar por el editor (botón "adjuntar y editar").
  const editOnAddRef = useRef(false)

  const photos = (query.data ?? []).filter((a) => a.mimeType.startsWith('image/'))

  function pickFiles(editFirst: boolean) {
    editOnAddRef.current = editFirst
    inputRef.current?.click()
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || upload.isPending) return
    const editFirst = editOnAddRef.current
    editOnAddRef.current = false
    const picked = Array.from(files)
    const images = picked.filter((f) => f.type.startsWith('image/'))
    const skipped = picked.length - images.length

    if (images.length === 0) {
      toast.show({ message: 'Solo imágenes por ahora.', tone: 'error' })
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    // Subimos en serie: (opcional) editor → compresión → upload. Cada éxito
    // invalida la query, así la tira se va poblando.
    let ok = 0
    for (const original of images) {
      try {
        let chosen = original
        if (editFirst) {
          const edited = await editImage(original, {
            outputType: 'image/webp',
            title: 'editar foto',
          })
          if (edited === null) continue // canceló esta imagen
          chosen = edited
        }
        const file = await compressImage(chosen)
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

  // Editar una foto YA guardada: baja el blob → editor → sube la nueva + borra
  // la vieja (la tira se refresca sola).
  async function editExisting(photo: NotasAttachment) {
    if (editingId) return
    setEditingId(photo.id)
    try {
      const res = await apiFetch(photo.url)
      if (!res.ok) throw new Error('No se pudo bajar la imagen')
      const original = new File([await res.blob()], photo.fileName, {
        type: photo.mimeType,
      })
      const edited = await editImage(original, {
        outputType: 'image/webp',
        title: 'editar foto',
      })
      if (edited && edited !== original) {
        const file = await compressImage(edited)
        await upload.mutateAsync({ ownerType, ownerId, file })
        await remove.mutateAsync({ id: photo.id, ownerType, ownerId })
        toast.show({ message: 'Foto editada.', tone: 'success' })
      }
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo editar',
        tone: 'error',
      })
    } finally {
      setEditingId(null)
    }
  }

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
      {photos.map((p) => (
        <PhotoThumb
          key={p.id}
          photo={p}
          editing={editingId === p.id}
          onEdit={() => editExisting(p)}
          onRemove={() => remove.mutate({ id: p.id, ownerType, ownerId })}
        />
      ))}

      <button
        onClick={() => pickFiles(false)}
        disabled={upload.isPending}
        className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        title="Adjuntar fotos"
        aria-label="Adjuntar fotos"
      >
        <CameraIcon size={16} />
      </button>
      <button
        onClick={() => pickFiles(true)}
        disabled={upload.isPending}
        className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        title="Adjuntar y editar"
        aria-label="Adjuntar y editar fotos"
      >
        {/* Cámara + badge de lápiz = "adjuntar y retocar"; el lápiz solo (en las
            miniaturas) queda reservado para "editar esta foto ya guardada". */}
        <span className="relative inline-flex">
          <CameraIcon size={16} />
          <span className="absolute -bottom-1 -right-1.5 rounded-full bg-paper-50 p-px leading-none">
            <PencilIcon size={8} />
          </span>
        </span>
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
            <DownloadIcon size={16} />
          </button>
          <button
            onClick={onExportPdf}
            disabled={exporting !== null}
            className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
            title="Exportar a PDF (2 por hoja)"
            aria-label="Exportar fotos a PDF"
          >
            <FilePdfIcon size={16} />
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
    </div>
  )
}

/**
 * Una miniatura. El blob vive detrás de un endpoint autenticado, así que NO se
 * puede usar como `<img src>` directo (el browser no manda el bearer de Clerk →
 * 401). Lo bajamos con apiFetch y lo servimos como object-URL vía el hook
 * compartido; mientras viaja, una caja de papel; si falla, queda esa caja.
 */
function PhotoThumb({
  photo,
  editing,
  onEdit,
  onRemove,
}: {
  photo: NotasAttachment
  editing: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const { src, status } = useAuthenticatedMediaState(photo.url)
  const ready = status === 'ready' && !!src

  return (
    <span className="group/photo relative">
      {ready ? (
        <a href={src} target="_blank" rel="noreferrer" title={photo.fileName}>
          <img
            src={src}
            alt={photo.fileName}
            className="size-14 rounded-md object-cover border border-ink-100/70"
          />
        </a>
      ) : (
        <span
          aria-hidden
          title={status === 'error' ? 'No se pudo cargar' : photo.fileName}
          className={`block size-14 rounded-md border border-ink-100/70 ${
            status === 'error' ? 'bg-paper-100/60' : 'skeleton-shimmer'
          }`}
        />
      )}
      <button
        onClick={onEdit}
        disabled={editing}
        aria-label={`Editar foto ${photo.fileName}`}
        title="Editar"
        className="absolute -top-1.5 -left-1.5 size-5 inline-flex items-center justify-center rounded-full bg-paper-50 border border-ink-100 text-ink-300 hover:text-ink-700 opacity-0 group-hover/photo:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-100 disabled:animate-pulse"
      >
        <PencilIcon size={10} />
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
