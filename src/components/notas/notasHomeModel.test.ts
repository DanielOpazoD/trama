import { describe, expect, it } from 'vitest'
import type { Note, Prompt, Task } from '../../api'
import { buildNotasHomeModel } from './notasHomeModel'

function task(input: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail ?? null,
    done: input.done ?? false,
    dueDate: input.dueDate ?? null,
    priority: input.priority ?? 'media',
    weekStart: input.weekStart ?? '2026-06-29',
    category: input.category ?? 'trabajo',
    completedAt: input.completedAt ?? null,
    hasPhotos: input.hasPhotos ?? false,
    origin: input.origin ?? null,
    tags: input.tags ?? [],
    createdAt: input.createdAt ?? '2026-07-01T10:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-07-01T10:00:00.000Z',
  }
}

function note(input: Partial<Note> & Pick<Note, 'id' | 'content'>): Note {
  return {
    id: input.id,
    content: input.content,
    title: input.title ?? null,
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    promotedMomentoId: input.promotedMomentoId ?? null,
    source: input.source ?? null,
    createdAt: input.createdAt ?? '2026-07-01T10:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-07-01T10:00:00.000Z',
    hasImages: input.hasImages ?? false,
    hasAudio: input.hasAudio ?? false,
  }
}

function prompt(input: Partial<Prompt> & Pick<Prompt, 'id' | 'title'>): Prompt {
  return {
    id: input.id,
    title: input.title,
    content: input.content ?? 'Plantilla',
    collection: input.collection ?? null,
    tags: input.tags ?? [],
    variables: input.variables ?? [],
    favorite: input.favorite ?? false,
    useCount: input.useCount ?? 0,
    lastUsedAt: input.lastUsedAt ?? null,
    createdAt: input.createdAt ?? '2026-07-01T10:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-07-01T10:00:00.000Z',
  }
}

describe('notasHomeModel', () => {
  it('prioriza el centro diario con pendientes heredadas y críticas', () => {
    const model = buildNotasHomeModel({
      todayWeek: '2026-07-06',
      notes: [note({ id: 'n1', content: 'Foco', pinned: true })],
      tasks: [
        task({
          id: 'old-high',
          title: 'Resolver contrato',
          priority: 'alta',
          weekStart: '2026-06-22',
          createdAt: '2026-06-22T10:00:00.000Z',
        }),
        task({
          id: 'current-medium',
          title: 'Responder correo',
          priority: 'media',
          weekStart: '2026-07-06',
          createdAt: '2026-07-06T10:00:00.000Z',
        }),
        task({
          id: 'done-old',
          title: 'Ya resuelta',
          done: true,
          priority: 'alta',
          weekStart: '2026-06-22',
        }),
      ],
      prompts: [],
    })

    expect(model.daily.pendingCount).toBe(2)
    expect(model.daily.inheritedCount).toBe(1)
    expect(model.daily.criticalCount).toBe(1)
    expect(model.daily.headline).toBe('2 pendientes · 1 heredada · 1 crítica')
    expect(model.pendingPreview.map((item) => item.id)).toEqual([
      'old-high',
      'current-medium',
    ])
    expect(model.inheritedTasks.map((item) => item.id)).toEqual(['old-high'])
    expect(model.currentTasks.map((item) => item.id)).toEqual(['current-medium'])
  })

  it('arma una bandeja de notas recientes sin clasificar ni fijar', () => {
    const model = buildNotasHomeModel({
      todayWeek: '2026-07-06',
      notes: [
        note({
          id: 'whatsapp',
          content: 'Revisar audio de WhatsApp',
          source: 'whatsapp',
          updatedAt: '2026-07-06T12:00:00.000Z',
        }),
        note({
          id: 'untagged',
          content: 'Idea sin etiqueta',
          updatedAt: '2026-07-06T11:00:00.000Z',
        }),
        note({
          id: 'pinned',
          content: 'Nota fijada',
          pinned: true,
          updatedAt: '2026-07-06T13:00:00.000Z',
        }),
        note({
          id: 'promoted',
          content: 'Ya promovida',
          promotedMomentoId: 'm1',
          updatedAt: '2026-07-06T14:00:00.000Z',
        }),
        note({
          id: 'tagged',
          content: 'Ya clasificada',
          tags: ['obra'],
          updatedAt: '2026-07-06T15:00:00.000Z',
        }),
        note({
          id: 'whatsapp-tagged',
          content: 'WhatsApp ya clasificado',
          source: 'whatsapp',
          tags: ['obra'],
          updatedAt: '2026-07-06T16:00:00.000Z',
        }),
      ],
      tasks: [],
      prompts: [prompt({ id: 'p1', title: 'Prompt favorito', favorite: true })],
    })

    expect(model.noteInbox.map((item) => item.id)).toEqual(['whatsapp', 'untagged'])
    expect(model.noteInbox[0]?.reason).toBe('vía WhatsApp')
    expect(model.noteInbox[1]?.reason).toBe('sin etiquetas')
    expect(model.topNotes.map((item) => item.id)).toEqual([
      'pinned',
      'whatsapp-tagged',
      'tagged',
    ])
    expect(model.daily.subline).toBe('2 notas recientes esperan clasificación.')
    expect(model.topPrompts.map((item) => item.id)).toEqual(['p1'])
  })
})
