import { describe, expect, it } from 'vitest'
import { collectPendientes, parsePlan, renderPendientes } from './pendientes.mjs'

const PLAN = `# El PDF que se subía y no se podía borrar

## Problema

Texto.

## Pendiente

- El dominio sigue siendo de **sólo escritura**: no
  existe endpoint que sirva el blob, así que esos PDFs aparecen sin
  miniatura.
- Queda una carrera anterior a este cambio.
- Esto ya quedó resuelto en #420.

## Otra sección

- Este no es un pendiente.
`

describe('parsePlan', () => {
  it('junta las líneas de continuación de cada ítem y se detiene en la siguiente sección', () => {
    const plan = parsePlan(PLAN, '2026-08-17-imprenta-blob-huerfano.md')
    expect(plan.title).toBe('El PDF que se subía y no se podía borrar')
    expect(plan.date).toBe('2026-08-17')
    expect(plan.items).toEqual([
      'El dominio sigue siendo de **sólo escritura**: no existe endpoint que sirva el blob, así que esos PDFs aparecen sin miniatura.',
      'Queda una carrera anterior a este cambio.',
    ])
  })

  it('omite los ítems que el autor marcó como resueltos', () => {
    const plan = parsePlan(PLAN, 'x.md')
    expect(plan.items.some((item) => item.includes('#420'))).toBe(false)
  })

  it('un plan sin sección Pendiente no aporta ítems', () => {
    expect(parsePlan('# Título\n\n## Problema\n\n- algo\n', 'y.md').items).toEqual([])
  })
})

describe('renderPendientes', () => {
  it('cuenta el total, enlaza cada plan y advierte que es generado', () => {
    const out = renderPendientes([
      { file: 'a.md', title: 'A', date: '2026-09-01', items: ['uno', 'dos'] },
      { file: 'b.md', title: 'B', date: '2026-08-01', items: ['tres'] },
    ])
    expect(out).toContain('**3 pendientes** en 2 planes')
    expect(out).toContain('## 2026-09-01 · A')
    expect(out).toContain('[a.md](superpowers/plans/a.md)')
    expect(out).toContain('- tres')
    expect(out).toContain('GENERADO por `npm run pendientes`')
  })
})

describe('collectPendientes (repo real)', () => {
  it('lee los planes del repo, del más reciente al más viejo, y todos traen ítems', () => {
    const plans = collectPendientes()
    expect(plans.length).toBeGreaterThan(0)
    const dates = plans.map((plan) => plan.date)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(plans.every((plan) => plan.items.length > 0)).toBe(true)
  })
})
