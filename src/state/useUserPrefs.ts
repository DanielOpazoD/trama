import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type UserPrefs } from '../api'
import { queryKeys } from './queryClient'

const MIRROR_KEY = 'trama:user-prefs'

/** Lee el espejo de prefs en localStorage — lectura SÍNCRONA sin red, para
 *  pintar sin parpadeo antes de que llegue el servidor (incluido en App al
 *  resolver el mundo default). */
export function readUserPrefsMirror(): UserPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY)
    return raw ? (JSON.parse(raw) as UserPrefs) : {}
  } catch {
    return {}
  }
}
function writeMirror(p: UserPrefs) {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(p))
  } catch {
    /* localStorage deshabilitado */
  }
}

/** Prefs de UI del usuario. Hidrata del espejo localStorage al instante y
 *  reconcilia con el servidor (la fuente de verdad que sincroniza dispositivos). */
export function useUserPrefs() {
  return useQuery({
    queryKey: queryKeys.userPrefs,
    queryFn: async () => {
      const p = await api.userPrefs.get()
      writeMirror(p)
      return p
    },
    placeholderData: readUserPrefsMirror(),
    staleTime: 30_000,
  })
}

/** Guarda un parche de prefs (merge superficial en server). Optimista: actualiza
 *  cache + espejo de inmediato; revierte ante error; fija lo del server al éxito. */
export function useSaveUserPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: UserPrefs) => api.userPrefs.save(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.userPrefs })
      const prev = qc.getQueryData<UserPrefs>(queryKeys.userPrefs) ?? {}
      const next: UserPrefs = { ...prev, ...patch }
      qc.setQueryData(queryKeys.userPrefs, next)
      writeMirror(next)
      return { prev }
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(queryKeys.userPrefs, ctx.prev)
        writeMirror(ctx.prev)
      }
    },
    onSuccess: (server) => {
      qc.setQueryData(queryKeys.userPrefs, server)
      writeMirror(server)
    },
  })
}
