import { z } from 'zod'

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

export const SecretCreateBody = z.object({
  label: z.string().min(1, 'La clave necesita nombre').max(300),
  secret: z.string().min(1, 'El valor secreto no puede estar vacío').max(50000),
  kind: SecretKind.default('other'),
  service: z.string().max(200).nullable().optional(),
  username: z.string().max(300).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  favorite: z.boolean().optional(),
  critical: z.boolean().optional(),
  expiresAt: dateOnly.optional(),
  lastRotatedAt: dateOnly.optional(),
})
export type SecretCreateBodyT = z.infer<typeof SecretCreateBody>

export const SecretPatchBody = z.object({
  label: z.string().min(1).max(300).optional(),
  secret: z.string().min(1).max(50000).optional(),
  kind: SecretKind.optional(),
  service: z.string().max(200).nullable().optional(),
  username: z.string().max(300).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  favorite: z.boolean().optional(),
  critical: z.boolean().optional(),
  expiresAt: dateOnly.optional(),
  lastRotatedAt: dateOnly.optional(),
})
export type SecretPatchBodyT = z.infer<typeof SecretPatchBody>
