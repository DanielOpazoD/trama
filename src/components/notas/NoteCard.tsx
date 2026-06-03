import { useRef, useState } from 'react'
import type { Note } from '../../api'
import { renderMarkdown } from './markdown'
import {
  CameraIcon,
  FileIcon,
  MomentosIcon,
  PencilIcon,
  PinIcon,
  TrashIcon,
} from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { AttachmentsPanel } from './AttachmentsPanel'
import { AttachmentPhotos } from './AttachmentPhotos'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { useToast, useUploadNotasAttachment } from '../../state'
import { compressImage } from '../../lib/imageCompression'

const ACCENT = 'var(--accent-sage)'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Note card minimalista: la cara muestra solo el texto de la nota. Las acciones
 * (→momento, editar, fijar, anexos, borrar) viven tras un menú de 3 puntos; un
 * punto salvia indica "fijada" y un ícono de cámara aparece si hay fotos (abre
 * el visor con editor). Editar usa un textarea que crece con el contenido.
 */
export function NoteCard({
  note,
  onTogglePin,
  onDelete,
  onPromote,
  onEdit,
  busy = false,
  promoting = false,
}: {
  note: Note
  onTogglePin: () => void
  onDelete: () => void
  onPromote: () => void
  onEdit: (content: string) => void
  busy?: boolean
  promoting?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [draft, setDraft] = useState(note.content)
  const promoted = note.promotedMomentoId !== null
  const editRef = useAutosizeTextarea(draft, { minRows: 4, maxRows: 16 })
  const photoInputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadNotasAttachment()
  const toast = useToast()

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    if (next !== note.content) onEdit(next)
    setEditing(false)
  }

  // Agregar foto a la nota: comprime (a diferencia de la subida cruda de
  // "Anexos") y sube. La edición vive en el visor que abre el ícono de fotos.
  async function addPhotos(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) {
      if (files && files.length > 0)
        toast.show({ message: 'Solo imágenes por ahora.', tone: 'error' })
      return
    }
    let ok = 0
    for (const original of images) {
      try {
        const file = await compressImage(original)
        await upload.mutateAsync({ ownerType: 'note', ownerId: note.id, file })
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
        message: ok === 1 ? 'Foto agregada.' : `${ok} fotos agregadas.`,
        tone: 'success',
      })
    }
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  // Modo edición — textarea con el contenido en crudo (markdown), ⌘↵ guarda.
  if (editing) {
    return (
      <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
        <textarea
          ref={editRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              saveEdit()
            }
          }}
          rows={4}
          autoFocus
          className="w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs">
            cancelar
          </button>
          <button
            onClick={saveEdit}
            disabled={!draft.trim() || busy}
            className="btn-ink text-xs disabled:opacity-50"
          >
            guardar
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4 transition-colors">
      <div className="break-words text-ink-700 leading-relaxed space-y-2">
        {renderMarkdown(note.content)}
      </div>

      {/* Fila de afordancia: punto "fijada" · ícono de fotos · menú. Sin texto. */}
      <div className="mt-2 flex items-center justify-end gap-1.5">
        {note.pinned && (
          <>
            <span
              aria-hidden
              title="fijada"
              className="size-1.5 rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
            <span className="sr-only">Nota fijada</span>
          </>
        )}
        {note.hasImages && (
          <AttachmentPhotos ownerType="note" ownerId={note.id} compact />
        )}
        <OverflowMenu
          label="Acciones de la nota"
          width="w-52"
          triggerClassName="touch-target p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
        >
          {(close) => (
            <>
              {!promoted && (
                <OverflowMenuItem
                  onClick={() => {
                    onPromote()
                    close()
                  }}
                  disabled={busy || promoting}
                >
                  <MomentosIcon size={13} /> {promoting ? 'Promoviendo…' : '→ Momento'}
                </OverflowMenuItem>
              )}
              <OverflowMenuItem
                onClick={() => {
                  setConfirming(false)
                  setDraft(note.content)
                  setEditing(true)
                  close()
                }}
                disabled={busy}
              >
                <PencilIcon size={13} /> Editar
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  photoInputRef.current?.click()
                  close()
                }}
                disabled={upload.isPending}
              >
                <CameraIcon size={13} /> Agregar foto
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onTogglePin()
                  close()
                }}
                disabled={busy}
              >
                <PinIcon size={13} /> {note.pinned ? 'Soltar' : 'Fijar'}
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  setShowFiles((v) => !v)
                  close()
                }}
              >
                <FileIcon size={13} /> {showFiles ? 'Ocultar anexos' : 'Anexos'}
              </OverflowMenuItem>

              <p className="px-2.5 pt-1.5 pb-0.5 text-micro text-ink-300 tabular-nums">
                {promoted
                  ? 'Ya vive como Momento'
                  : `Creada · ${formatDate(note.createdAt)}`}
              </p>

              {confirming ? (
                <>
                  <OverflowMenuItem
                    danger
                    onClick={() => {
                      onDelete()
                      close()
                    }}
                    disabled={busy}
                  >
                    <TrashIcon size={13} /> Sí, borrar
                  </OverflowMenuItem>
                  <OverflowMenuItem onClick={() => setConfirming(false)}>
                    Cancelar
                  </OverflowMenuItem>
                </>
              ) : (
                <OverflowMenuItem
                  danger
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                >
                  <TrashIcon size={13} /> Borrar
                </OverflowMenuItem>
              )}
            </>
          )}
        </OverflowMenu>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addPhotos(e.target.files)}
      />

      {showFiles && <AttachmentsPanel ownerType="note" ownerId={note.id} />}
    </article>
  )
}
