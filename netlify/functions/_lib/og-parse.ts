/**
 * og-parse — utilidades puras para extraer metadata Open Graph / Twitter
 * Card / <title> de una string de HTML. Sin fetch, sin side effects,
 * sin dependencias — todo testeable sin red.
 *
 * Usado por /api/momentos/url-preview.
 *
 * ADVERTENCIA: el parser usa regex, no un parser DOM real. Funciona bien
 * para 99% de las páginas (la spec OG dice que los meta tags viven en
 * <head> con shape consistente), pero falla con casos adversos como
 * `>` dentro de un atributo. No es para production-grade HTML scraping —
 * para eso usar cheerio o linkedom. Para nuestro caso (precargar campos
 * del composer de recortes), es suficiente y mantiene el bundle delgado.
 */

/** Tabla extendida de entidades HTML — incluye acentos castellanos
 *  (ñ, á, é, í, ó, ú) que aparecen en og:title/description. La tabla
 *  cubre las más frecuentes; fallback: dejar la entidad cruda (el
 *  usuario puede editar si ve un &nbsp; suelto). */
const HTML_ENTITIES: Record<string, string> = {
  // Básicas
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  // Castellanas
  '&ntilde;': 'ñ',
  '&Ntilde;': 'Ñ',
  '&aacute;': 'á',
  '&eacute;': 'é',
  '&iacute;': 'í',
  '&oacute;': 'ó',
  '&uacute;': 'ú',
  '&Aacute;': 'Á',
  '&Eacute;': 'É',
  '&Iacute;': 'Í',
  '&Oacute;': 'Ó',
  '&Uacute;': 'Ú',
  '&iexcl;': '¡',
  '&iquest;': '¿',
  '&uuml;': 'ü',
  '&Uuml;': 'Ü',
  // Tipográficas
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&laquo;': '«',
  '&raquo;': '»',
}

/**
 * Decodifica entidades HTML en una string. Maneja:
 *   - Named entities de la tabla extendida (la más común)
 *   - Numeric decimal: &#1234; → char
 *   - Numeric hex: &#xABCD; → char
 *
 * Si una entidad no se reconoce, la deja cruda — el usuario puede
 * limpiarla manualmente. Mejor eso que crashear.
 */
export function decodeEntities(s: string): string {
  // 1) Named entities — un solo pass con regex y lookup.
  let out = s.replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITIES[m] ?? m)
  // 2) Numeric decimal &#NNN;
  out = out.replace(/&#(\d+);/g, (_, num: string) => {
    const code = Number.parseInt(num, 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : _
  })
  // 3) Numeric hex &#xHEX;
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
    const code = Number.parseInt(hex, 16)
    return Number.isFinite(code) ? String.fromCodePoint(code) : _
  })
  return out
}

/**
 * Hostname "amigable" (sin www.) para mostrar como fuente. null si la
 * URL no parsea.
 */
export function prettySource(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Busca un meta tag por property o name attribute (case-insensitive)
 * y devuelve su content decodificado.
 *
 * Maneja los dos órdenes posibles:
 *   <meta property="og:title" content="X">
 *   <meta content="X" property="og:title">
 *
 * Devuelve null si no encuentra match.
 */
export function findMeta(html: string, key: string): string | null {
  // Escapamos el key por si tiene chars regex (no debería, pero seguro).
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`,
      'i',
    ),
  ]
  for (const pat of patterns) {
    const m = html.match(pat)
    if (m && m[1]) return decodeEntities(m[1].trim())
  }
  return null
}

/**
 * Lee el <title> del documento. Útil como fallback cuando no hay
 * og:title.
 */
export function findTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m && m[1]) return decodeEntities(m[1].trim())
  return null
}
