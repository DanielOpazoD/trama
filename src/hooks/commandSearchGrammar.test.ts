import { describe, expect, it } from 'vitest'
import { parseCommandQuery, serverQueryFor } from './commandSearchGrammar'

describe('parseCommandQuery', () => {
  it.each([
    ['borges', { scope: 'todo', text: 'borges' }],
    ['  borges  ', { scope: 'todo', text: 'borges' }],
    ['?qué leí en marzo', { scope: 'preguntar', text: 'qué leí en marzo' }],
    ['> ajustes', { scope: 'comandos', text: 'ajustes' }],
    ['@borges', { scope: 'entidades', text: 'borges' }],
    ['#pass', { scope: 'secciones', text: 'pass' }],
    ['#', { scope: 'secciones', text: '' }],
    [' ?literal', { scope: 'todo', text: '?literal' }],
    ['¿qué leí?', { scope: 'todo', text: '¿qué leí?' }],
  ])('«%s»', (raw, esperado) => {
    expect(parseCommandQuery(raw)).toEqual(esperado)
  })
})

describe('serverQueryFor', () => {
  it('solo pide al servidor los alcances con contenido que traer', () => {
    expect(serverQueryFor('borges')).toBe('borges')
    expect(serverQueryFor('@borges')).toBe('borges')
    expect(serverQueryFor('?borges')).toBe('')
    expect(serverQueryFor('>ajustes')).toBe('')
    expect(serverQueryFor('#pass')).toBe('')
  })
})
