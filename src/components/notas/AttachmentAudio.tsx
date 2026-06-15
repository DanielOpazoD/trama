import type { NotasAttachmentOwner } from '../../api'
import { useNotasAttachmentsQuery } from '../../state'
import { AudioNote } from '../momentos/AudioNote'

/**
 * Notas de voz adjuntas a una nota (o tarea): reproductor compacto papel/tinta
 * por cada anexo de audio. Reusa `AudioNote` de Momentos (botón play + barra de
 * progreso, sin cromo nativo) y el endpoint authed `/api/notas-attachments-file`.
 *
 * Se monta solo cuando la nota tiene audio (`note.hasAudio`), igual que la tira
 * de fotos se monta solo con `note.hasImages` — así no consultamos anexos por
 * cada nota de la lista.
 */
export function AttachmentAudio({
  ownerType,
  ownerId,
}: {
  ownerType: NotasAttachmentOwner
  ownerId: string
}) {
  const query = useNotasAttachmentsQuery({ ownerType, ownerId })
  const audios = (query.data ?? []).filter((a) => a.mimeType.startsWith('audio/'))
  if (audios.length === 0) return null
  return (
    <div className="mt-2 space-y-2">
      {audios.map((a) => (
        <AudioNote key={a.id} src={a.url} />
      ))}
    </div>
  )
}
