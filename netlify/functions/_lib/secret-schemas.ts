import { z } from 'zod'
import { VaultEnvelopeString } from './vault-envelope.js'

export const SecretKind = z.enum([
  'api_key',
  'token',
  'pin',
  'license',
  'recovery_code',
  'password',
  'other',
])

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (esperado YYYY-MM-DD)')
  .nullable()
const encryptedMetadata = VaultEnvelopeString.nullable().optional()

export const SecretCreateBody = z.object({
  label: z.string().min(1, 'La clave necesita nombre').max(300),
  secret: VaultEnvelopeString,
  kind: SecretKind.default('other'),
  service: encryptedMetadata,
  username: encryptedMetadata,
  notes: encryptedMetadata,
  favorite: z.boolean().optional(),
  critical: z.boolean().optional(),
  expiresAt: dateOnly.optional(),
  lastRotatedAt: dateOnly.optional(),
})
export type SecretCreateBodyT = z.infer<typeof SecretCreateBody>

export const SecretPatchBody = z.object({
  label: z.string().min(1).max(300).optional(),
  secret: VaultEnvelopeString.optional(),
  kind: SecretKind.optional(),
  service: encryptedMetadata,
  username: encryptedMetadata,
  notes: encryptedMetadata,
  favorite: z.boolean().optional(),
  critical: z.boolean().optional(),
  expiresAt: dateOnly.optional(),
  lastRotatedAt: dateOnly.optional(),
})
export type SecretPatchBodyT = z.infer<typeof SecretPatchBody>
