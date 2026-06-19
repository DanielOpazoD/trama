import type { Config } from '@netlify/functions'

import handler from './_lib/momentos-endpoint.js'

export const config: Config = {
  path: ['/api/momentos', '/api/momentos/:id'],
}

export default handler
