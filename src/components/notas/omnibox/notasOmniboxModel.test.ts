import { describe, expect, it, vi } from 'vitest'
import type { Note, Prompt, Task } from '../../../api'
import { buildNotasOmniboxItems, NOTAS_OMNIBOX_GROUP_LIMIT } from './notasOmniboxModel'

const FECHA = '2026-09-01T10:00:00.000Z'
const VISIBLE = { note: false, task: false, prompt: false }

function nota(id: string, content: string, title: string | null = null): Note {
  return {
    id,
    content,
    title,
    tags: [],
    pinned: false,
    promotedMomentoId: null,
    source: null,
    createdAt: FECHA,
    updatedAt: FECHA,
    hasImages: false,
    hasAudio: false,
  }
}

function tarea(id: string, title: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title,
    detail: null,
    done: false,
    dueDate: null,
    priority: 'media',
    weekStart: '2026-08-31',
    category: 'trabajo',
    completedAt: null,
    hasPhotos: false,
    origin: null,
    tags: [],
    createdAt: FECHA,
    updatedAt: FECHA,
    ...extra,
  }
}

function prompt(id: string, title: string, extra: Partial<Prompt> = {}): Prompt {
  return {
    id,
    title,
    content: 'Lee {{texto}}',
    collection: null,
    tags: [],
    variables: [],
    favorite: false,
    useCount: 0,
    lastUsedAt: null,
    createdAt: FECHA,
    updatedAt: FECHA,
    ...extra,
  }
}

function construir(
  text: string,
  datos: { notes?: Note[]; tasks?: Task[]; prompts?: Prompt[] },
  hidden = VISIBLE,
  actions = { completeTask: vi.fn(), copyPrompt: vi.fn() },
) {
  return buildNotasOmniboxItems({
    text,
    notes: datos.notes ?? [],
    tasks: datos.tasks ?? [],
    prompts: datos.prompts ?? [],
    hidden,
    actions,
  })
}

describe('buildNotasOmniboxItems', () => {
  it('busca sin tildes y desde dos caracteres', () => {
    const notes = [nota('n1', 'Comprar la edición anotada de #Ficciones.')]
    expect(construir('edicion', { notes }).map((item) => item.id)).toEqual(['note:n1'])
    expect(construir('e', { notes })).toEqual([])
  })

  it('el título pesa más que el contenido, y cada grupo trae a lo más cinco', () => {
    const notes = [nota('n1', 'algo sobre borges'), nota('n2', 'otra cosa', 'Borges')]
    expect(construir('borges', { notes }).map((item) => item.id)).toEqual([
      'note:n2',
      'note:n1',
    ])
    const muchas = Array.from({ length: 8 }, (_, i) => nota(`n${i}`, `tinta ${i}`))
    expect(construir('tinta', { notes: muchas })).toHaveLength(NOTAS_OMNIBOX_GROUP_LIMIT)
  })

  it('un grupo protegido no aporta nada aunque haya datos', () => {
    const items = construir(
      'tinta',
      { notes: [nota('n1', 'tinta')], tasks: [tarea('t1', 'Comprar tinta')] },
      { note: true, task: false, prompt: false },
    )
    expect(items.map((item) => item.id)).toEqual(['task:t1'])
  })

  it('una tarea pendiente se marca, una hecha no ofrece acción, y un prompt se copia', () => {
    const actions = { completeTask: vi.fn(), copyPrompt: vi.fn() }
    const pendiente = tarea('t1', 'Comprar tinta')
    const guion = prompt('p1', 'Tinta y papel')
    const items = construir(
      'tinta',
      {
        tasks: [pendiente, tarea('t2', 'Tinta china', { done: true })],
        prompts: [guion],
      },
      VISIBLE,
      actions,
    )
    const porId = new Map(items.map((item) => [item.id, item]))

    expect(porId.get('task:t1')).toMatchObject({
      section: 'tareas',
      secondary: { label: 'hecha', ariaLabel: 'Marcar hecha: Comprar tinta' },
    })
    expect(porId.get('task:t2')?.secondary).toBeUndefined()
    porId.get('task:t1')?.secondary?.run()
    expect(actions.completeTask).toHaveBeenCalledWith(pendiente)

    expect(porId.get('prompt:p1')).toMatchObject({
      section: 'prompts',
      secondary: { label: 'copiar', ariaLabel: 'Copiar prompt: Tinta y papel' },
    })
    porId.get('prompt:p1')?.secondary?.run()
    expect(actions.copyPrompt).toHaveBeenCalledWith(guion)
  })

  it('tolera campos vacíos: sin título, la nota se nombra por su primera línea', () => {
    const items = construir('pan', {
      notes: [nota('n1', '\nAcordarme de comprar pan\ny leche')],
      prompts: [prompt('p1', 'Pan casero', { content: '' })],
    })
    expect(items.find((item) => item.id === 'note:n1')?.label).toBe(
      'Acordarme de comprar pan',
    )
    expect(items.find((item) => item.id === 'prompt:p1')?.hint).toBe('prompt')
  })
})
