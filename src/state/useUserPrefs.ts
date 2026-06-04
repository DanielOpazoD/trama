import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type UserPrefs } from '../api'
import { getCurrentClientUserId } from '../lib/clientIdentity'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

const MIRROR_KEY = 'trama:user-prefs'

/**
 * El espejo guarda el DUEÑO (id de cliente) junto a las prefs. Así, en un
 * navegador compartido (multiusuario), el usuario B NO ve el espejo del usuario
 * A: la lectura solo devuelve las prefs si el dueño coincide con el usuario
 * actual. Sin Clerk (demo/single-user) el id es null → el espejo (owner null)
 * matchea y funciona igual.
 */
type Mirror = { owner: string | null; prefs: UserPrefs }

/** Lee el espejo de prefs en localStorage — SÍNCRONO, sin red — solo si
 *  pertenece al usuario actual (anti-fuga entre usuarios). Se usa también en App
 *  para resolver el mundo default sin parpadeo. */
export function readUserPrefsMirror(): UserPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Mirror
    return parsed.owner === getCurrentClientUserId() ? (parsed.prefs ?? {}) : {}
  } catch {
    return {}
  }
}
function writeMirror(prefs: UserPrefs) {
  try {
    const mirror: Mirror = { owner: getCurrentClientUserId(), prefs }
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(mirror))
  } catch {
    /* localStorage deshabilitado */
  }
}

/** Borra el espejo de prefs (al cambiar de usuario / cerrar sesión). */
export function clearUserPrefsMirror() {
  try {
    window.localStorage.removeItem(MIRROR_KEY)
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
 *  cache + espejo de inmediato; revierte + avisa ante error; fija lo del server
 *  al éxito. */
export function useSaveUserPrefs() {
  const qc = useQueryClient()
  const toast = useToast()
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
      toast.show({ message: 'No se pudo guardar la preferencia.', tone: 'error' })
    },
    onSuccess: (server) => {
      qc.setQueryData(queryKeys.userPrefs, server)
      writeMirror(server)
    },
  })
}
