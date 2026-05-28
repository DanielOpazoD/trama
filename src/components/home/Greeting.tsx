import { SparkleIcon } from '../Icons'

/**
 * G2 (FF3-c) — header del HomeView: greeting + título de hoy + accent
 * rule + CTA opcional de sugerencias pendientes. Extraído de
 * `HomeView.tsx` para que la vista quede como orquestador delgado.
 *
 * El wash radial gold-soft (λ10) está acá porque es la "atmósfera" del
 * saludo. Combinado con δ6 `useTimeOfDayAccent`, el saludo respira
 * cobre cálido en la mañana, dorado al mediodía, ámbar al atardecer,
 * lavanda azulada en la noche — el "qué hora es" se siente desde la
 * primera mirada.
 *
 * Antes había un párrafo con totales "63 entidades · 77 citas · …" pero
 * era información duplicada (el sidebar ya muestra los counts con
 * NumberTicker, y la sección "ESTA SEMANA" muestra los deltas). La
 * portada queda más limpia sin esa fila.
 */
export function Greeting({
  pendingCount,
  onNavigateToSuggestions,
}: {
  pendingCount: number
  onNavigateToSuggestions: () => void
}) {
  const greeting = greetingForNow()

  return (
    <header
      className="pad-block-5 flex items-baseline justify-between gap-6 stack-3 relative"
      style={{
        // λ10: wash radial gold-soft detrás del saludo + título. Sale
        // del cuadrante superior izquierdo (donde está el greeting) y
        // se disipa antes de llegar al accent-rule.
        backgroundImage:
          'radial-gradient(ellipse 60% 80% at 15% 20%, var(--accent-gold-soft) 0%, transparent 70%)',
      }}
    >
      <div className="min-w-0 stack-2">
        <p className="text-micro uppercase tracking-shout text-ink-300">{greeting}</p>
        {/* ρ-canvas: el h2 antes decía "Inicio" — redundante con el
            sidebar y el TopBar. Lo reemplaza la fecha de hoy en
            serif, un gesto editorial que da contexto temporal real
            ("Sábado, 24 de mayo") en vez de repetir el nombre de la
            sección. */}
        <h2 className="font-serif text-3xl md:text-4xl text-ink-700 leading-tight tracking-tight">
          {formatToday()}
        </h2>
        <div className="accent-rule" />
      </div>
      {pendingCount > 0 && (
        <button onClick={onNavigateToSuggestions} className="ai-cta">
          <SparkleIcon size={12} />
          {pendingCount} {pendingCount === 1 ? 'sugerencia' : 'sugerencias'} pendiente
          {pendingCount === 1 ? '' : 's'}
        </button>
      )}
    </header>
  )
}

/**
 * ω-A: greeting con variantes literarias rotando por día. Cada franja
 * horaria tiene 4 alternativas; el seed estable por (día × franja)
 * elige una. La app se siente "escrita por alguien" sin tener que
 * arruinar la previsibilidad — la misma franja del mismo día siempre
 * devuelve la misma variante (no cambia al re-renderear).
 */
const GREETINGS = {
  // 0-6: aún de noche
  madrugada: [
    'Aún de noche',
    'Antes del alba',
    'Madrugada en silencio',
    'A esta hora sólo los gatos',
  ],
  // 6-12: mañana
  manana: ['Buenos días', 'Luz oblicua', 'Café temprano', 'La mañana abierta'],
  // 12-15: filo del mediodía
  mediodia: ['Buenas tardes', 'Filo del mediodía', 'Pleno día', 'Sol alto'],
  // 15-19: tarde
  tarde: ['Buenas tardes', 'Tarde tardía', 'Luz que baja', 'Cae la luz'],
  // 19-24: noche
  noche: ['Buenas noches', 'Cae la noche', 'Hora de cerrar el día', 'Penumbra cómoda'],
}

type GreetingBand = keyof typeof GREETINGS

function bandForHour(h: number): GreetingBand {
  if (h < 6) return 'madrugada'
  if (h < 12) return 'manana'
  if (h < 15) return 'mediodia'
  if (h < 19) return 'tarde'
  return 'noche'
}

function dailySeed(): number {
  const d = new Date()
  // YYYYMMDD como entero estable. Cambia cada medianoche local.
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function greetingForNow(): string {
  const h = new Date().getHours()
  const band = bandForHour(h)
  const options = GREETINGS[band]
  // Mezclamos el seed con el ordinal de la franja para que dos franjas
  // del mismo día no caigan en la misma variante por azar.
  const bandIdx = Object.keys(GREETINGS).indexOf(band)
  const idx = (dailySeed() + bandIdx * 7) % options.length
  return options[idx] ?? ''
}

/**
 * ρ-canvas: fecha de hoy en español, capitalizada. "sábado, 24 de mayo"
 * → "Sábado, 24 de mayo". Reemplaza el h2 "Inicio" del hero porque ese
 * h1 repetía la label del sidebar/TopBar; la fecha le da carácter.
 */
function formatToday(): string {
  const today = new Date()
  const raw = today.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
