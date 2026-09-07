import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildChunkGraph,
  chunkName,
  findCycle,
  staticImports,
} from './check-chunk-graph.mjs'

describe('check-chunk-graph', () => {
  it('lee los imports estáticos de la cabecera e ignora los import() dinámicos', () => {
    const source =
      'import{o as e}from"./rolldown-runtime-C0FnF6B9.js";import{d as t}from"./vendor-react-CuzF0Znx.js";' +
      'import"./efectos-AAAAAAAA.js";var x=()=>import("./contracts-peR31V3u.js");export{x}'
    expect(staticImports(source)).toEqual([
      'rolldown-runtime-C0FnF6B9.js',
      'vendor-react-CuzF0Znx.js',
      'efectos-AAAAAAAA.js',
    ])
  })

  it('nombra el chunk sin su hash', () => {
    expect(chunkName('vendor-react-CuzF0Znx.js')).toBe('vendor-react')
    expect(chunkName('index-BG10_3-O.js')).toBe('index')
  })

  it('encuentra el ciclo vendor-react ↔ vendor-query que dejó producción en blanco', () => {
    const graph = new Map([
      ['index-AAAAAAAA.js', ['vendor-react-BBBBBBBB.js']],
      ['vendor-react-BBBBBBBB.js', ['vendor-query-CCCCCCCC.js', 'scheduler-DDDDDDDD.js']],
      ['vendor-query-CCCCCCCC.js', ['vendor-react-BBBBBBBB.js']],
      ['scheduler-DDDDDDDD.js', []],
    ])
    expect(findCycle(graph)?.map(chunkName)).toEqual([
      'vendor-react',
      'vendor-query',
      'vendor-react',
    ])
  })

  it('un grafo acíclico pasa, aunque un chunk importe a otro que ya no existe', () => {
    const graph = new Map([
      ['index-AAAAAAAA.js', ['vendor-react-BBBBBBBB.js', 'fantasma-ZZZZZZZZ.js']],
      ['vendor-react-BBBBBBBB.js', ['scheduler-DDDDDDDD.js']],
      ['scheduler-DDDDDDDD.js', []],
    ])
    expect(findCycle(graph)).toBeNull()
  })

  it('construye el grafo desde un directorio de chunks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trama-chunk-graph-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a-AAAAAAAA.js'), 'import{x}from"./b-BBBBBBBB.js";export{x}')
    writeFileSync(join(dir, 'b-BBBBBBBB.js'), 'export const x=1')
    writeFileSync(join(dir, 'c-CCCCCCCC.css'), 'body{}')
    const graph = buildChunkGraph(dir)
    expect([...graph.keys()].sort()).toEqual(['a-AAAAAAAA.js', 'b-BBBBBBBB.js'])
    expect(findCycle(graph)).toBeNull()
  })
})
