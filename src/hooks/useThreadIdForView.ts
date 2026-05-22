import { useCallback, useEffect, useState } from 'react'

/**
 * Persistent map from section (view) to its active AskBar thread id.
 *
 * The AskBar in each section keeps its conversation memory by sending a
 * threadId to /api/ask. We store the latest thread id per section in
 * localStorage so coming back to "Citas" tomorrow resumes the same thread
 * (and ChatView shows it in the rail with a section badge).
 *
 * Pass `view = null` for the catch-all (Inicio, etc.) — those don't persist.
 */
const KEY_PREFIX = 'trama.askThread.'

function readId(view: string | null): string | null {
  if (!view || typeof window === 'undefined') return null
  return window.localStorage.getItem(KEY_PREFIX + view)
}

export function useThreadIdForView(view: string | null): {
  threadId: string | null
  setThreadId: (id: string | null) => void
} {
  const [threadId, setLocal] = useState<string | null>(() => readId(view))

  // When the user navigates to another view, swap to that view's stored id.
  useEffect(() => {
    setLocal(readId(view))
  }, [view])

  const setThreadId = useCallback(
    (id: string | null) => {
      if (!view || typeof window === 'undefined') return
      if (id) window.localStorage.setItem(KEY_PREFIX + view, id)
      else window.localStorage.removeItem(KEY_PREFIX + view)
      setLocal(id)
    },
    [view],
  )

  return { threadId, setThreadId }
}
