import { z } from 'zod'

const base64Field = z
  .string()
  .min(8)
  .regex(/^[A-Za-z0-9+/=]+$/)

export const VaultEnvelopeString = z.string().refine(
  (value) => {
    try {
      const parsed = JSON.parse(value) as unknown
      const envelope = z
        .object({
          v: z.literal(1),
          alg: z.literal('AES-GCM'),
          iv: base64Field,
          data: base64Field,
        })
        .safeParse(parsed)
      return envelope.success
    } catch {
      return false
    }
  },
  { message: 'El secreto debe enviarse como sobre cifrado del vault' },
)
