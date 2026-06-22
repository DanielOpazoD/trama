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
  if (!response.ok) return { exists: false, size: null }
  const lengthHeader = response.headers.get('content-length')
  const size = lengthHeader != null ? Number.parseInt(lengthHeader, 10) : NaN
  return { exists: true, size: Number.isFinite(size) ? size : null }
}
