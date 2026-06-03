import { useState } from 'react'
import type { Note } from '../../api'
import { renderMarkdown } from './markdown'
import { FileIcon, MomentosIcon, PencilIcon, PinIcon, TrashIcon } from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { AttachmentsPanel } from './AttachmentsPanel'
import { AttachmentPhotos } from './AttachmentPhotos'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'

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

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    if (next !== note.content) onEdit(next)
    setEditing(false)
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
          <span
            aria-hidden
            title="fijada"
            className="size-1.5 rounded-full"
            style={{ backgroundColor: ACCENT }}
          />
        )}
        <AttachmentPhotos ownerType="note" ownerId={note.id} compact />
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

      {showFiles && <AttachmentsPanel ownerType="note" ownerId={note.id} />}
    </article>
  )
}
