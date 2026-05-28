import { useMemo, useState } from 'react'
import { useAddEntity, useAddRelationship, useAddQuote } from '../state'

type CuratedQuote = {
  text: string
  author: string
  source?: string
}

// A small rotating set of opening lines. Picked for tone, not for fame.
const QUOTES: CuratedQuote[] = [
  {
    text: 'En el centro del invierno aprendí finalmente que había en mí un verano invencible.',
    author: 'Albert Camus',
    source: 'El verano',
  },
  {
    text: 'Love is the difficult realization that something other than oneself is real.',
    author: 'Iris Murdoch',
    source: 'The Sovereignty of Good',
  },
  {
    text: 'Cada lectura es un acto de complicidad con un autor, en presencia de un libro.',
    author: 'Alfonso Reyes',
    source: 'El deslinde',
  },
  {
    text: 'Cualquier libro que ayude a un niño a formar el hábito de leer, a hacer de la lectura una de sus necesidades profundas y continuas, es bueno para él.',
    author: 'Maya Angelou',
  },
  {
    text: 'La realidad es lo que, cuando dejas de creer en ella, no se desvanece.',
    author: 'Philip K. Dick',
    source: 'How to Build a Universe...',
  },
]

function pickQuote(): CuratedQuote {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)]!
}

// A small curated seed graph to help users see what Trama is meant to feel like.
type SeedEntity = {
  tempId: string
  type: 'persona' | 'libro' | 'concepto' | 'idea'
  name: string
  year?: number
  description?: string
}
type SeedRelation = {
  fromTempId: string
  toTempId: string
  type: 'influye_en' | 'asociado_con' | 'cita_a'
}
type SeedQuote = {
  entityTempId: string
  text: string
  source?: string
}

const SEED_ENTITIES: SeedEntity[] = [
  {
    tempId: 'camus',
    type: 'persona',
    name: 'Albert Camus',
    year: 1913,
    description: 'escritor y filósofo argelino-francés',
  },
  {
    tempId: 'extranjero',
    type: 'libro',
    name: 'El extranjero',
    year: 1942,
    description: 'novela sobre la indiferencia y el absurdo',
  },
  {
    tempId: 'murdoch',
    type: 'persona',
    name: 'Iris Murdoch',
    year: 1919,
    description: 'novelista y filósofa moral británica',
  },
  {
    tempId: 'absurdo',
    type: 'concepto',
    name: 'absurdo',
    description: 'tensión entre el sentido humano y el silencio del mundo',
  },
  {
    tempId: 'atencion',
    type: 'concepto',
    name: 'atención',
    description: 'forma de mirar lenta que constituye un acto ético',
  },
]

const SEED_RELATIONS: SeedRelation[] = [
  { fromTempId: 'camus', toTempId: 'extranjero', type: 'cita_a' },
  { fromTempId: 'extranjero', toTempId: 'absurdo', type: 'asociado_con' },
  { fromTempId: 'camus', toTempId: 'absurdo', type: 'influye_en' },
  { fromTempId: 'murdoch', toTempId: 'atencion', type: 'asociado_con' },
  { fromTempId: 'camus', toTempId: 'murdoch', type: 'asociado_con' },
]

const SEED_QUOTES: SeedQuote[] = [
  {
    entityTempId: 'camus',
    text: 'En el centro del invierno aprendí finalmente que había en mí un verano invencible.',
    source: 'El verano',
  },
  {
    entityTempId: 'murdoch',
    text: 'Love is the difficult realization that something other than oneself is real.',
    source: 'The Sovereignty of Good',
  },
]

export function EmptyState() {
  const addEntity = useAddEntity()
  const addRelationship = useAddRelationship()
  const addQuote = useAddQuote()
  const [seeding, setSeeding] = useState(false)
  const quote = useMemo(pickQuote, [])

  async function handleLoadExample() {
    setSeeding(true)
    try {
      const idByTemp = new Map<string, string>()
      for (const e of SEED_ENTITIES) {
        const created = await addEntity.mutateAsync({
          type: e.type,
          name: e.name,
          year: e.year,
          description: e.description,
        })
        idByTemp.set(e.tempId, created.id)
      }
      for (const r of SEED_RELATIONS) {
        const fromId = idByTemp.get(r.fromTempId)
        const toId = idByTemp.get(r.toTempId)
        if (!fromId || !toId) continue
        await addRelationship.mutateAsync({
          fromId,
          toId,
          type: r.type,
        })
      }
      for (const q of SEED_QUOTES) {
        const entityId = idByTemp.get(q.entityTempId)
        if (!entityId) continue
        await addQuote.mutateAsync({
          entityId,
          text: q.text,
          source: q.source,
        })
      }
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center px-8">
      <div className="max-w-2xl text-center space-y-12">
        <figure className="space-y-4">
          <blockquote className="quote-block text-2xl md:text-3xl text-ink-600 leading-relaxed text-balance">
            «{quote.text}»
          </blockquote>
          <figcaption className="text-sm text-ink-300">
            — {quote.author}
            {quote.source && <span className="text-ink-300 ml-2">· {quote.source}</span>}
          </figcaption>
        </figure>

        <div className="space-y-3 pt-8 border-t border-ink-100/60">
          <p className="text-ink-400 text-sm leading-relaxed max-w-md mx-auto">
            Trama es tu mapa de afinidades intelectuales y estéticas. Empieza pegando un
            texto en la barra de abajo, o carga un pequeño ejemplo para ver cómo se
            siente.
          </p>
          <button
            onClick={handleLoadExample}
            disabled={seeding}
            className="text-xs uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors py-2 px-4 border-b border-ink-200 hover:border-ink-500 disabled:text-ink-200 disabled:border-ink-100"
          >
            {seeding ? 'cargando…' : 'cargar ejemplo'}
          </button>
        </div>
      </div>
    </div>
  )
}
