import { useEffect, useMemo, useRef, useState } from 'react'
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
import { SearchIcon } from '../Icons'
import { LoadingHint } from '../LoadingHint'
import { ViewHeader } from '../ViewHeader'
import { PromptCard } from './PromptCard'
import { PromptComposer } from './PromptComposer'
import { copyText } from './notasUtils'
import { buildPromptViewModel } from './promptViewModel'

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
  const [query, setQuery] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    },
    [],
  )

  const rawPrompts = promptsQuery.data
  const prompts = useMemo(() => rawPrompts ?? [], [rawPrompts])
  const viewModel = useMemo(
    () => buildPromptViewModel(prompts, filter, query),
    [filter, prompts, query],
  )
  const { activeFilter, collections, filtered, searching, stats } = viewModel

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
          setJustSaved(true)
          if (savedTimer.current) window.clearTimeout(savedTimer.current)
          savedTimer.current = window.setTimeout(() => setJustSaved(false), 700)
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
        spacing="tight"
        density="compact"
        subtitle="Guarda los prompts que funcionan, clasifícalos por colección y cópialos donde los necesites."
      />

      <PromptComposer
        title={title}
        collection={collection}
        content={content}
        pendingFiles={pendingFiles}
        busy={createPrompt.isPending || uploadAttachment.isPending}
        justSaved={justSaved}
        onTitleChange={setTitle}
        onCollectionChange={setCollection}
        onContentChange={setContent}
        onPendingFilesChange={setPendingFiles}
        onSave={save}
      />

      {prompts.length > 0 && (
        <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PromptMetric label="prompts" value={stats.total} />
          <PromptMetric label="favoritos" value={stats.favorites} />
          <PromptMetric label="colecciones" value={stats.collections} />
          <PromptMetric label="usos" value={stats.totalUses} />
        </section>
      )}

      {prompts.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="relative flex-1 basis-48">
            <SearchIcon
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              aria-label="Buscar en los prompts"
              placeholder="Buscar por título, texto o variable…"
              className="w-full rounded-full border border-ink-100 bg-paper-50/60 py-1 pl-7 pr-3 text-caption text-ink-700 placeholder:text-ink-300"
            />
          </div>
          <button
            onClick={() => setFilter(null)}
            className={`text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border ${
              activeFilter === null
                ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                : 'border-ink-100 text-ink-400'
            }`}
          >
            todas
          </button>
          {collections.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(activeFilter === c ? null : c)}
              className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border border-ink-100 text-ink-400 hover:text-ink-700"
              style={
                activeFilter === c ? { borderColor: ACCENT, color: ACCENT } : undefined
              }
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
      ) : filtered.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title={searching ? 'Ningún prompt coincide.' : 'Esta colección está vacía.'}
          body={
            searching ? (
              <>
                Se busca en el título, el texto, la colección y las variables.
                <button
                  onClick={() => setQuery('')}
                  className="ml-1 underline underline-offset-2 hover:text-ink-700"
                >
                  Limpiar la búsqueda
                </button>
              </>
            ) : (
              <>Prueba con otra colección.</>
            )
          }
        />
      ) : (
        <div className="stagger-children space-y-3">
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

function PromptMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-100/70 bg-paper-50/60 px-3 py-2">
      <div className="text-lg font-serif leading-none text-ink-800 tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-micro uppercase tracking-eyebrow text-ink-300">
        {label}
      </div>
    </div>
  )
}
