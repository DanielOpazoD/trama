import type { Config } from '@netlify/functions'

import handler from './_lib/recortes-endpoint.js'

export const config: Config = {
  path: [
    '/api/recortes',
    '/api/recortes/:id',
    '/api/recortes/:id/promote',
    '/api/recortes/:id/unpromote',
    '/api/recortes/:id/restore',
    '/api/recortes/:id/suggest',
  ],
}

export default handler
