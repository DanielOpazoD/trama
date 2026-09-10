import { describe, expect, it } from 'vitest'
import type { SearchResponse } from '../api'
import type { QueryInput } from '../api/query'
import {
  buildCommandSearchItems,
  describeCommandSearchItem,
  type CommandSearchContentItem,
  type CommandSearchEntity,
  type CommandSearchQuote,
  type CommandSearchSavedQuery,
} from './commandSearchModel'

const DEFAULT_VISIBILITY = {
  isViewVisible: () => true,
  isModuleVisible: () => true,
  isPinRequired: () => false,
  pinActive: false,
}

function savedQuery(name: string): CommandSearchSavedQuery {
  return {
    id: `sq-${name}`,
    name,
    query: { from: ['entity'] } as QueryInput,
  }
}

function entity(overrides: Partial<CommandSearchEntity>): CommandSearchEntity {
  return {
    id: 'entity-1',
    name: 'Entidad',
    type: 'persona',
    description: null,
    ...overrides,
  }
}

function quote(overrides: Partial<CommandSearchQuote>): CommandSearchQuote {
  return {
    id: 'quote-1',
    entityId: 'entity-1',
    text: 'Una cita',
    ...overrides,
  }
}

function server(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    entities: [],
    quotes: [],
    momentos: [],
    cronicas: [],
    chat: [],
    mode: 'lexical',
    ...overrides,
  }
}

