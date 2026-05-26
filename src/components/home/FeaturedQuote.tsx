import type { Entity, Quote } from '../../types'

/**
 * G2 (FF3-c) — pull-quote editorial de la portada. Extraído de
 * `HomeView.tsx` para que la vista quede como orquestador delgado.
 *
 * Antes era determinístico por día (mismo destacado durante 24h). Hoy
 * rota: cada montaje de HomeView elige al azar y un botón "Otra" pide
 * otra (el padre maneja el rollCounter).
 *
 * Estilo:
 *  - λ2: backplate cálido — wash radial muy sutil de gold-soft que
 *    emana del centro. No es un card; es atmósfera para que la cita
 *    destacada se sienta como portada respirando luz cálida.
 *  - λ8: drop-cap en citas medianas+ (>= 80 chars). En cortas se ve
 *    apretado.
 *  - μ1: marginalia manuscrita para `userReflection` — la voz del
 *    usuario merece la cursiva manuscrita.
 */
export function FeaturedQuote({
  quote,
  entity,
  onSelectEntity,
  onReroll,
}: {
  quote: Quote
  entity: Entity | undefined
  onSelectEntity: (id: string) => void
  onReroll?: () => void
}) {
  // Drop cap solo en citas medianas+, en cortas se ve apretado.
  const useDropCap = quote.text.length >= 80
  return (
    // Pull-quote editorial — más aire vertical para que respire como
    // página de libro. max-w-prose mantiene una columna confortable
    // (~65ch) aún en pantallas anchas; mx-auto la centra. Pad-block-5
    // añade un colchón generoso arriba y abajo que separa la cita del
    // resto del flujo.
    <section
      className="animate-fade-up pad-block-5 max-w-prose mx-auto relative"
      style={{
        // λ2: backplate cálido — wash radial muy sutil de gold-soft que
        // emana del centro hacia los bordes. ~14% pico en el centro,
        // fade a transparente bien antes de los bordes para no robarle
        // peso al texto.
        backgroundImage:
          'radial-gradient(ellipse at center, var(--accent-gold-soft) 0%, transparent 65%)',
      }}
    >
      <div className="mb-4 flex items-baseline justify-between">
        {/* Eyebrow editorial con small caps reales — Spectral 'smcp'.
            Se ve más calmado y refinado que el uppercase + tracking
            shouty del resto de los eyebrows. Reservado para momentos
            de carga visual editorial alta. */}
        <p
          className="section-eyebrow-serif"
          style={{ color: 'var(--accent-gold)' }}
        >
          ◆ una cita de tu trama
        </p>
        {onReroll && (
          <button
            onClick={onReroll}
            className="text-xs uppercase tracking-wider text-ink-300 hover:text-ink-700 transition-colors"
            title="Rotar a otra cita"
          >
            Otra
          </button>
        )}
      </div>
      {/* La cita misma: tamaño más generoso (text-2xl en desktop), serif
          con leading relajado, y el drop-cap cuando la longitud justifica.
          Comillas tipográficas decorativas no embebidas en el texto: una
          comilla grande gris bajando como ornamento del lado izquierdo
          superior, sin interferir con el texto leíble. */}
      <blockquote
        className={`quote-block font-serif text-xl md:text-2xl text-ink-700 leading-relaxed clear-both overflow-hidden ${
          useDropCap ? 'drop-cap' : ''
        }`}
      >
        {quote.text}
      </blockquote>
      <div className="mt-5 text-sm text-ink-400 text-right">
        {entity ? (
          <button
            onClick={() => onSelectEntity(entity.id)}
            className="text-ink-500 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
          >
            — {entity.name}
          </button>
        ) : (
          <span className="text-ink-300">— entidad eliminada</span>
        )}
        {quote.source && (
          <span className="text-ink-300 ml-2 italic">· {quote.source}</span>
        )}
      </div>
      {quote.userReflection && (
        <div className="mt-6 pl-4 border-l-2 border-ink-200/60">
          <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">
            tu reflexión
          </p>
          {/* μ1: marginalia manuscrita — el corazón del featured quote
              merece la voz manuscrita. */}
          <p className="marginalia-script whitespace-pre-wrap">
            {quote.userReflection}
          </p>
        </div>
      )}
    </section>
  )
}

/**
 * Pick aleatorio de una cita destacada. Si no hay citas devuelve null
 * (el caller decide si renderizar `FeaturedQuote` o saltarse).
 *
 * Vive acá porque es el pair lógico del componente — moverla a un
 * `utils.ts` separado sería ceremonia.
 */
export function pickFeaturedQuote(quotes: Quote[]): Quote | null {
  if (quotes.length === 0) return null
  // Pick aleatorio. Si hay más de una cita, evitamos repetir la primera
  // del array por sesgo del orden — simplemente Math.random sobre todo.
  const idx = Math.floor(Math.random() * quotes.length)
  return quotes[idx] ?? null
}
