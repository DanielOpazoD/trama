import { z } from 'zod'

/** Bodies del módulo Favoritos (páginas marcadas desde la extensión). */

export const FavoritoCreateBody = z.object({
  url: z.string().trim().url('URL de favorito inválida').max(2000),
  title: z.string().trim().max(500).nullish(),
  note: z.string().trim().max(2000).nullish(),
})

export const FavoritoPatchBody = z.object({
  title: z.string().trim().max(500).nullish().optional(),
  note: z.string().trim().max(2000).nullish().optional(),
})
