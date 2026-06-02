import { useRef } from 'react'
import type { NotasAttachmentOwner } from '../../api'
import {
  useNotasAttachmentsQuery,
  useUploadNotasAttachment,
  useDeleteNotasAttachment,
  useToast,
} from '../../state'
import { CameraIcon, TrashIcon } from '../Icons'

/**
 * Tira de fotos asociada a un "dueño" de anexos: una semana (`week` + lunes) o
 * una tarea (`task` + id). Miniaturas + un botón sutil para adjuntar; solo
 * imágenes. Consulta al montarse, así que la carga perezosa se logra montándola
 * solo cuando se quiere ver (el padre decide).
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

  function onFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || upload.isPending) return
    if (!file.type.startsWith('image/')) {
      toast.show({ message: 'Solo imágenes por ahora.', tone: 'error' })
      return
    }
    upload.mutate(
      { ownerType, ownerId, file },
      {
        onSuccess: () => toast.show({ message: 'Foto guardada.', tone: 'success' }),
        onError: (err) =>
          toast.show({
            message: err instanceof Error ? err.message : 'No se pudo subir',
            tone: 'error',
          }),
      },
    )
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
        <span key={p.id} className="group/photo relative">
          <a href={p.url} target="_blank" rel="noreferrer" title={p.fileName}>
            <img
              src={p.url}
              alt={p.fileName}
              className="size-14 rounded-md object-cover border border-ink-100/70"
              loading="lazy"
            />
          </a>
          <button
            onClick={() => remove.mutate({ id: p.id, ownerType, ownerId })}
            aria-label={`Quitar foto ${p.fileName}`}
            title="Quitar"
            className="absolute -top-1.5 -right-1.5 size-5 inline-flex items-center justify-center rounded-full bg-paper-50 border border-ink-100 text-ink-300 hover:text-[color:var(--accent-clay)] opacity-0 group-hover/photo:opacity-100 focus:opacity-100 transition-opacity"
          >
            <TrashIcon size={11} />
          </button>
        </span>
      ))}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="touch-target p-1.5 rounded-md text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        title="Adjuntar foto"
        aria-label="Adjuntar foto"
      >
        <CameraIcon size={16} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  )
}
