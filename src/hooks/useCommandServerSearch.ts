import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { SearchResponse } from '../api'

type SearchFn = typeof api.search

export function useCommandServerSearch({
  open,
  query,
  search = api.search,
  debounceMs = 180,
}: {
  open: boolean
  query: string
  search?: SearchFn
  debounceMs?: number
}): {
  serverResults: SearchResponse | null
  searching: boolean
} {
  const [serverResults, setServerResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    if (!open || q.length < 2) {
      setServerResults(null)
      setSearching(false)
      return
    }

    setServerResults(null)
    setSearching(false)
    const timeout = window.setTimeout(() => {
      if (requestIdRef.current !== requestId) return
      setSearching(true)
      search(q, { limit: 8, mode: 'lexical' })
        .then((res) => {
          if (requestIdRef.current === requestId) setServerResults(res)
        })
        .catch(() => {
          if (requestIdRef.current === requestId) setServerResults(null)
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setSearching(false)
        })
    }, debounceMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [debounceMs, open, query, search])

  return { serverResults, searching }
}
