import { useRef } from 'react'
import {
  useNotasAttachmentsQuery,
  useUploadNotasAttachment,
  useDeleteNotasAttachment,
  useToast,
} from '../../state'
import { CameraIcon, TrashIcon } from '../Icons'

/**
 * Fotos asociadas a una SEMANA (Tareas). Reutiliza el sistema de anexos con
 * ownerType 'week' y ownerId = el lunes de la semana ('YYYY-MM-DD'). Muestra
 * miniaturas y un botón sutil para adjuntar; solo imágenes.
 */
export function WeekPhotos({ weekStart }: { weekStart: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const query = useNotasAttachmentsQuery({ ownerType: 'week', ownerId: weekStart })
  const upload = useUploadNotasAttachment()
  const remove = useDeleteNotasAttachment()

  const photos = (query.data ?? []).filter((a) => a.mimeType.startsWith('image/'))

  function pick() {
    inputRef.current?.click()
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || upload.isPending) return
    if (!file.type.startsWith('image/')) {
      toast.show({ message: 'Solo imágenes por ahora.', tone: 'error' })
      return
    }
    upload.mutate(
      { ownerType: 'week', ownerId: weekStart, file },
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
            onClick={() =>
              remove.mutate({ id: p.id, ownerType: 'week', ownerId: weekStart })
            }
            aria-label={`Quitar foto ${p.fileName}`}
            title="Quitar"
            className="absolute -top-1.5 -right-1.5 size-5 inline-flex items-center justify-center rounded-full bg-paper-50 border border-ink-100 text-ink-300 hover:text-[color:var(--accent-clay)] opacity-0 group-hover/photo:opacity-100 focus:opacity-100 transition-opacity"
          >
            <TrashIcon size={11} />
          </button>
        </span>
      ))}

      <button
        onClick={pick}
        disabled={upload.isPending}
        className="size-14 rounded-md border border-dashed border-ink-200 inline-flex flex-col items-center justify-center gap-0.5 text-ink-300 hover:text-ink-700 hover:border-ink-400 transition-colors disabled:opacity-50"
        title="Adjuntar foto a la semana"
        aria-label="Adjuntar foto a la semana"
      >
        <CameraIcon size={16} />
        <span className="text-[9px] uppercase tracking-eyebrow leading-none">
          {upload.isPending ? '…' : 'foto'}
        </span>
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
