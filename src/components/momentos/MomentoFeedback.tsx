import { useState, type FormEvent } from 'react'
import {
  useCreateMomentoComment,
  useDeleteMomentoComment,
  useDeleteMomentoReaction,
  useMomentoFeedbackQuery,
  useSetMomentoReaction,
} from '../../state'
import { ErrorState } from '../ErrorState'
import { personInitial } from './sharePresentation'

export function MomentoFeedback({
  momentoId,
  compact = false,
}: {
  momentoId: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const feedback = useMomentoFeedbackQuery(momentoId)
  const createComment = useCreateMomentoComment()
  const setReaction = useSetMomentoReaction()
  const deleteReaction = useDeleteMomentoReaction()
  const deleteComment = useDeleteMomentoComment()

  const comments = Array.isArray(feedback.data?.comments) ? feedback.data.comments : []
  const reactions = Array.isArray(feedback.data?.reactions) ? feedback.data.reactions : []
  const heart = reactions.find((r) => r.reaction === 'heart')
  const heartCount = heart?.count ?? 0
  const reactedByMe = heart?.reactedByMe ?? false
  const hasActivity = heartCount > 0 || comments.length > 0
  const reactionBusy = setReaction.isPending || deleteReaction.isPending

  const toggleHeart = () => {
    if (reactionBusy) return
    if (reactedByMe) {
      deleteReaction.mutate({ momentoId, reaction: 'heart' })
    } else {
      setReaction.mutate({ momentoId, reaction: 'heart' })
    }
  }

  const handleDeleteComment = (commentId: string) => {
    if (deleteComment.isPending) return
    deleteComment.mutate({ momentoId, commentId })
  }

  if (compact) {
    if (feedback.isLoading || !hasActivity) return null
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-ink-900/60 px-2 py-1 text-[11px] leading-none text-paper-50 shadow-sm backdrop-blur-sm">
        {heartCount > 0 && (
          <span aria-label={`${heartCount} reacciones`}>♥ {heartCount}</span>
        )}
        {heartCount > 0 && comments.length > 0 && <span aria-hidden>·</span>}
        {comments.length > 0 && (
          <span aria-label={`${comments.length} comentarios`}>“ ” {comments.length}</span>
        )}
      </div>
    )
  }

  // Un fetch fallido no es "sin actividad todavía": sin esta rama el feedback
  // caía silenciosamente a los contadores en cero (el "vacío" de esta vista),
  // ocultando el fallo. Solo lo mostramos si no hay actividad en caché de la
  // que tirar, para no borrar comentarios ya cargados en un refetch transitorio.
  if (feedback.isError && !hasActivity) {
    return (
      <div className="mt-2 max-w-md">
        <ErrorState
          title="No se pudo cargar el feedback"
          onRetry={() => feedback.refetch()}
          retrying={feedback.isFetching}
        />
      </div>
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || createComment.isPending) return
    createComment.mutate(
      { momentoId, body },
      {
        onSuccess: () => {
          setDraft('')
          setOpen(true)
        },
      },
    )
  }

  return (
    <div className="mt-2 max-w-md text-caption text-ink-400">
      <div className="flex items-center gap-3 border-t border-ink-100/50 pt-2">
        <button
          type="button"
          onClick={toggleHeart}
          disabled={reactionBusy}
          aria-pressed={reactedByMe}
          className={[
            'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium transition-colors',
            reactedByMe
              ? 'text-[color:var(--accent-clay)]'
              : 'text-ink-400 hover:bg-ink-100/50 hover:text-ink-700',
          ].join(' ')}
        >
          <span aria-hidden>♥</span>
          <span>{reactedByMe ? 'Te gusta' : 'Me gusta'}</span>
          <span className="tabular-nums">{heartCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-ink-400 transition-colors hover:bg-ink-100/50 hover:text-ink-700"
          aria-expanded={open}
        >
          <span>Comentar</span>
          <span className="tabular-nums">{comments.length}</span>
        </button>
      </div>

      {(open || comments.length > 0) && (
        <div className="mt-2 space-y-2">
          {comments.length > 0 && (
            <ol className="space-y-2">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink-200 text-micro font-medium text-ink-700"
                    aria-hidden
                  >
                    {personInitial(
                      comment.authorDisplayName ?? comment.authorEmail ?? '',
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="rounded-2xl bg-ink-100/60 px-3 py-2 leading-snug">
                      <p className="font-medium text-ink-700">
                        {comment.authorDisplayName ?? comment.authorEmail ?? 'Alguien'}
                      </p>
                      <p className="whitespace-pre-wrap text-ink-600">{comment.body}</p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 pl-2 text-[11px] leading-none text-ink-300">
                      <time dateTime={comment.createdAt}>
                        {formatCommentTimestamp(comment.createdAt)}
                      </time>
                      {comment.canDelete && (
                        <button
                          type="button"
                          disabled={deleteComment.isPending}
                          onClick={() => handleDeleteComment(comment.id)}
                          className="font-medium text-ink-300 transition-colors hover:text-[color:var(--accent-clay)] disabled:opacity-40"
                          aria-label={`Eliminar comentario de ${
                            comment.authorDisplayName ?? comment.authorEmail ?? 'Alguien'
                          }`}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={500}
              placeholder="Comentar este momento"
              className="min-w-0 flex-1 rounded-full border border-transparent bg-ink-100/60 px-3 py-1.5 text-caption text-ink-600 placeholder:text-ink-300 focus:border-ink-200 focus:bg-paper-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary)]/20"
            />
            <button
              type="submit"
              disabled={!draft.trim() || createComment.isPending}
              className="rounded-full bg-ink-700 px-3 py-1.5 text-caption text-paper-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function formatCommentTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sept',
    'oct',
    'nov',
    'dic',
  ]
  const day = date.getUTCDate()
  const month = months[date.getUTCMonth()] ?? ''
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  return `${day} ${month}, ${hour}:${minute}`
}
