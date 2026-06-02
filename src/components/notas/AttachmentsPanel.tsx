import { useRef, useState } from 'react'
import type { NotasAttachment, NotasAttachmentOwner } from '../../api'
import { prepareAttachmentDownload } from '../../lib/attachmentDownload'
import {
  useDeleteNotasAttachment,
  useNotasAttachmentsQuery,
  useUploadNotasAttachment,
  useToast,
} from '../../state'
import { DownloadIcon, FileIcon, TrashIcon, UploadIcon } from '../Icons'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentsPanel({
  ownerType,
  ownerId,
}: {
  ownerType: NotasAttachmentOwner
  ownerId: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const attachmentsQuery = useNotasAttachmentsQuery({ ownerType, ownerId })
  const upload = useUploadNotasAttachment()
  const remove = useDeleteNotasAttachment()
  const attachments = attachmentsQuery.data ?? []
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  function onFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || upload.isPending) return
    upload.mutate(
      { ownerType, ownerId, file },
      {
        onSuccess: () => toast.show({ message: 'Anexo guardado.', tone: 'success' }),
        onError: (err) =>
          toast.show({
            message: err instanceof Error ? err.message : 'No se pudo subir',
            tone: 'error',
          }),
      },
    )
    if (inputRef.current) inputRef.current.value = ''
  }

  async function downloadAttachment(attachment: NotasAttachment) {
    if (downloadingId) return
    setDownloadingId(attachment.id)
    try {
      const res = await fetch(attachment.url)
      if (!res.ok) throw new Error('No se pudo descargar el anexo')
      const fileBlob = await prepareAttachmentDownload(await res.blob(), {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      })
      const url = URL.createObjectURL(fileBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo descargar',
        tone: 'error',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="mt-3 border-t border-ink-100/60 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="section-eyebrow text-ink-300">anexos</span>
        <label className="inline-flex items-center gap-1 text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors cursor-pointer">
          <UploadIcon size={12} />
          {upload.isPending ? 'subiendo' : 'subir'}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
      </div>

      {attachments.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-md border border-ink-100/60 bg-paper-50/50 px-2 py-1.5 text-caption"
            >
              <FileIcon size={13} className="shrink-0 text-ink-300" />
              <button
                type="button"
                onClick={() => void downloadAttachment(attachment)}
                className="min-w-0 flex-1 truncate text-ink-600 hover:text-ink-800"
                title={attachment.fileName}
              >
                {attachment.fileName}
              </button>
              <span className="shrink-0 text-micro tabular-nums text-ink-300">
                {formatBytes(attachment.byteSize)}
              </span>
              <button
                type="button"
                onClick={() => void downloadAttachment(attachment)}
                disabled={downloadingId === attachment.id}
                aria-label="Descargar anexo"
                title="Descargar"
                className="shrink-0 p-1 text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
              >
                <DownloadIcon size={12} />
              </button>
              <button
                onClick={() =>
                  remove.mutate({
                    id: attachment.id,
                    ownerType,
                    ownerId,
                  })
                }
                disabled={remove.isPending}
                aria-label="Quitar anexo"
                title="Quitar"
                className="shrink-0 p-1 text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors disabled:opacity-50"
              >
                <TrashIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
