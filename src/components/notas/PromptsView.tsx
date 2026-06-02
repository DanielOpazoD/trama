import { useMemo, useState } from 'react'
import type { Prompt } from '../../api'
import {
  useCreatePrompt,
  useDeletePrompt,
  useDuplicatePrompt,
  useMarkPromptUsed,
  usePromptsQuery,
  useToast,
  useUpdatePrompt,
  useUploadNotasAttachment,
} from '../../state'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { ClipboardIcon, PencilIcon, TrashIcon } from '../Icons'
import { ViewHeader } from '../ViewHeader'
import { AttachmentsPanel } from './AttachmentsPanel'
import { PendingAttachmentsInput } from './PendingAttachmentsInput'
import { copyText } from './notasUtils'

const ACCENT = 'var(--accent-sage)'

export function PromptsView() {
  const promptsQuery = usePromptsQuery()
  const createPrompt = useCreatePrompt()
  const updatePrompt = useUpdatePrompt()
  const duplicatePrompt = useDuplicatePrompt()
  const deletePrompt = useDeletePrompt()
  const markUsed = useMarkPromptUsed()
  const uploadAttachment = useUploadNotasAttachment()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [collection, setCollection] = useState('')
  const [content, setContent] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [filter, setFilter] = useState<string | null>(null)

  const prompts = promptsQuery.data ?? []
  const collections = useMemo(
    () =>
      [...new Set(prompts.map((p) => p.collection).filter(Boolean) as string[])].sort(),
    [prompts],
  )
  const filtered = filter ? prompts.filter((p) => p.collection === filter) : prompts

  function save() {
    if (!title.trim() || !content.trim()) return
    const files = pendingFiles
    createPrompt.mutate(
      {
        title: title.trim(),
        content: content.trim(),
        collection: collection.trim() || null,
      },
      {
        onSuccess: async (prompt) => {
          setTitle('')
          setCollection('')
          setContent('')
          setPendingFiles([])
          if (files.length === 0) return
          try {
            await Promise.all(
              files.map((file) =>
                uploadAttachment.mutateAsync({
                  ownerType: 'prompt',
                  ownerId: prompt.id,
                  file,
                }),
              ),
            )
            toast.show({ message: 'Prompt y anexos guardados.', tone: 'success' })
          } catch (err) {
            toast.show({
              message:
                err instanceof Error
                  ? err.message
                  : 'El prompt se guardó, pero algún anexo falló.',
              tone: 'error',
            })
          }
        },
      },
    )
  }

  return (
    <>
      <ViewHeader
        title="Prompts"
        eyebrow="biblioteca reutilizable"
        accent={ACCENT}
        spacing="wide"
      />

      <section className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
        <div className="grid sm:grid-cols-[1fr_180px] gap-2 mb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del prompt"
            className="input-paper w-full text-sm"
          />
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="Colección"
            className="input-paper w-full text-sm"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Escribe el prompt..."
          className="input-paper w-full resize-y text-sm leading-relaxed"
        />
        <PendingAttachmentsInput
          files={pendingFiles}
          onChange={setPendingFiles}
          busy={createPrompt.isPending || uploadAttachment.isPending}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            variables con {'{{nombre}}'}
          </span>
          <button
            onClick={save}
            disabled={!title.trim() || !content.trim() || createPrompt.isPending}
            className="btn-ink text-xs disabled:opacity-40"
          >
            guardar prompt
          </button>
        </div>
      </section>

      {collections.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={`text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border ${
              filter === null
                ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                : 'border-ink-100 text-ink-400'
            }`}
          >
            todas
          </button>
          {collections.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(filter === c ? null : c)}
              className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border border-ink-100 text-ink-400 hover:text-ink-700"
              style={filter === c ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {promptsQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando prompts" size="sm" />
        </div>
      ) : prompts.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Tu biblioteca de prompts está vacía."
          body={<>Guarda aquí instrucciones reutilizables.</>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              busy={
                updatePrompt.isPending ||
                duplicatePrompt.isPending ||
                deletePrompt.isPending ||
                markUsed.isPending
              }
              onFavorite={() =>
                updatePrompt.mutate({
                  id: prompt.id,
                  patch: { favorite: !prompt.favorite },
                })
              }
              onDuplicate={() => duplicatePrompt.mutate(prompt.id)}
              onDelete={() => deletePrompt.mutate(prompt.id)}
              onSave={(patch) => updatePrompt.mutate({ id: prompt.id, patch })}
              onCopy={async () => {
                await copyText(prompt.content)
                markUsed.mutate(prompt.id)
                toast.show({ message: 'Prompt copiado.', tone: 'success' })
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}

function PromptCard({
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
