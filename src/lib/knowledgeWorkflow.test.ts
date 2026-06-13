import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeInbox,
  knowledgeInboxCounts,
  type KnowledgeWorkflowInput,
} from './knowledgeWorkflow'

const INPUT: KnowledgeWorkflowInput = {
  recortes: [
    {
      id: 'r1',
      status: 'pending',
      text: 'Recorte central sobre memoria y forma.',
      sourceTitle: 'Ensayo de la memoria',
      sourceAuthor: 'Otra Parte',
      sourceUrl: 'https://example.com/memoria',
      captureMode: 'citation',
      note: 'conecta con Borges',
      createdAt: '2026-06-12T10:00:00Z',
      updatedAt: '2026-06-12T10:00:00Z',
    },
    {
      id: 'r2',
      status: 'promoted',
      text: 'Ya curado',
      sourceTitle: 'Archivo',
      sourceAuthor: null,
      sourceUrl: null,
      captureMode: 'citation',
      note: null,
      createdAt: '2026-06-12T12:00:00Z',
      updatedAt: '2026-06-12T12:00:00Z',
    },
  ],
  suggestions: [
    {
      id: 's1',
      kind: 'relationship',
      payload: {
        fromName: 'Borges',
        toName: 'Ficciones',
        type: 'escribió',
        reason: 'Aparecen juntos varias veces.',
      },
      status: 'pending',
      provider: 'openai',
      model: 'gpt-test',
      createdAt: '2026-06-12T11:00:00Z',
      statusChangedAt: null,
    },
  ],
  notes: [
    {
      id: 'n1',
      title: 'Idea de ensayo',
      content: 'Idea larga para revisar antes de escribir.',
      tags: ['ensayo'],
      pinned: true,
      promotedMomentoId: null,
      hasImages: false,
      createdAt: '2026-06-12T09:00:00Z',
      updatedAt: '2026-06-12T09:00:00Z',
    },
  ],
  tasks: [
    {
      id: 't1',
      title: 'Escribir borrador',
      detail: 'Convertir los recortes en una tesis.',
      done: false,
      dueDate: '2026-06-13',
      priority: 'alta',
      weekStart: '2026-06-08',
      category: 'trabajo',
      completedAt: null,
      hasPhotos: false,
      tags: ['ensayo'],
      createdAt: '2026-06-12T08:00:00Z',
      updatedAt: '2026-06-12T08:00:00Z',
    },
  ],
}

describe('knowledge workflow inbox', () => {
  it('normaliza fuentes pendientes y las ordena por urgencia intelectual', () => {
    const inbox = buildKnowledgeInbox(INPUT)

    expect(inbox.map((item) => item.id)).toEqual([
      'task:t1',
      'suggestion:s1',
      'recorte:r1',
      'note:n1',
    ])
    expect(inbox[0]).toMatchObject({
      source: 'task',
      title: 'Escribir borrador',
      urgency: 'alta',
      actionLabel: 'convertir en avance',
    })
    expect(inbox[1]).toMatchObject({
      source: 'suggestion',
      title: 'Relación sugerida: Borges → Ficciones',
      actionLabel: 'revisar sugerencia',
    })
    expect(inbox[2]).toMatchObject({
      source: 'recorte',
      title: 'Ensayo de la memoria',
      actionLabel: 'curar recorte',
    })
    expect(inbox[3]).toMatchObject({
      source: 'note',
      title: 'Idea de ensayo',
      actionLabel: 'llevar a mesa',
    })
  })

  it('resume conteos por fuente para la cabecera del flujo', () => {
    expect(knowledgeInboxCounts(buildKnowledgeInbox(INPUT))).toEqual({
      total: 4,
      recortes: 1,
      suggestions: 1,
      notes: 1,
      tasks: 1,
      high: 2,
    })
  })
})
