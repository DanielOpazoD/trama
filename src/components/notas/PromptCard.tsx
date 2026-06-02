import { useState } from 'react'
import type { Prompt } from '../../api'
import { ClipboardIcon, PencilIcon, TrashIcon } from '../Icons'
import { AttachmentsPanel } from './AttachmentsPanel'

const ACCENT = 'var(--accent-sage)'

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
  const [title, setTitle] = useState(prompt.title)
  const [collection, setCollection] = useState(prompt.collection ?? '')
  const [content, setContent] = useState(prompt.content)

  if (editing) {
    return (
      <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
        <div className="grid sm:grid-cols-[1fr_180px] gap-2 mb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-paper w-full text-sm"
          />
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="input-paper w-full text-sm"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="input-paper w-full resize-y text-sm"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs">
            cancelar
          </button>
          <button
            onClick={() => {
              onSave({
                title: title.trim(),
                collection: collection.trim() || null,
                content: content.trim(),
              })
              setEditing(false)
            }}
            disabled={!title.trim() || !content.trim() || busy}
            className="btn-ink text-xs disabled:opacity-50"
          >
            guardar
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="card-paper-soft group rounded-xl border border-ink-100/70 p-4">
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
          <p className="mt-2 text-sm text-ink-500 whitespace-pre-wrap line-clamp-5">
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
          <footer className="mt-3 flex items-center gap-3 text-micro text-ink-300">
            <span className="tabular-nums">{prompt.useCount} usos</span>
            <span className="flex-1" />
            <button
              onClick={onCopy}
              disabled={busy}
              className="p-1 hover:text-ink-700 transition-colors"
              title="Copiar"
              aria-label="Copiar prompt"
            >
              <ClipboardIcon size={13} />
            </button>
            <button
              onClick={() => {
                setTitle(prompt.title)
                setCollection(prompt.collection ?? '')
                setContent(prompt.content)
                setEditing(true)
              }}
              disabled={busy}
              className="p-1 hover:text-ink-700 transition-colors"
              title="Editar"
              aria-label="Editar prompt"
            >
              <PencilIcon size={13} />
            </button>
            <button
              onClick={onFavorite}
              disabled={busy}
              className="uppercase tracking-eyebrow hover:text-ink-700 transition-colors"
            >
              {prompt.favorite ? 'soltar' : 'favorito'}
            </button>
            <button
              onClick={onDuplicate}
              disabled={busy}
              className="uppercase tracking-eyebrow hover:text-ink-700 transition-colors"
            >
              duplicar
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="p-1 hover:text-[color:var(--accent-clay)] transition-colors"
              title="Borrar"
              aria-label="Borrar prompt"
            >
              <TrashIcon size={13} />
            </button>
          </footer>
          <AttachmentsPanel ownerType="prompt" ownerId={prompt.id} />
        </div>
      </div>
    </article>
  )
}
