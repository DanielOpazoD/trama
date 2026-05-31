import type { Entity, Quote, Relationship } from '../types'
import { request } from './request'
import {
  entityFromRow,
  quoteFromRow,
  relationshipFromRow,
  type EntityRow,
  type QuoteRow,
  type RelationshipRow,
} from './transform'

export type HomeResponse = {
  entities: Entity[]
  quotes: Quote[]
  relationships: Relationship[]
  counts: {
    entities: number
    quotes: number
    relationships: number
  }
}

export const homeApi = {
  async readHome(): Promise<HomeResponse> {
    const res = await request<{
      entities: EntityRow[]
      quotes: QuoteRow[]
      relationships: RelationshipRow[]
      counts: HomeResponse['counts']
    }>('/api/home')
    return {
      entities: res.entities.map(entityFromRow),
      quotes: res.quotes.map(quoteFromRow),
      relationships: res.relationships.map(relationshipFromRow),
      counts: res.counts,
    }
  },
}
