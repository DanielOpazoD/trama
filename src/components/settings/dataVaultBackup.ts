import {
  exportVaultConfig,
  planVaultRestore,
  restoreVaultConfig,
  type VaultRestoreOutcome,
  type VaultScope,
} from '../../lib/vaultCrypto'
import type { ExportPayload, ImportResult } from '../../types'
import { formatImportResultMessage } from './dataImportPreviewModel'

/**
 * El vault de Claves vive en `localStorage`, no en el servidor, así que el
 * export que baja de `/api/export` trae los secretos cifrados pero no la
 * configuración que permite abrirlos. Este módulo la suma al archivo al
 * exportar y la separa al importar, para que el material de clave nunca
 * viaje a `/api/import`.
 */
export function attachVaultToExport(
  payload: ExportPayload,
  scope: VaultScope,
): ExportPayload {
  const vault = exportVaultConfig(scope)
  return vault ? { ...payload, vault } : payload
}

export type SplitImportPayload = {
  /** Lo que sí va al servidor: el payload sin `vault`. */
  payload: ExportPayload
  vault: unknown
}

export function splitVaultFromImport(payload: ExportPayload): SplitImportPayload {
  const { vault, ...rest } = payload
  return { payload: rest, vault: vault ?? null }
}

const NOTICE: Record<VaultRestoreOutcome, string> = {
  restored:
    'El archivo trae la configuración del vault de Claves y este navegador no tiene una: se restaurará, y tus claves se abrirán con la contraseña de siempre.',
  'same-vault':
    'El archivo trae la configuración del vault de Claves; es la misma de este navegador.',
  'kept-local':
    'El archivo trae la configuración de OTRO vault de Claves. Se conserva la de este navegador; las claves del archivo cifradas con aquel vault no se podrán abrir aquí.',
  invalid: 'El archivo trae una configuración de vault que no se reconoce; se ignora.',
}

/** Texto para la vista previa: qué pasará con el vault si se confirma. */
export function vaultImportNotice(vault: unknown, scope: VaultScope): string | null {
  if (vault === null || vault === undefined) return null
  return NOTICE[planVaultRestore(vault, scope)]
}

const APPLIED: Partial<Record<VaultRestoreOutcome, string>> = {
  restored: 'Vault de Claves restaurado.',
  'kept-local': 'Se conservó el vault de este navegador.',
}

/** Instala el vault del archivo si corresponde y devuelve qué se hizo, para el mensaje final. */
export function applyVaultFromImport(vault: unknown, scope: VaultScope): string | null {
  if (vault === null || vault === undefined) return null
  return APPLIED[restoreVaultConfig(vault, scope)] ?? null
}

export function importDoneMessage(
  result: ImportResult,
  vaultMessage: string | null,
): string {
  return [formatImportResultMessage(result), vaultMessage].filter(Boolean).join(' ')
}
