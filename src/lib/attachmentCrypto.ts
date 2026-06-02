const ATTACHMENT_STORAGE_SLOT = 'trama.notas.attachments.slot.v1'
const ENCRYPTED_ATTACHMENT_SUFFIX = '.tramaenc'
const MAGIC = new TextEncoder().encode('TRAMAATT1')
const IV_BYTES = 12

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

async function importAttachmentKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asArrayBuffer(raw), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function getAttachmentKey(): Promise<CryptoKey> {
  const existing = window.localStorage.getItem(ATTACHMENT_STORAGE_SLOT)
  if (existing) return importAttachmentKey(base64ToBytes(existing))

  const raw = new Uint8Array(32)
  crypto.getRandomValues(raw)
  window.localStorage.setItem(ATTACHMENT_STORAGE_SLOT, bytesToBase64(raw))
  return importAttachmentKey(raw)
}

export function isEncryptedAttachmentKey(storageKey: string): boolean {
  return storageKey.endsWith(ENCRYPTED_ATTACHMENT_SUFFIX)
}

export async function encryptAttachmentFile(file: File): Promise<File> {
  const key = await getAttachmentKey()
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    await file.arrayBuffer(),
  )
  const payload = concatBytes(MAGIC, iv, new Uint8Array(encrypted))
  return new File(
    [asArrayBuffer(payload)],
    `${file.name}${ENCRYPTED_ATTACHMENT_SUFFIX}`,
    {
      type: 'application/octet-stream',
    },
  )
}

export async function decryptAttachmentBlob(
  blob: Blob,
  opts: { encrypted: boolean; fileName: string; mimeType: string },
): Promise<Blob> {
  if (!opts.encrypted) return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const header = bytes.slice(0, MAGIC.byteLength)
  if (!MAGIC.every((byte, index) => header[index] === byte)) {
    throw new Error('Anexo cifrado inválido')
  }
  const iv = bytes.slice(MAGIC.byteLength, MAGIC.byteLength + IV_BYTES)
  const encrypted = bytes.slice(MAGIC.byteLength + IV_BYTES)
  const key = await getAttachmentKey()
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(encrypted),
  )
  return new File([decrypted], opts.fileName, { type: opts.mimeType })
}