describe('commandSearchModel', () => {
  it('ordena matches locales por relevancia simple antes de caer a texto secundario', () => {
    const items = buildCommandSearchItems({
      query: 'borg',
      actionsEnabled: false,
      localSearchEnabled: true,
      entities: [
        entity({
          id: 'description-match',
          name: 'Ensayo argentino',
          description: 'Un apunte sobre Borges',
        }),
        entity({ id: 'prefix-match', name: 'Borges', description: null }),
        entity({ id: 'substring-match', name: 'Jorge Luis Borges', description: null }),
      ],
      quotes: [],
      savedQueries: [],
      serverResults: null,
      sectionAliases: {},
      visibility: DEFAULT_VISIBILITY,
    })

    expect(items.filter((item) => item.kind === 'entity').map((item) => item.id)).toEqual(
      ['prefix-match', 'substring-match', 'description-match'],
    )
  })

  it('normaliza acentos en búsquedas locales', () => {
    const items = buildCommandSearchItems({
      query: 'jose nunez',
      actionsEnabled: false,
      localSearchEnabled: true,
      entities: [
        entity({
          id: 'entity-jose',
          name: 'José Núñez',
          description: 'Ensayos y diarios',
        }),
      ],
      quotes: [],
      savedQueries: [],
      serverResults: null,
      sectionAliases: {},
      visibility: DEFAULT_VISIBILITY,
    })

    expect(items[0]).toMatchObject({ kind: 'entity', id: 'entity-jose' })
  })

  it('dedupea hits de servidor contra resultados locales y mantiene dominios server-only', () => {
    const items = buildCommandSearchItems({
      query: 'borges',
      actionsEnabled: false,
      localSearchEnabled: true,
      entities: [entity({ id: 'entity-local', name: 'Borges' })],
      quotes: [
        quote({ id: 'quote-local', entityId: 'entity-local', text: 'Borges cita' }),
      ],
      savedQueries: [savedQuery('Borges guardado')],
      serverResults: server({
        entities: [
          {
            id: 'entity-local',
            name: 'Borges duplicado',
            type: 'persona',
            description: null,
            year: null,
            score: 1,
            lexical: 1,
            semantic: 0,
          },
          {
            id: 'entity-server',
            name: 'Biblioteca de Babel',
            type: 'obra',
            description: null,
            year: null,
            score: 0.8,
            lexical: 0.8,
            semantic: 0,
          },
        ],
        quotes: [
          {
            id: 'quote-local',
            entityId: 'entity-local',
            entityName: 'Borges',
            text: 'duplicada',
            source: null,
            score: 1,
            lexical: 1,
            semantic: 0,
          },
          {
            id: 'quote-server',
            entityId: 'entity-server',
            entityName: 'Biblioteca',
            text: 'El universo es una biblioteca',
            source: null,
            score: 0.8,
            lexical: 0.8,
            semantic: 0,
          },
        ],
        momentos: [
          {
            id: 'momento-1',
            kind: 'nota',
            text: 'Borges en la tarde',
            capturedAt: '2026-01-01',
            score: 0.7,
          },
        ],
        cronicas: [
          {
            id: 'cronica-1',
            year: 2026,
            month: 1,
            text: 'Enero con Borges',
            score: 0.6,
          },
        ],
        chat: [
          {
            id: 'chat-1',
            threadId: 'thread-1',
            threadTitle: 'Lecturas',
            role: 'assistant',
            text: 'Hablamos de Borges',
            score: 0.5,
          },
        ],
      }),
      sectionAliases: {},
      visibility: DEFAULT_VISIBILITY,
    })

    expect(items.filter((item) => item.kind === 'entity').map((item) => item.id)).toEqual(
      ['entity-local', 'entity-server'],
    )
    expect(items.filter((item) => item.kind === 'quote').map((item) => item.id)).toEqual([
      'quote-local',
      'quote-server',
    ])
    expect(items.some((item) => item.kind === 'momento' && item.id === 'momento-1')).toBe(
      true,
    )
    expect(items.some((item) => item.kind === 'cronica' && item.id === 'cronica-1')).toBe(
      true,
    )
    expect(items.some((item) => item.kind === 'chat' && item.id === 'chat-1')).toBe(true)
  })

  it('prioriza alias exactos con # para revelar secciones ocultas o protegidas', () => {
    const items = buildCommandSearchItems({
      query: '#pass',
      actionsEnabled: true,
      localSearchEnabled: true,
      entities: [],
      quotes: [],
      savedQueries: [],
      serverResults: null,
      sectionAliases: {},
      visibility: {
        isViewVisible: () => true,
        isModuleVisible: (moduleId) => moduleId !== 'claves',
        isPinRequired: (id) => id === 'notas:claves',
        pinActive: true,
      },
    })

    expect(items[0]).toMatchObject({
      kind: 'reveal',
      moduleId: 'claves',
      hint: 'oculta · protegida 🔒',
    })
  })

  it('describe todos los tipos de item con texto estable para diagnósticos y keys', () => {
    const items = buildCommandSearchItems({
      query: 'bor',
      actionsEnabled: true,
      localSearchEnabled: true,
      entities: [entity({ id: 'entity-1', name: 'Borges' })],
      quotes: [quote({ id: 'quote-1', text: 'Borges dijo algo' })],
      savedQueries: [savedQuery('Borges favoritos')],
      serverResults: server({
        momentos: [
          {
            id: 'momento-1',
            kind: 'nota',
            text: 'Borges en notas',
            capturedAt: '2026-01-01',
            score: 0.7,
          },
        ],
        cronicas: [
          { id: 'cronica-1', year: 2026, month: 1, text: 'Borges año', score: 0.6 },
        ],
        chat: [
          {
            id: 'chat-1',
            threadId: 'thread-1',
            threadTitle: null,
            role: 'assistant',
            text: 'Borges chat',
            score: 0.5,
          },
        ],
      }),
      sectionAliases: {},
      visibility: DEFAULT_VISIBILITY,
    })

    const descriptions = items.map(describeCommandSearchItem)
    expect(new Set(descriptions.map((item) => item.key)).size).toBe(descriptions.length)
    expect(descriptions.every((item) => item.label.trim().length > 0)).toBe(true)
    expect(descriptions.some((item) => item.kind === 'ask')).toBe(true)
    expect(descriptions.some((item) => item.kind === 'savedQuery')).toBe(true)
    expect(descriptions.some((item) => item.kind === 'chat')).toBe(true)
  })

  describe('gramática', () => {
    const base = {
      actionsEnabled: true,
      localSearchEnabled: true,
      entities: [entity({ id: 'e-borges', name: 'Borges' })],
      quotes: [quote({ id: 'q-1', entityId: 'e-borges', text: 'Borges soñaba tigres' })],
      savedQueries: [savedQuery('Borges y compañía')],
      serverResults: server({
        momentos: [
          { id: 'm-1', kind: 'nota', text: 'Releí a Borges', score: 1 },
        ] as unknown as SearchResponse['momentos'],
      }),
      sectionAliases: {},
      visibility: DEFAULT_VISIBILITY,
    }
    const kinds = (query: string) => [
      ...new Set(buildCommandSearchItems({ ...base, query }).map((item) => item.kind)),
    ]

    it('un sigilo acota los grupos; sin sigilo se busca en todo', () => {
      expect(kinds('borges')).toEqual(['savedQuery', 'entity', 'quote', 'momento', 'ask'])
      expect(kinds('@borges')).toEqual(['entity'])
      expect(kinds('?borges')).toEqual(['ask', 'savedQuery'])
      expect(kinds('>nueva')).toEqual(['action'])
      expect(kinds('#claves')).toEqual(['reveal'])
    })

    it('con «?» la pregunta va primera y basta un carácter; sin sigilo, al final y desde tres', () => {
      expect(buildCommandSearchItems({ ...base, query: '?x' })[0]).toEqual({
        kind: 'ask',
        q: 'x',
      })
      const libre = buildCommandSearchItems({ ...base, query: 'borges' })
      expect(libre[libre.length - 1]).toEqual({ kind: 'ask', q: 'borges' })
      expect(kinds('bo')).not.toContain('ask')
    })

    it('un sigilo solo enseña todo su alcance', () => {
      const secciones = buildCommandSearchItems({ ...base, query: '#' })
      expect(secciones.length).toBeGreaterThan(3)
      expect(kinds('#')).toEqual(['reveal', 'view'])
      expect(kinds('>')).toEqual(['view', 'action'])
      expect(kinds('?')).toEqual(['savedQuery'])
    })

    it('el contenido del anfitrión va tras las secciones, y solo sin sigilo', () => {
      const nota: CommandSearchContentItem = {
        kind: 'content',
        id: 'note:n1',
        icon: 'note',
        section: 'notas',
        label: 'Borges en la feria',
      }
      const tipos = (query: string) => [
        ...new Set(
          buildCommandSearchItems({ ...base, contentItems: [nota], query }).map(
            (item) => item.kind,
          ),
        ),
      ]
      expect(tipos('borges')[0]).toBe('content')
      for (const conSigilo of ['?borges', '>borges', '@borges', '#borges']) {
        expect(tipos(conSigilo)).not.toContain('content')
      }
      expect(describeCommandSearchItem(nota).key).toBe('content:note:n1')
    })

    it('«#» encuentra una vista por su alias, y los alias de Notas siguen primero', () => {
      const conAlias = { ...base, sectionAliases: { grafo: 'mapa' } }
      expect(buildCommandSearchItems({ ...conAlias, query: '#mapa' })[0]).toMatchObject({
        kind: 'view',
        view: 'grafo',
      })
      expect(buildCommandSearchItems({ ...conAlias, query: '#pass' })[0]).toMatchObject({
        kind: 'reveal',
        moduleId: 'claves',
      })
    })
  })
})
