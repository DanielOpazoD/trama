import { useState } from 'react'
import { useCronicasQuery, useGenerateCronica, useToast } from '../../state'
import { OrnamentBreak } from '../Icons'
import { AISourceTag } from '../AISourceTag'

/**
 * U-4: sección de Crónicas en el HomeView. Aparece al final de Inicio,
 * después de los hilos recientes. Muestra:
 *
 *   - Crónica del mes anterior si NO existe → botón "generar crónica
 *     de [mes anterior]"
 *   - Crónica del mes anterior si EXISTE → texto editorial fullwidth
 *   - Archivo de crónicas anteriores (collapsed → click expande)
 *
 * Si todavía no hay ninguna crónica generada, mostramos un teaser
 * editorial discreto, no un CTA agresivo.
 */
export function CronicasSection() {
  const { data: cronicas = [], isLoading } = useCronicasQuery()
  const generate = useGenerateCronica()
  const toast = useToast()
  const [expandedArchive, setExpandedArchive] = useState<Set<string>>(new Set())

  if (isLoading) return null

  // Calcular mes anterior (en local time, pero mes/año son enteros simples).
  const now = new Date()
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYear = prevMonthDate.getFullYear()
  const prevMonth = prevMonthDate.getMonth() + 1 // 1-12

  const hasPrevMonth = cronicas.some((c) => c.year === prevYear && c.month === prevMonth)

  const prevMonthCronica = hasPrevMonth
    ? cronicas.find((c) => c.year === prevYear && c.month === prevMonth)
    : null

  // Archivo = todas las crónicas EXCEPTO la del mes anterior (que ya
  // mostramos arriba con todo su texto).
  const archive = cronicas.filter((c) => !(c.year === prevYear && c.month === prevMonth))

  // Si NO hay crónicas Y NO hay actividad reciente, no mostramos nada
  // (la home queda más limpia el primer mes).
  if (cronicas.length === 0 && !hasPrevMonth) {
    return (
      <section className="mt-16" aria-labelledby="cronicas-heading">
        <header className="mb-4">
          <p
            className="section-eyebrow-serif mb-1"
            style={{ color: 'var(--accent-gold)' }}
          >
            crónica del mes
          </p>
          <h3 id="cronicas-heading" className="font-serif text-h2 text-ink-700">
            {monthLabelEs(prevMonth)} de {prevYear}
          </h3>
          <div className="accent-rule mt-2" />
        </header>
        <button
          onClick={async () => {
            try {
              await generate.mutateAsync({ year: prevYear, month: prevMonth })
            } catch (err) {
              toast.show({
                message:
                  err instanceof Error ? err.message : 'No se pudo generar la crónica',
                tone: 'error',
              })
            }
          }}
          disabled={generate.isPending}
          className="btn-accent"
        >
          {generate.isPending
            ? 'Escribiendo crónica…'
            : `Pedirle a la IA que escriba la crónica de ${monthLabelEs(prevMonth)}`}
        </button>
        <p className="mt-3 text-caption text-ink-400 italic max-w-prose">
          Es una crónica editorial de 200-300 palabras que conecta las entidades que más
          tocaste en {monthLabelEs(prevMonth)}.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-16" aria-labelledby="cronicas-heading">
      <header className="mb-6">
        <p className="section-eyebrow-serif mb-1" style={{ color: 'var(--accent-gold)' }}>
          crónica del mes
        </p>
        <h3 id="cronicas-heading" className="font-serif text-h2 text-ink-700">
          {prevMonthCronica ? `${monthLabelEs(prevMonth)} de ${prevYear}` : 'tu archivo'}
        </h3>
        <div className="accent-rule mt-2" />
      </header>

      {/* Mes anterior: cuerpo completo o invitación a generar */}
      {prevMonthCronica ? (
        <article className="font-serif text-lead text-ink-700 leading-relaxed max-w-prose whitespace-pre-wrap quote-block">
          {prevMonthCronica.text}
          <footer className="mt-6 not-italic text-caption text-ink-400 font-sans flex items-center gap-1.5">
            <span>
              Generada el{' '}
              {new Date(prevMonthCronica.generatedAt).toLocaleDateString('es', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <AISourceTag
              provider={prevMonthCronica.provider}
              model={prevMonthCronica.model}
              size={11}
            />
          </footer>
        </article>
      ) : (
        <div className="card-paper-soft p-5 max-w-prose">
          <p className="text-body text-ink-500 italic mb-3">
            Todavía no hay crónica para {monthLabelEs(prevMonth)}.
          </p>
          <button
            onClick={async () => {
              try {
                await generate.mutateAsync({ year: prevYear, month: prevMonth })
              } catch (err) {
                toast.show({
                  message:
                    err instanceof Error ? err.message : 'No se pudo generar la crónica',
                  tone: 'error',
                })
              }
            }}
            disabled={generate.isPending}
            className="btn-accent"
          >
            {generate.isPending ? 'Escribiendo crónica…' : 'Generar crónica'}
          </button>
        </div>
      )}

      {/* Archivo: meses anteriores. Collapsed por default. */}
      {archive.length > 0 && (
        <section className="mt-12" aria-labelledby="cronicas-archivo">
          <div className="text-ink-300 mb-4">
            <OrnamentBreak size={32} />
          </div>
          <h4 id="cronicas-archivo" className="section-eyebrow text-ink-400 mb-3">
            crónicas anteriores
          </h4>
          <ul className="stack-3">
            {archive.map((c) => {
              const key = `${c.year}-${c.month}`
              const isOpen = expandedArchive.has(key)
              return (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setExpandedArchive((prev) => {
                        const next = new Set(prev)
                        if (next.has(key)) next.delete(key)
                        else next.add(key)
                        return next
                      })
                    }}
                    className="text-left text-body text-ink-500 hover:text-ink-700 transition-colors font-serif"
                  >
                    {isOpen ? '▾' : '▸'} {monthLabelEs(c.month)} de {c.year}
                  </button>
                  {isOpen && (
                    <article className="mt-2 font-serif text-body text-ink-600 leading-relaxed max-w-prose whitespace-pre-wrap quote-block pl-4 border-l-2 border-ink-100">
                      {c.text}
                    </article>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </section>
  )
}

function monthLabelEs(month: number): string {
  const months = [
    '',
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  return months[month] ?? ''
}
