/**
 * Cloudflare R2 (S3-compatible) — firma de URLs presignadas para la subida
 * directa de archivos grandes de la Biblioteca.
 *
 * Por qué directo a R2 y no por la función: las Netlify Functions topan el body
 * (~6 MB), así que un archivo grande no puede pasar por el endpoint. En su lugar
 * el cliente pide una URL presignada (este helper la firma con `aws4fetch`),
 * PUTea el archivo derecho al bucket (sin función, sin límite de 6 MB) y luego
 * llama a /api/library-uploads-complete para registrar el manifest.
 *
 * Diseño:
 *   - `isR2Configured()` permite que los endpoints degraden con un error CLARO
 *     ("Almacenamiento de archivos grandes no configurado (R2)") en vez de tirar
 *     un 500 opaco cuando faltan las env vars. Esto NO se puede verificar local
 *     (sin credenciales R2), así que todo camino sin config debe ser explícito.
 *   - La firma de PUT NO incluye Content-Type a propósito: así el cliente PUTea
 *     con su propio Content-Type sin romper la firma (signature mismatch). El
 *     objeto queda privado; el acceso de lectura es por GET presignado.
 *   - El acceso es de solo-firma: conocer la key no alcanza para leer/escribir,
 *     hay que tener una URL firmada y vigente (X-Amz-Expires ~900s).
 *
 * Lógica pura-ish y chica: lee env, arma URLs y firma. La autorización por
 * usuario (prefijo `${userId}/`) y el manifest viven en los endpoints.
 */
import { AwsClient } from 'aws4fetch'

/** Segundos de validez de las URLs presignadas (15 min). Margen de sobra para
 *  un PUT grande sin dejar la URL viva demasiado tiempo. */
const PRESIGN_EXPIRES_SECONDS = 900

/** Lee una env var tanto en el runtime de Netlify como en tests (donde se
 *  stubbea `Netlify` o se usa `process.env`). Espeja `auth.ts`. */
function readEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key)
  } catch {
    return process.env[key]
  }
}

/** Se lanza cuando faltan las env vars de R2. Los endpoints la atrapan y la
 *  convierten en un error de servicio con mensaje claro (no un 500 opaco). */
export class R2NotConfiguredError extends Error {
  constructor() {
    super('Almacenamiento de archivos grandes no configurado (R2)')
    this.name = 'R2NotConfiguredError'
  }
}

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

