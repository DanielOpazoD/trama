import { useXCronicaQuery } from '../../state'
import { AISourceTag } from '../AISourceTag'

/**
 * Crónica de bookmarks en Inicio. Solo aparece si ya se generó una (desde la
 * sección Twitter) — así no ensucia el Inicio de quien no usa X. Es la misma
 * crónica que se ve en Twitter; acá se lee junto a la crónica del mes.
 */
export function XCronicaSection() {
  const { data, isLoading } = useXCronicaQuery()
  if (isLoading) return null
  const c = data?.cronica
  if (!c) return null

  return (
    <section className="mt-16" aria-labelledby="x-cronica-heading">
      <header className="mb-6">
        <p
          className="section-eyebrow-serif mb-1"
          style={{ color: 'var(--accent-primary)' }}
        >
          crónica de tus bookmarks
        </p>
        <h3 id="x-cronica-heading" className="font-serif text-h2 text-ink-700">
          lo que guardas en X
        </h3>
        <div className="accent-rule mt-2" />
      </header>
      <article className="quote-block max-w-prose whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700">
        {c.text}
        <footer className="mt-6 flex items-center gap-1.5 font-sans text-caption text-ink-400 not-italic">
          <span>
            Generada el{' '}
            {new Date(c.generatedAt).toLocaleDateString('es', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <AISourceTag provider={c.provider} model={c.model} size={11} />
        </footer>
      </article>
    </section>
  )
}
