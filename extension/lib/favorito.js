// @ts-check
/** Guardar la página actual como FAVORITO (marcador URL+título). */
import { getConfig } from './config.js'

/**
 * Marca una página como favorita en Trama. A diferencia de un recorte, es un
 * marcador liviano (no se encola: si no hay red, avisa y listo).
 * @param {{ url?: string, title?: string } | null | undefined} tab
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function saveFavorito(tab) {
  const url = tab?.url
  if (!url || !/^https?:/.test(url)) {
    return { ok: false, error: 'Esta página no se puede marcar.' }
  }
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, error: 'Falta el token.' }
  try {
    const res = await fetch(`${baseUrl}/api/favoritos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url, title: tab?.title ?? null }),
    })
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, error: 'Token inválido o revocado.' }
    return { ok: false, error: `El servidor respondió ${res.status}.` }
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.' }
  }
}

/**
 * ¿La página ya está en Favoritos? Consulta liviana por URL exacta — para que
 * el popup abra con la estrella dorada y no se dupliquen marcadores.
 * @param {{ url?: string } | null | undefined} tab
 * @returns {Promise<{ ok: boolean, exists: boolean }>}
 */
export async function favoritoStatus(tab) {
  const url = tab?.url
  if (!url || !/^https?:/.test(url)) return { ok: false, exists: false }
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, exists: false }
  try {
    const res = await fetch(`${baseUrl}/api/favoritos?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, exists: false }
    const data = await res.json()
    return { ok: true, exists: Boolean(data?.favorito) }
  } catch {
    return { ok: false, exists: false }
  }
}