/** Lee las 4 env vars de R2; devuelve null si falta alguna. */
function readR2Config(): R2Config | null {
  const accountId = readEnv('R2_ACCOUNT_ID')
  const accessKeyId = readEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = readEnv('R2_SECRET_ACCESS_KEY')
  const bucket = readEnv('R2_BUCKET')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

/** ¿Están las 4 env vars de R2 presentes? Si no, los endpoints degradan con un
 *  error claro en vez de intentar firmar y fallar de forma confusa. */
export function isR2Configured(): boolean {
  return readR2Config() !== null
}

/** Igual que `readR2Config` pero lanza `R2NotConfiguredError` si falta config. */
function requireR2Config(): R2Config {
  const config = readR2Config()
  if (!config) throw new R2NotConfiguredError()
  return config
}

/** Endpoint S3 de la cuenta R2: `https://<account>.r2.cloudflarestorage.com`. */
function r2Endpoint(config: R2Config): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com`
}

/** URL del bucket (sin key): la base de las operaciones de nivel bucket (LIST). */
function r2BucketUrl(config: R2Config): string {
  return `${r2Endpoint(config)}/${encodeURIComponent(config.bucket)}`
}

/**
 * URL canónica del objeto: `${endpoint}/${bucket}/${key}`, con CADA segmento de
 * la key codificado por separado (preserva las barras de `${userId}/hash.ext`;
 * un `encodeURIComponent` de la key entera las escaparía a `%2F`).
 */
export function r2ObjectUrl(key: string): string {
  const config = requireR2Config()
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `${r2Endpoint(config)}/${encodeURIComponent(config.bucket)}/${encodedKey}`
}

/** Cliente aws4fetch para firmar contra R2 (region 'auto', service 's3'). */
function r2Client(config: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: 'auto',
    service: 's3',
  })
}

/**
 * Firma una URL para `method` sobre la key. `signQuery: true` mete la firma en
 * el query string (la URL presignada que el cliente usa sin headers de auth).
 * No incluimos Content-Type en el Request firmado: así el PUT del cliente puede
 * llevar su propio Content-Type sin romper la firma.
 */
async function presign(key: string, method: 'PUT' | 'GET'): Promise<string> {
  const config = requireR2Config()
  const url = new URL(r2ObjectUrl(key))
  // X-Amz-Expires controla la vigencia de la URL firmada.
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_EXPIRES_SECONDS))
  const signed = await r2Client(config).sign(new Request(url.toString(), { method }), {
    aws: { signQuery: true },
  })
  return signed.url
}

/** URL presignada para SUBIR (PUT) el objeto. */
export function presignPut(key: string): Promise<string> {
  return presign(key, 'PUT')
}

/** URL presignada para LEER (GET) el objeto (la usa el serve endpoint vía 302). */
export function presignGet(key: string): Promise<string> {
  return presign(key, 'GET')
}

/**
 * Comprueba que el objeto exista en R2 con un HEAD firmado. Lo usa el endpoint
 * de complete para no registrar un manifest de un archivo que el PUT del cliente
 * no llegó a subir. Devuelve el tamaño (de Content-Length) si está disponible.
 */
export async function r2ObjectExists(
  key: string,
): Promise<{ exists: boolean; size: number | null }> {
  const config = requireR2Config()
  const signed = await r2Client(config).sign(
    new Request(r2ObjectUrl(key), { method: 'HEAD' }),
  )
  const response = await fetch(signed)
  // Solo un 404 significa "el objeto no existe". Otros no-2xx (403 por
  // credenciales/firma mal, 5xx por caída de R2) NO son "archivo faltante":
  // los propagamos para que `withObservability` los registre y devuelva un 500
  // honesto, en vez de un 404 engañoso que oculta un problema de servicio/config.
  if (response.status === 404) return { exists: false, size: null }
  if (!response.ok) {
    throw new Error(`R2 HEAD falló con status ${response.status}`)
  }
  const lengthHeader = response.headers.get('content-length')
  const size = lengthHeader != null ? Number.parseInt(lengthHeader, 10) : NaN
  return { exists: true, size: Number.isFinite(size) ? size : null }
}

/** Objetos que devuelve un `ListObjectsV2`. `size` es null si R2 no lo informa. */
export type R2ListedObject = { key: string; size: number | null }

export type R2ListResult = {
  objects: R2ListedObject[]
  /**
   * true si el listado se cortó por el tope de páginas y quedaron objetos sin
   * enumerar. Quien lo consuma DEBE decir que su respuesta es parcial: un
   * "no hay huérfanos" calculado sobre medio bucket es una mentira, no un ok.
   */
  truncated: boolean
}

/** Objetos por página. 1000 es el máximo que acepta S3/R2 en `max-keys`. */
const LIST_MAX_KEYS = 1000

/**
 * Tope de páginas por llamada (20 × 1000 = 20k objetos). Existe para que un
 * bucket enorme no cuelgue la función hasta el timeout: se prefiere una
 * respuesta parcial y marcada como tal a una que nunca llega.
 */
const LIST_MAX_PAGES = 20

/**
 * Decodifica las entidades XML de un texto en UNA sola pasada — importante:
 * dos pasadas convertirían `&amp;lt;` en `<` en vez de en `&lt;`.
 */
function decodeXmlText(value: string): string {
  return value.replace(
    /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#[xX]([0-9a-fA-F]+));/g,
    (_match, named: string | undefined, dec: string | undefined, hex) => {
      if (named) {
        return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named] ?? _match
      }
      const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex as string, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match
    },
  )
}

function firstTagText(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)
  return match ? decodeXmlText(match[1]!) : null
}

/**
 * Parsea la respuesta de `ListObjectsV2`.
 *
 * Con regex y no con un parser XML a propósito: el runtime de las funciones no
 * trae `DOMParser` y meter una dependencia de XML para leer tres etiquetas de
 * una respuesta que genera el propio S3 (forma fija, sin atributos ni
 * namespaces en `<Contents>`) es desproporcionado. Lo único delicado —el
 * escapado de entidades en `<Key>`— se maneja explícitamente en `decodeXmlText`.
 */
function parseListObjectsV2(xml: string): {
  objects: R2ListedObject[]
  nextContinuationToken: string | null
} {
  const objects: R2ListedObject[] = []
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const entry = match[1]!
    const key = firstTagText(entry, 'Key')
    if (!key) continue
    const rawSize = firstTagText(entry, 'Size')
    const size = rawSize != null ? Number.parseInt(rawSize, 10) : NaN
    objects.push({ key, size: Number.isFinite(size) ? size : null })
  }
  // El token solo vale si el listado sigue: S3 puede emitirlo igual, pero
  // seguir paginando con IsTruncated=false daría una vuelta de más.
  const truncated = firstTagText(xml, 'IsTruncated') === 'true'
  const token = firstTagText(xml, 'NextContinuationToken')
  return { objects, nextContinuationToken: truncated ? token : null }
}

/**
 * Enumera los objetos del bucket bajo `prefix` con `ListObjectsV2` firmado.
 *
 * **Por qué existe.** Sin esto, la única forma de saber qué hay en R2 es
 * preguntarle a la base (`storage_assets`), y la base solo conoce lo que algún
 * `complete` alcanzó a registrar. Un PUT presignado que llegó al bucket y nunca
 * se confirmó es invisible para toda consulta a Postgres — y es justo el caso
 * que deja un video ocupando espacio sin dueño.
 *
 * El `prefix` NO es cosmético: el bucket es compartido (Biblioteca y Momentos,
 * y a futuro varios usuarios), así que quien llame debe acotar a lo suyo —
 * típicamente `${userId}/`— y filtrar además por dominio. Un listado sin
 * prefijo devolvería objetos ajenos.
 *
 * Read-only: un LIST no modifica nada. Los no-2xx se propagan (igual que en el
 * HEAD) para no confundir "no pude leer el bucket" con "el bucket está vacío".
 */
export async function r2ListObjects(
  prefix: string,
  { maxPages = LIST_MAX_PAGES }: { maxPages?: number } = {},
): Promise<R2ListResult> {
  const config = requireR2Config()
  const client = r2Client(config)
  const objects: R2ListedObject[] = []
  let continuationToken: string | null = null

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(r2BucketUrl(config))
    url.searchParams.set('list-type', '2')
    url.searchParams.set('max-keys', String(LIST_MAX_KEYS))
    if (prefix) url.searchParams.set('prefix', prefix)
    if (continuationToken) url.searchParams.set('continuation-token', continuationToken)

    const signed = await client.sign(new Request(url.toString(), { method: 'GET' }))
    const response = await fetch(signed)
    if (!response.ok) {
      throw new Error(`R2 LIST falló con status ${response.status}`)
    }
    const parsed = parseListObjectsV2(await response.text())
    objects.push(...parsed.objects)
    continuationToken = parsed.nextContinuationToken
    if (!continuationToken) return { objects, truncated: false }
  }

  // Salimos por el tope de páginas con token pendiente: quedan objetos sin ver.
  return { objects, truncated: true }
}
