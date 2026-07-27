import { useMemo, useState } from 'react'
import { useAddEntity, useAddRelationship, useAddQuote } from '../state'
import { CenteredPane } from './CenteredPane'

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
    <CenteredPane className="px-8 py-10">
      <div className="max-w-2xl text-center space-y-12">
        <figure className="space-y-4">
          {/* Migración de aliases legacy a la escala semántica: `text-2xl
              md:text-3xl` (24→30px) pasa a `text-h2 md:text-h1` (20→32px), que
              es el escalón equivalente dentro de los seis niveles canónicos.
              El paso a 20px en móvil además le quita altura a la pantalla justo
              donde no cabía. */}
          <blockquote className="quote-block text-h2 md:text-h1 text-ink-600 leading-relaxed text-balance">
            «{quote.text}»
          </blockquote>
          {/* `text-sm` → `text-body`: mismos 14px, sin cambio visual. */}
          <figcaption className="text-body text-ink-300">
            — {quote.author}
            {quote.source && <span className="text-ink-300 ml-2">· {quote.source}</span>}
          </figcaption>
        </figure>

        <div className="space-y-3 pt-8 border-t border-ink-100/60">
          {/* El copy decía "empieza pegando un texto en la barra de abajo".
              Esta pantalla sólo se ve en el Grafo, y en el Grafo el AskBar no
              se monta nunca (`blocksAskBar` en appShellModel). Es decir: la
              primera instrucción que leía un usuario nuevo apuntaba a algo que
              no estaba en pantalla. Ahora nombra las dos vías que sí existen
              desde aquí. */}
          <p className="text-ink-400 text-body leading-relaxed max-w-md mx-auto">
            Trama es tu mapa de afinidades intelectuales y estéticas. Carga un pequeño
            ejemplo para ver cómo se siente, o ve a Inicio y pega ahí el primer texto que
            quieras guardar.
          </p>
          <button
            onClick={handleLoadExample}
            disabled={seeding}
            // `text-xs` → `text-caption`: mismos 12px, sin cambio visual.
            className="text-caption uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors py-2 px-4 border-b border-ink-200 hover:border-ink-500 disabled:text-ink-200 disabled:border-ink-100"
          >
            {seeding ? 'cargando…' : 'cargar ejemplo'}
          </button>
        </div>
      </div>
    </CenteredPane>
  )
}
