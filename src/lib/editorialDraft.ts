import type { KnowledgeInboxItem } from './knowledgeWorkflow'

export type NarrativeSection = {
  title: string
  prompt: string
  itemIds: string[]
}

export type NarrativeProposal = {
  thesis: string
  outline: NarrativeSection[]
  gaps: string[]
}

export function buildNarrativeProposal(items: KnowledgeInboxItem[]): NarrativeProposal {
  if (items.length === 0) {
    return {
      thesis: 'Selecciona materiales para que Trama proponga un hilo de escritura.',
      outline: [],
      gaps: ['Añadir materiales a la mesa de lectura.'],
    }
  }

  const strongest = [...items].sort((a, b) => b.score - a.score)
  const first = strongest[0]!
  const second = strongest[1] ?? first
  const titlePair =
    first.id === second.id ? first.title : `${first.title} y ${second.title}`

  return {
    thesis: `Explorar cómo ${titlePair} abren un hilo común: ${cleanExcerpt(first.excerpt)}.`,
    outline: [
      {
        title: '1. Punto de entrada',
        prompt: `Abrir con ${first.title} y formular la pregunta central.`,
        itemIds: [first.id],
      },
      {
        title: '2. Nudo de lectura',
        prompt: `Cruzar los materiales y explicar qué tensión aparece entre ${items
          .slice(0, 3)
          .map((item) => item.title)
          .join(', ')}.`,
        itemIds: items.slice(0, 3).map((item) => item.id),
      },
      {
        title: '3. Salida posible',
        prompt: 'Cerrar con una hipótesis breve y una lista de decisiones pendientes.',
        itemIds: strongest.slice(0, 2).map((item) => item.id),
      },
    ],
    gaps: proposalGaps(items),
  }
}

export function buildEditorialMarkdown(
  items: KnowledgeInboxItem[],
  proposal = buildNarrativeProposal(items),
): string {
  const lines = [
    '# Borrador desde Trama',
    '',
    '## Tesis provisional',
    proposal.thesis,
    '',
    '## Estructura',
  ]

  if (proposal.outline.length === 0) {
    lines.push('- Definir una estructura a partir de materiales seleccionados.')
  } else {
    for (const section of proposal.outline) {
      lines.push(`- **${section.title}**: ${section.prompt}`)
    }
  }

  lines.push('', '## Materiales')
  if (items.length === 0) {
    lines.push('- Sin materiales seleccionados.')
  } else {
    for (const item of items) {
      lines.push(`- **${sourceLabel(item.source)} · ${item.title}**`)
      if (item.excerpt) {
        lines.push(`  > ${cleanExcerpt(item.excerpt)}`)
      }
      if (item.href) {
        lines.push(`  Fuente: ${item.href}`)
      }
    }
  }

  lines.push('', '## Huecos a revisar')
  for (const gap of proposal.gaps) {
    lines.push(`- ${gap}`)
  }

  return lines.join('\n')
}

function proposalGaps(items: KnowledgeInboxItem[]): string[] {
  const gaps: string[] = []
  if (!items.some((item) => item.source === 'recorte')) {
    gaps.push('Añadir al menos un recorte o fuente externa.')
  }
  if (!items.some((item) => item.excerpt.includes('«'))) {
    gaps.push('Añadir al menos una cita textual ya curada.')
  }
  if (!items.some((item) => item.source === 'suggestion')) {
    gaps.push('Revisar si falta una relación o tensión entre entidades.')
  }
  gaps.push('Confirmar las entidades centrales antes de exportar.')
  return [...new Set(gaps)]
}

function cleanExcerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140)
}

function sourceLabel(source: KnowledgeInboxItem['source']): string {
  if (source === 'recorte') return 'recorte'
  if (source === 'suggestion') return 'sugerencia'
  if (source === 'task') return 'tarea'
  return 'nota'
}
