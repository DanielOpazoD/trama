import type { ViewMode } from '../types/view'
import { ReadingIcon, SparkleIcon, ChatIcon, MomentosIcon, QuoteIcon } from './Icons'

/**
 * El Gabinete — índice de los gestos literarios de Trama.
 *
 * τ-IA (N3): Sortes, Espejo, Voz de…, Hojas y Postales vivían dispersos
 * (un botón en el TopBar, un panel de detalle de entidad, una acción
 * contextual de cita). Esta vista los reúne en un lugar descubrible — una
 * "sala" a la que entrás a jugar con tu propio material. Los accesos
 * contextuales siguen existiendo (Resonancia/Eco en la cita, Voz de… en la
 * ficha); esto es el índice que faltaba.
 *
 * Sortes y Espejo se lanzan directo (overlays con estado en App.tsx). Voz,
 * Hojas y Postales necesitan contexto (una entidad / Momentos / una cita),
 * así que su card te lleva al lugar donde se usan en vez de simular el flujo.
 */

type Gesto = {
  icon: React.ComponentType<{ size?: number; className?: string }>
  name: string
  desc: string
  cta: string
  onClick: () => void
}

export function GabineteView({
  onSortes,
  onEspejo,
  onNavigate,
}: {
  onSortes: () => void
  onEspejo: () => void
  onNavigate: (v: ViewMode) => void
}) {
  const gestos: Gesto[] = [
    {
      icon: ReadingIcon,
      name: 'Sortes',
      desc: 'Una cita al azar de tu archivo, para volver a leerla con otros ojos.',
      cta: 'Tirar una cita',
      onClick: onSortes,
    },
    {
      icon: SparkleIcon,
      name: 'Espejo',
      desc: 'La IA compone un retrato de tu trama: qué te ocupa, a quién volvés.',
      cta: 'Mirarme en la trama',
      onClick: onEspejo,
    },
    {
      icon: ChatIcon,
      name: 'Voz de…',
      desc: 'Qué diría una de tus entidades, con tu trama como contexto. Se abre desde su ficha.',
      cta: 'Elegir una entidad',
      onClick: () => onNavigate('entidades'),
    },
    {
      icon: MomentosIcon,
      name: 'Hojas sueltas',
      desc: 'Una superficie en blanco para escribir libre, sin formato. Vive en Momentos.',
      cta: 'Ir a Momentos',
      onClick: () => onNavigate('momentos'),
    },
    {
      icon: QuoteIcon,
      name: 'Postales',
      desc: 'Convertí una cita en una imagen para guardar o compartir. Desde cada cita.',
      cta: 'Ir a Citas',
      onClick: () => onNavigate('citas'),
    },
  ]

  return (
    <div>
      <header className="mb-8">
        <p className="section-eyebrow mb-2">El gabinete</p>
        <h1 className="font-serif text-3xl text-ink-800 leading-tight">
          Juegos de la trama
        </h1>
        <p className="text-ink-500 mt-2 max-w-prose">
          Gestos para jugar con tu propio material — releer al azar, verte reflejado,
          prestarle la voz a una entidad. Entra y prueba.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {gestos.map((g) => {
          const Icon = g.icon
          return (
            <button
              key={g.name}
              onClick={g.onClick}
              className="card-paper-soft group text-left p-5 rounded-xl border border-ink-100/70 hover:border-ink-200 transition-colors"
            >
              <span className="inline-flex mb-3" style={{ color: 'var(--accent-clay)' }}>
                <Icon size={20} />
              </span>
              <h2 className="font-serif text-lg text-ink-800 leading-tight">{g.name}</h2>
              <p className="text-ink-500 text-sm leading-relaxed mt-1.5">{g.desc}</p>
              <span className="inline-flex items-center gap-1 mt-3 text-caption uppercase tracking-eyebrow text-ink-400 group-hover:text-ink-700 transition-colors">
                {g.cta} →
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-ink-300 text-sm italic mt-8 max-w-prose">
        Resonancia y Eco también son parte del gabinete, pero viven dentro de cada cita —
        marca cuánto te tocó y deja que la IA escriba al margen.
      </p>
    </div>
  )
}
