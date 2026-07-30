import { useState } from 'react'
import type { Prompt } from '../../api'
import {
  ArchiveIcon,
  ClipboardIcon,
  DuplicateIcon,
  FileIcon,
  PencilIcon,
  TrashIcon,
  UndoIcon,
} from '../Icons'
import { IconButton } from '../IconButton'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { AttachmentsPanel } from './AttachmentsPanel'
import { PromptVersionsPanel } from './PromptVersionsPanel'
import { ComposerFooter, composerTitleClass, editingFrameStyle } from './composerChrome'

// Tono único del mundo Notas: el primario (--accent-primary), remapeado a
// salvia por world-notas. No hardcodear el salvia (un solo sistema de tono).
const ACCENT = 'var(--accent-primary)'

export function PromptCard({
  prompt,
  busy,
  onFavorite,
  onDuplicate,
  onDelete,
  onSave,
  onCopy,
}: {
  prompt: Prompt
  busy: boolean
  onFavorite: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSave: (patch: {
    title?: string
    content?: string
    collection?: string | null
  }) => void
  onCopy: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [title, setTitle] = useState(prompt.title)
  const [collection, setCollection] = useState(prompt.collection ?? '')
  const [content, setContent] = useState(prompt.content)

  if (editing) {
    // El mismo papel del composer: marco encendido, título serif desnudo,
    // colección sutil en el pie. ⌘↵ guarda, Escape cancela.
    const saveEdit = () => {
      onSave({
        title: title.trim(),
        collection: collection.trim() || null,
        content: content.trim(),
      })
      setEditing(false)
    }
    const onEditKey = (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (title.trim() && content.trim() && !busy) saveEdit()
      } else if (e.key === 'Escape') {
        setEditing(false)
      }
    }
    return (
      <article
        className="card-paper-soft rounded-xl border border-ink-100/70 p-4"
        style={editingFrameStyle()}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onEditKey}
          maxLength={200}
          placeholder="Título del prompt"
          aria-label="Título del prompt"
          className={composerTitleClass}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onEditKey}
          rows={6}
          autoFocus
          placeholder="Escribe el prompt… usa {{variables}} para las partes que cambian"
          aria-label="Contenido del prompt"
          // focus-ring-exempt: el marco de la tarjeta ya marca el foco (borde acento + halo)
          className="w-full resize-y bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed focus-visible:outline-none"
        />
        <ComposerFooter
          accent={ACCENT}
          hint="⌘↵ guarda · Esc cancela"
          ctaLabel="guardar"
          ctaDisabled={!title.trim() || !content.trim() || busy}
          secondaryLabel="cancelar"
          onSecondary={() => setEditing(false)}
          onSave={saveEdit}
        >
          <span className="flex min-w-0 items-center gap-1">
            <ArchiveIcon size={12} className="shrink-0 text-ink-300" />
            <input
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              onKeyDown={onEditKey}
              placeholder="Colección"
              aria-label="Colección"
              className="w-24 bg-transparent text-micro text-ink-500 placeholder:text-ink-300 sm:w-32"
            />
          </span>
        </ComposerFooter>
      </article>
    )
  }

  return (
    <article className="card-hover-lift card-paper-soft group rounded-xl border border-ink-100/70 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-ink-800 truncate">{prompt.title}</h3>
            {prompt.favorite && (
              <span className="section-eyebrow" style={{ color: ACCENT }}>
                favorito
              </span>
            )}
            {prompt.collection && (
              <span className="text-micro uppercase tracking-eyebrow text-ink-300">
                {prompt.collection}
              </span>
            )}
          </div>
          <p className="mt-2 text-body text-ink-500 whitespace-pre-wrap line-clamp-5">
            {prompt.content}
          </p>
          {prompt.variables.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {prompt.variables.map((v) => (
                <span
                  key={v}
                  className="text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded border border-ink-100 text-ink-400"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
          {/* La única de las siete tarjetas de la app que exponía SEIS
              controles siempre visibles (y los anexos desplegados debajo, en
              cada tarjeta). Ahora sigue la convención de NoteCard: la acción
              que da sentido a la biblioteca —copiar— visible con nombre; las
              rápidas (favorito, editar) aparecen al hover o foco; y el resto
              vive tras el menú ⋯, con el borrado pidiendo confirmación ahí
              dentro como en las demás tarjetas. */}
          <footer className="mt-3 flex items-center justify-between gap-2 text-micro text-ink-300">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={onCopy}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1.5 font-medium uppercase tracking-eyebrow text-ink-500 transition-colors hover:text-ink-800"
              >
                <ClipboardIcon size={13} />
                Copiar
              </button>
              <span className="tabular-nums">{prompt.useCount} usos</span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  onClick={onFavorite}
                  disabled={busy}
                  className="uppercase tracking-eyebrow px-1 transition-colors hover:text-ink-700 disabled:opacity-40"
                >
                  {prompt.favorite ? 'soltar' : 'favorito'}
                </button>
                <IconButton
                  onClick={() => {
                    setTitle(prompt.title)
                    setCollection(prompt.collection ?? '')
                    setContent(prompt.content)
                    setEditing(true)
                  }}
                  disabled={busy}
                  label="Editar prompt"
                  title="Editar"
                  className="touch-target rounded p-1 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-40"
                >
                  <PencilIcon size={13} />
                </IconButton>
              </div>

              <OverflowMenu
                label="Acciones del prompt"
                width="w-48"
                triggerClassName="touch-target p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
              >
                {(close) => (
                  <>
                    <OverflowMenuItem
                      disabled={busy}
                      onClick={() => {
                        setTitle(prompt.title)
                        setCollection(prompt.collection ?? '')
                        setContent(prompt.content)
                        setEditing(true)
                        close()
                      }}
                    >
                      <PencilIcon size={13} /> Editar
                    </OverflowMenuItem>
                    <OverflowMenuItem
                      disabled={busy}
                      onClick={() => {
                        onFavorite()
                        close()
                      }}
                    >
                      ★ {prompt.favorite ? 'Soltar favorito' : 'Favorito'}
                    </OverflowMenuItem>
                    <OverflowMenuItem
                      disabled={busy}
                      onClick={() => {
                        onDuplicate()
                        close()
                      }}
                    >
                      <DuplicateIcon size={13} /> Duplicar
                    </OverflowMenuItem>
                    <OverflowMenuItem
                      onClick={() => {
                        setShowHistory((v) => !v)
                        close()
                      }}
                    >
                      <UndoIcon size={13} />{' '}
                      {showHistory ? 'Ocultar historial' : 'Historial'}
                    </OverflowMenuItem>
                    <OverflowMenuItem
                      onClick={() => {
                        setShowFiles((v) => !v)
                        close()
                      }}
                    >
                      <FileIcon size={13} /> {showFiles ? 'Ocultar anexos' : 'Anexos'}
                    </OverflowMenuItem>

                    {confirming ? (
                      <>
                        <OverflowMenuItem
                          danger
                          disabled={busy}
                          onClick={() => {
                            onDelete()
                            close()
                          }}
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
                        disabled={busy}
                        onClick={() => setConfirming(true)}
                      >
                        <TrashIcon size={13} /> Borrar
                      </OverflowMenuItem>
                    )}
                  </>
                )}
              </OverflowMenu>
            </div>
          </footer>
          <PromptVersionsPanel prompt={prompt} open={showHistory} busy={busy} />
          {showFiles && <AttachmentsPanel ownerType="prompt" ownerId={prompt.id} />}
        </div>
      </div>
    </article>
  )
}
