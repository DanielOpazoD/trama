import { describe, expect, it } from 'vitest'

import { formatSchemaCheckError } from './check-whatsapp-schema.mjs'

describe('check-whatsapp-schema', () => {
  it('explica cómo levantar la DB local cuando Postgres rechaza la conexión', () => {
    const message = formatSchemaCheckError(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5433'), {
        code: 'ECONNREFUSED',
      }),
      'postgresql://trama:trama_local_dev@localhost:5433/trama',
    )

    expect(message).toContain('No pude conectar a Postgres')
    expect(message).toContain('npm run db:up')
    expect(message).toContain('DATABASE_URL')
  })

  it('no imprime errores vacíos cuando pg entrega un error sin message', () => {
    const message = formatSchemaCheckError(
      Object.assign(new Error(''), { code: 'ECONNREFUSED' }),
      'postgresql://trama:trama_local_dev@localhost:5433/trama',
    )

    expect(message).toContain('ECONNREFUSED')
    expect(message.trim().length).toBeGreaterThan(40)
  })
})
