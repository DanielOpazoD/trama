// @ts-check
/** Configuración persistida de la extensión: token personal + servidor. */

const DEFAULT_BASE_URL = 'https://tramahub.app'

/**
 * Lee el token y la URL base del servidor desde chrome.storage.local.
 * La base se normaliza sin barras finales para componer rutas sin dobles `/`.
 * @returns {Promise<{ token: string | null, baseUrl: string }>}
 */
export async function getConfig() {
  const { tramaToken, tramaBaseUrl } = await chrome.storage.local.get([
    'tramaToken',
    'tramaBaseUrl',
  ])
  return {
    token: tramaToken || null,
    baseUrl: (tramaBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  }
}
