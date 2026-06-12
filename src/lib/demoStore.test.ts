import { beforeEach, describe, expect, it } from 'vitest'

import { loadDemoStore, saveDemoStore, STORE_KEY } from './demoStore'

beforeEach(() => {
  window.localStorage.clear()
})

describe('demoStore', () => {
  it('normaliza stores parciales persistidos', () => {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ entities: [{ id: 'e1', created_at: 'x', updated_at: 'x' }] }),
    )

    const store = loadDemoStore()

    expect(store.entities).toHaveLength(1)
    expect(store.relationships).toEqual([])
    expect(store.user_prefs).toEqual({})
  })

  it('re-siembra cuando localStorage esta corrupto', () => {
    window.localStorage.setItem(STORE_KEY, '{')

    const store = loadDemoStore()

    expect(store.entities.some((entity) => entity.id === 'e-borges')).toBe(true)
    expect(window.localStorage.getItem(STORE_KEY)).toContain('e-borges')
  })

  it('persiste stores completos', () => {
    const store = loadDemoStore()
    store.notes.push({
      id: 'n-extra',
      content: 'extra',
      created_at: 'x',
      updated_at: 'x',
    })

    saveDemoStore(store)

    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}').notes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'n-extra' })]),
    )
  })
})
