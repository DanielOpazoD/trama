import { useXCronicaQuery } from '../../state'
import { AISourceTag } from '../AISourceTag'
import { ErrorState } from '../ErrorState'

/**
 * Crónica de bookmarks en Inicio. Solo aparece si ya se generó una (desde la
 * sección Twitter) — así no ensucia el Inicio de quien no usa X. Es la misma
 * crónica que se ve en Twitter; acá se lee junto a la crónica del mes.
 */
export function XCronicaSection() {
  const { data, isLoading, isError, isFetching, refetch } = useXCronicaQuery()
  if (isLoading) return null

  // Un fetch fallido NO es "todavía no hay crónica": antes el error caía al
  // mismo `return null` que el caso vacío y la sección desaparecía en silencio.
  // El usuario podía creer que su crónica se perdió y pedir una regeneración
  // (IA cara) por un problema quizá temporal. Lo nombramos como error y
  // ofrecemos reintentar, en vez de colapsarlo con el vacío.
  const c = data?.cronica
  // Ni error ni crónica → la sección no aparece (no es un "vacío" que avisar).
  if (!isError && !c) return null

  // Header compartido (eyebrow + h3 + accent-rule): se renderiza UNA vez, con el
  // cuerpo condicional (error vs crónica) adentro. Antes estaba duplicado entre
  // ambas ramas (nitpick de CodeRabbit).
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
      {isError ? (
        <ErrorState
          title="No se pudo cargar tu crónica"
          body="Hubo un problema al traer la crónica de tus bookmarks. Puede ser temporal; tu crónica sigue guardada."
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : c ? (
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
      ) : null}
    </section>
  )
}
