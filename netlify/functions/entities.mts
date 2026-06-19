import type { Config } from '@netlify/functions'

import handler from './_lib/entities-endpoint.js'

export const config: Config = {
  path: ['/api/entities', '/api/entities/:id', '/api/entities/:id/restore'],
}

export default handler
