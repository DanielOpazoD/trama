import type { Config } from '@netlify/functions'

import handler from './_lib/search-endpoint.js'

export const config: Config = {
  path: '/api/search',
}

export default handler
