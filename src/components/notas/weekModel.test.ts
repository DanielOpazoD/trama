import { describe, it, expect } from 'vitest'
import type { Task } from '../../api'
import {
  rawTaskWeek,
  effectiveWeek,
  groupTasksByWeek,
  splitByStatus,
  pendingMonthsForYear,
  sortPending,
} from './weekModel'

const TODAY_WEEK = '2026-06-01' // lunes

function makeTask(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? over.id,
    detail: over.detail ?? null,
    done: over.done ?? false,
    dueDate: over.dueDate ?? null,
    priority: over.priority ?? 'media',
    weekStart: over.weekStart ?? TODAY_WEEK,
    completedAt: over.completedAt ?? null,
    tags: over.tags ?? [],
    createdAt: over.createdAt ?? '2026-06-01T10:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-01T10:00:00.000Z',
  }
}

describe('weekModel', () => {
  describe('rawTaskWeek', () => {
    it('usa weekStart cuando es válido', () => {
      expect(rawTaskWeek({ weekStart: '2026-05-25', createdAt: 'x' })).toBe('2026-05-25')
    })
    it('cae a la semana de createdAt si weekStart falta o es inválido', () => {
      // 2026-05-28 es jueves → su lunes es 2026-05-25
      expect(rawTaskWeek({ weekStart: '', createdAt: '2026-05-28T12:00:00.000Z' })).toBe(
        '2026-05-25',
      )
    })
  })

  describe('effectiveWeek (arrastre)', () => {
    it('arrastra un pendiente de una semana anterior a la semana actual', () => {
      const t = makeTask({ id: 'a', done: false, weekStart: '2026-05-25' })
      expect(effectiveWeek(t, TODAY_WEEK)).toBe(TODAY_WEEK)
    })
    it('NO arrastra si está hecho — queda en su semana (historial)', () => {
      const t = makeTask({ id: 'b', done: true, weekStart: '2026-05-25' })
      expect(effectiveWeek(t, TODAY_WEEK)).toBe('2026-05-25')
    })
    it('no toca pendientes de la semana actual o futura', () => {
      expect(
        effectiveWeek(makeTask({ id: 'c', weekStart: TODAY_WEEK }), TODAY_WEEK),
      ).toBe(TODAY_WEEK)
      expect(
        effectiveWeek(makeTask({ id: 'd', weekStart: '2026-06-08' }), TODAY_WEEK),
      ).toBe('2026-06-08')
    })
  })

  describe('groupTasksByWeek', () => {
    it('agrupa por semana efectiva (con arrastre)', () => {
      const tasks = [
        makeTask({ id: 'viejo-pend', done: false, weekStart: '2026-05-25' }),
        makeTask({ id: 'viejo-hecho', done: true, weekStart: '2026-05-25' }),
        makeTask({ id: 'actual', weekStart: TODAY_WEEK }),
        makeTask({ id: 'futuro', weekStart: '2026-06-08' }),
      ]
      const map = groupTasksByWeek(tasks, TODAY_WEEK)
      expect(
        map
          .get(TODAY_WEEK)
          ?.map((t) => t.id)
          .sort(),
      ).toEqual(['actual', 'viejo-pend'])
      expect(map.get('2026-05-25')?.map((t) => t.id)).toEqual(['viejo-hecho'])
      expect(map.get('2026-06-08')?.map((t) => t.id)).toEqual(['futuro'])
    })
  })

  describe('splitByStatus', () => {
    it('ordena pendientes por prioridad (alta→baja) y separa hechas', () => {
      const items = [
        makeTask({ id: 'baja', priority: 'baja', createdAt: '2026-06-01T01:00:00Z' }),
        makeTask({ id: 'alta', priority: 'alta', createdAt: '2026-06-01T02:00:00Z' }),
        makeTask({ id: 'media', priority: 'media', createdAt: '2026-06-01T03:00:00Z' }),
        makeTask({ id: 'hecha', done: true, completedAt: '2026-06-02T00:00:00Z' }),
      ]
      const { pending, done } = splitByStatus(items)
      expect(pending.map((t) => t.id)).toEqual(['alta', 'media', 'baja'])
      expect(done.map((t) => t.id)).toEqual(['hecha'])
    })
  })

  describe('pendingMonthsForYear', () => {
    it('marca el mes actual por arrastre y los meses futuros con pendientes', () => {
      const tasks = [
        makeTask({ id: 'arrastrado', done: false, weekStart: '2026-03-02' }), // viejo → junio
        makeTask({ id: 'futuro-jul', done: false, weekStart: '2026-07-06' }), // julio
        makeTask({ id: 'hecho-viejo', done: true, weekStart: '2026-02-02' }), // no cuenta
      ]
      const months = pendingMonthsForYear(tasks, 2026, TODAY_WEEK)
      expect([...months].sort((a, b) => a - b)).toEqual([5, 6]) // junio, julio
    })
  })

  describe('sortPending', () => {
    it('descarta hechas y ordena por prioridad', () => {
      const tasks = [
        makeTask({ id: 'media' }),
        makeTask({ id: 'alta', priority: 'alta' }),
        makeTask({ id: 'hecha', done: true }),
      ]
      expect(sortPending(tasks).map((t) => t.id)).toEqual(['alta', 'media'])
    })
  })
})
