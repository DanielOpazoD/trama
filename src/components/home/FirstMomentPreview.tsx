/**
 * Preview editorial para usuarios sin datos. Aparece debajo del
 * EmptyMessage en HomeView cuando totalEntities === 0.
 *
 * En lugar de un texto seco "todavía nada acá", mostramos un ejemplo
 * tipográfico de lo que será su primera entrada — una cita destacada
 * con drop-cap, atribución, y un chip de entidad. Visualmente marcado
 * como "ejemplo" mediante:
 *   - opacity reducida sobre el wash gold
 *   - un sello "ejemplo" arriba a la derecha en small-caps serif
 *
 * El usuario lee la cita real (de Borges, para anclar la voz editorial
 * del producto), entiende QUÉ va a tener al rellenar, y el AskBar de
 * abajo se vuelve obvio como punto de partida.
 */
export function FirstMomentPreview() {
  return (
    <section
      aria-label="Ejemplo de cómo se verá tu primera entrada"
      className="mt-12 relative pointer-events-none select-none animate-fade-up"
      style={{
        animationDelay: '160ms',
        animationFillMode: 'both',
      }}
    >
      {/* Etiqueta "ejemplo" — chip serif italic arriba a la derecha. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
          así se verá tu primera cita
        </p>
        <span
          className="text-micro uppercase tracking-eyebrow text-ink-300 italic"
          aria-hidden
        >
          ejemplo
        </span>
      </div>

      {/* Card del ejemplo — wash gold sutil + border dashed + chip
          "ejemplo" arriba. Esos tres marcadores ya comunican "preview"
          sin necesidad de bajar opacity (que sobre dark/vela quedaba
          ilegible). El texto se lee normal; lo "no-real" lo dice el
          contexto, no la transparencia. */}
      <div
        className="rounded-xl border border-dashed border-ink-100/70 px-6 py-7"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 20% 30%, var(--accent-gold-soft) 0%, transparent 60%)',
        }}
      >
        <blockquote className="quote-block text-lg md:text-xl text-ink-700 leading-snug clear-both overflow-hidden">
          <span
            className="float-left mr-1.5 mt-1 text-4xl leading-[0.85] font-serif select-none"
            style={{ color: 'var(--accent-gold)' }}
          >
            E
          </span>
          l tiempo es la sustancia de que estoy hecho. El tiempo es un río que me
          arrebata, pero yo soy el río.
        </blockquote>
        <div className="mt-3 flex justify-between items-baseline gap-4 text-sm">
          <span className="text-ink-500">— Jorge Luis Borges</span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-micro tracking-eyebrow"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--type-escritor) 11%, transparent)',
              color: 'var(--type-escritor)',
            }}
          >
            escritor
          </span>
        </div>
      </div>

      {/* Pista visual hacia la AskBar — flecha sutil que tira el ojo
          al input de abajo. Solo presente en desktop (en mobile el
          AskBar puede no estar visible inmediatamente). */}
      <p
        className="mt-6 text-center text-caption italic text-ink-400 hidden md:block"
        aria-hidden
      >
        empieza pegando algo abajo ↓
      </p>
    </section>
  )
}
