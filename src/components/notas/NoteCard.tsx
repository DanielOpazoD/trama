import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import type { Note } from '../../api'
import { renderMarkdown } from './markdown'
import { MarkdownField } from './MarkdownField'
import {
  CameraIcon,
  ChevronDownIcon,
  FileIcon,
  MomentosIcon,
  PencilIcon,
  PinIcon,
  TrashIcon,
} from '../Icons'
import { IconButton } from '../IconButton'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { WhatsAppSourceTag } from '../WhatsAppSourceTag'
import { AttachmentsPanel } from './AttachmentsPanel'
import { AttachmentPhotos } from './AttachmentPhotos'
import { AttachmentAudio } from './AttachmentAudio'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { useToast, useUploadNotasAttachment } from '../../state'
import { compressImage } from '../../lib/imageCompression'
import { ComposerFooter, composerTitleClass, editingFrameStyle } from './composerChrome'

// Lazy: la superficie de escritura enfocada (overlay fullscreen + serif) solo
// se descarga cuando el usuario la abre, así no infla el chunk de NotasWorld.
const FocusedWriting = lazy(() =>
  import('./FocusedWriting').then((m) => ({ default: m.FocusedWriting })),
)

// Tono único del mundo Notas: el primario (--accent-primary), remapeado a
// salvia por world-notas. No hardcodear el salvia (un solo sistema de tono).
const ACCENT = 'var(--accent-primary)'
// Alto (px) a partir del cual una nota larga se colapsa con "leer más".
// Calibrado para ~14 líneas: aprovecha el ancho de la tarjeta para mostrar
// bastante del comienzo antes de cortar, sin que una nota domine la lista.
// El affordance de expandir vive SOBRE el degradado, no en una fila aparte,
// así el borde inferior no acumula espacio muerto.
const COLLAPSED_MAX_PX = 320

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
 * Note card minimalista: la cara muestra el título (si hay) + el texto, y las
 * notas largas se colapsan con un "leer más" para que la lista entre más en
 * pantalla. Las acciones más usadas (fijar, editar) aparecen al hover; el resto
 * (→momento, foto, anexos, borrar) vive tras un menú de 3 puntos. Editar usa un
 * textarea que crece con el contenido.
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
  onEdit: (patch: { content: string; title: string | null }) => void
  busy?: boolean
  promoting?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [draft, setDraft] = useState(note.content)
  const [titleDraft, setTitleDraft] = useState(note.title ?? '')
  const [focusMode, setFocusMode] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const promoted = note.promotedMomentoId !== null
  const editRef = useAutosizeTextarea(draft, { minRows: 4, maxRows: 16 })
  const photoInputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadNotasAttachment()
  const toast = useToast()

  // ¿La nota excede el alto colapsado? `scrollHeight` mide el alto COMPLETO
  // aunque apliquemos max-height para el clamp, así sabemos si ofrecer "leer más".
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    setOverflowing(el.scrollHeight > COLLAPSED_MAX_PX + 12)
  }, [note.content])

  function openEdit() {
    setConfirming(false)
    setDraft(note.content)
    setTitleDraft(note.title ?? '')
    setEditing(true)
  }

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    const nextTitle = titleDraft.trim() || null
    if (next !== note.content || nextTitle !== (note.title ?? null)) {
      onEdit({ content: next, title: nextTitle })
    }
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

  // Modo edición — el mismo papel del composer: marco encendido, título serif
  // desnudo y pie sereno. ⌘↵ guarda, Escape cancela.
  if (editing) {
    const onEditKey = (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        saveEdit()
      } else if (e.key === 'Escape') {
        setEditing(false)
      }
    }
    return (
      <article
        className="card-paper-soft rounded-xl border border-ink-100/70 p-3.5"
        style={editingFrameStyle()}
      >
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={onEditKey}
          maxLength={200}
          placeholder="Título (opcional)"
          aria-label="Título de la nota (opcional)"
          className={composerTitleClass}
        />
        <MarkdownField
          value={draft}
          onChange={setDraft}
          textareaRef={editRef}
          onKeyDown={onEditKey}
          rows={4}
          autoFocus
          aria-label="Contenido de la nota"
          onRequestFocusMode={() => setFocusMode(true)}
          // focus-ring-exempt: el marco de la tarjeta ya marca el foco — el campo no añade un segundo anillo
          className="w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed pr-8 focus-visible:outline-none"
        />
        <ComposerFooter
          accent={ACCENT}
          hint="⌘↵ guarda · Esc cancela"
          ctaLabel="guardar"
          ctaDisabled={!draft.trim() || busy}
          secondaryLabel="cancelar"
          onSecondary={() => setEditing(false)}
          onSave={saveEdit}
        />

        {focusMode && (
          <Suspense fallback={null}>
            <FocusedWriting
              value={draft}
              onChange={setDraft}
              title={titleDraft}
              onTitleChange={setTitleDraft}
              onClose={() => setFocusMode(false)}
            />
          </Suspense>
        )}
      </article>
    )
  }

  return (
    <article className="group card-hover-lift card-paper-soft rounded-xl border border-ink-100/70 p-3.5">
      {note.title && (
        <h3 className="mb-1 break-words font-serif text-lead leading-snug text-ink-800">
          {note.title}
        </h3>
      )}

      <div className="relative">
        <div
          ref={bodyRef}
          className="space-y-2 overflow-hidden break-words leading-relaxed text-ink-700"
          style={overflowing && !expanded ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
        >
          {renderMarkdown(note.content)}
        </div>
        {/* «Leer más» vive SOBRE el degradado — cero altura extra, el fade
            invita a expandir en el mismo lugar donde el texto se corta. */}
        {overflowing && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-label="Leer la nota completa"
            className="group/more absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-b from-transparent to-paper-100"
          >
            <span className="inline-flex items-center gap-1 text-micro font-medium text-ink-400 transition-colors group-hover/more:text-ink-700">
              Leer más
              <ChevronDownIcon size={13} />
            </span>
          </button>
        )}
      </div>

      {note.hasAudio && <AttachmentAudio ownerType="note" ownerId={note.id} />}

      {/* Fila inferior: a la IZQUIERDA lo informativo (mostrar menos + estado);
          a la DERECHA las acciones. justify-between mantiene el borde inferior
          simétrico, sin el espacio muerto de la vieja fila del chevron. */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {overflowing && expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-expanded
              className="inline-flex shrink-0 items-center gap-1 text-micro font-medium text-ink-400 transition-colors hover:text-ink-700"
            >
              <ChevronDownIcon size={13} className="rotate-180" />
              Mostrar menos
            </button>
          )}
          <WhatsAppSourceTag source={note.source} />
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
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Acciones rápidas: aparecen al hover/focus. En touch (sin hover) quedan
              igualmente accesibles dentro del menú de 3 puntos. */}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton
              onClick={onTogglePin}
              disabled={busy}
              label={note.pinned ? 'Soltar nota' : 'Fijar nota'}
              title={note.pinned ? 'Soltar' : 'Fijar'}
              className="touch-target rounded p-1 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-40"
            >
              <PinIcon size={13} />
            </IconButton>
            <IconButton
              onClick={openEdit}
              disabled={busy}
              label="Editar nota"
              title="Editar"
              className="touch-target rounded p-1 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-40"
            >
              <PencilIcon size={13} />
            </IconButton>
          </div>

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
                    openEdit()
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
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Agregar fotos"
        onChange={(e) => addPhotos(e.target.files)}
      />

      {showFiles && <AttachmentsPanel ownerType="note" ownerId={note.id} />}
    </article>
  )
}
