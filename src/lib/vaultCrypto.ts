const VAULT_CONFIG_KEY = 'trama.notas.vault.v1'
const VERIFIER_TEXT = 'trama-notas-vault'
const KDF_ITERATIONS = 250_000

export type VaultScope = {
  userId?: string | null
}

export type VaultConfig = {
  v: 1
  kdf: 'PBKDF2-SHA-256'
  salt: string
  verifierIv: string
  verifierData: string
  requiresPhysicalKey?: boolean
}

export type VaultEnvelope = {
  v: 1
  alg: 'AES-GCM'
  iv: string
  data: string
}

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

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function vaultConfigKey(scope?: VaultScope): string {
  const userId = scope?.userId?.trim()
  if (!userId || userId === 'legacy-single-user') return VAULT_CONFIG_KEY
  return `${VAULT_CONFIG_KEY}:${encodeURIComponent(userId)}`
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

function vaultSecretMaterial(password: string, physicalKey?: string): string {
  const normalizedPhysicalKey = (physicalKey ?? '').replace(/\s+/g, '').toUpperCase()
  return `${password}\u001f${normalizedPhysicalKey}`
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  physicalKey?: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(vaultSecretMaterial(password, physicalKey)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asArrayBuffer(salt),
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptWithKey(value: string, key: CryptoKey): Promise<VaultEnvelope> {
  const iv = randomBytes(12)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    new TextEncoder().encode(value),
  )
  return {
    v: 1,
    alg: 'AES-GCM',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }
}

async function decryptWithKey(envelope: VaultEnvelope, key: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(base64ToBytes(envelope.iv)) },
    key,
    asArrayBuffer(base64ToBytes(envelope.data)),
  )
  return new TextDecoder().decode(decrypted)
}

function readVaultConfig(scope?: VaultScope): VaultConfig | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(vaultConfigKey(scope))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as VaultConfig
    return parsed.v === 1 && parsed.kdf === 'PBKDF2-SHA-256' ? parsed : null
  } catch {
    return null
  }
}

export function hasVaultConfig(scope?: VaultScope): boolean {
  return readVaultConfig(scope) !== null
}

export function vaultRequiresPhysicalKey(scope?: VaultScope): boolean {
  return readVaultConfig(scope)?.requiresPhysicalKey === true
}

export function generatePhysicalKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(24)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return chars
    .join('')
    .replace(/(.{4})/g, '$1-')
    .replace(/-$/, '')
}

export async function createVault(
  password: string,
  physicalKey?: string,
  scope?: VaultScope,
): Promise<CryptoKey> {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt, physicalKey)
  const verifier = await encryptWithKey(VERIFIER_TEXT, key)
  const config: VaultConfig = {
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    salt: bytesToBase64(salt),
    verifierIv: verifier.iv,
    verifierData: verifier.data,
    ...(physicalKey?.trim() ? { requiresPhysicalKey: true } : {}),
  }
  window.localStorage.setItem(vaultConfigKey(scope), JSON.stringify(config))
  return key
}

export async function unlockVault(
  password: string,
  physicalKey?: string,
  scope?: VaultScope,
): Promise<CryptoKey> {
  const config = readVaultConfig(scope)
  if (!config) return createVault(password, physicalKey, scope)
  if (config.requiresPhysicalKey && !physicalKey?.trim()) {
    throw new Error('Llave física requerida')
  }
  const key = await deriveKey(password, base64ToBytes(config.salt), physicalKey)
  const verifier = await decryptWithKey(
    {
      v: 1,
      alg: 'AES-GCM',
      iv: config.verifierIv,
      data: config.verifierData,
    },
    key,
  )
  if (verifier !== VERIFIER_TEXT) throw new Error('Clave de acceso incorrecta')
  return key
}

export async function encryptVaultSecret(
  plainText: string,
  key: CryptoKey,
): Promise<string> {
  return JSON.stringify(await encryptWithKey(plainText, key))
}

export async function decryptVaultSecret(
  encryptedValue: string,
  key: CryptoKey,
): Promise<string> {
  let envelope: VaultEnvelope
  try {
    envelope = JSON.parse(encryptedValue) as VaultEnvelope
  } catch {
    throw new Error('Esta clave fue guardada sin cifrado extremo a extremo')
  }
  if (envelope.v !== 1 || envelope.alg !== 'AES-GCM') {
    throw new Error('Formato de clave cifrada no soportado')
  }
  return decryptWithKey(envelope, key)
}
