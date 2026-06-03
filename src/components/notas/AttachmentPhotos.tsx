import { useRef } from 'react'
import type { NotasAttachment, NotasAttachmentOwner } from '../../api'
import {
  useNotasAttachmentsQuery,
  useUploadNotasAttachment,
  useDeleteNotasAttachment,
  useToast,
} from '../../state'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { CameraIcon, TrashIcon } from '../Icons'

/**
 * Tira de fotos asociada a un "dueño" de anexos: una semana (`week` + lunes) o
 * una tarea (`task` + id). Miniaturas + un botón sutil para adjuntar; solo
 * imágenes, y se pueden subir varias a la vez. Consulta al montarse, así que la
 * carga perezosa se logra montándola solo cuando se quiere ver (el padre decide).
 */
export function AttachmentPhotos({
  ownerType,
  ownerId,
}: {
  ownerType: NotasAttachmentOwner
  ownerId: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const query = useNotasAttachmentsQuery({ ownerType, ownerId })
  const upload = useUploadNotasAttachment()
  const remove = useDeleteNotasAttachment()

  const photos = (query.data ?? []).filter((a) => a.mimeType.startsWith('image/'))

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

    // Subimos en serie: cada éxito invalida la query y la tira se va poblando.
    let ok = 0
    for (const file of images) {
      try {
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
          onRemove={() => remove.mutate({ id: p.id, ownerType, ownerId })}
        />
      ))}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        title="Adjuntar fotos"
        aria-label="Adjuntar fotos"
      >
        <CameraIcon size={16} />
      </button>

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
  onRemove,
}: {
  photo: NotasAttachment
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
