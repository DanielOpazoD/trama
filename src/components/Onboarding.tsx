import { useEffect, useState } from 'react'
import { EndMark, OrnamentBreak, SparkleIcon } from './Icons'

/**
 * Tour interactivo para la primera sesión.
 *
 * Aparece como overlay full-screen sobre el shell la primera vez que el
 * usuario abre la app SIN datos (entities + quotes + relationships = 0)
 * y sin haber visto el tour antes (localStorage `trama:onboarded`).
 *
 * 4 pasos secuenciales con back/next y skip. Al completar (o saltar),
 * persiste el flag para que no vuelva a aparecer.
 *
 * Diseño: card centrado, identidad editorial (serif heading + sans body
 * + ornaments). Cada paso enfoca en una idea: qué es Trama, cómo se
 * captura, cómo decide la IA, cómo crece.
 */

const STORAGE_KEY = 'trama:onboarded'

/**
 * ι2: convertir 1..N a numeral romano en minúsculas (i, ii, iii, iv).
 * Suficiente para 4-5 pasos máximo. Si onboarding crece más, extender.
 */
function romanNumeral(n: number): string {
  const map: Record<number, string> = {
    1: 'i',
    2: 'ii',
    3: 'iii',
    4: 'iv',
    5: 'v',
    6: 'vi',
    7: 'vii',
    8: 'viii',
  }
  return map[n] ?? String(n)
}

type Step = {
  eyebrow: string
  title: string
  body: React.ReactNode
  primary: string
}

const STEPS: Step[] = [
  {
    eyebrow: 'qué es esto',
    title: 'Trama es un mapa de tus afinidades.',
    body: (
      <>
        Aquí guardas <strong>entidades</strong> (personas, libros, canciones, ideas), las{' '}
        <strong>citas</strong> que te llegaron de ellas, y las <strong>relaciones</strong>{' '}
        entre todo eso. Crece despacio, con intención — no es un dump.
      </>
    ),
    primary: 'Sigue',
  },
  {
    eyebrow: 'cómo empezar',
    title: 'Pega un párrafo.',
    body: (
      <>
        En la barra de abajo escribes — o pegas — algo que te llegó. Una frase de un
        libro, un fragmento de conversación, lo que sea. La IA lee y propone qué
        entidades, citas y relaciones extraer.
      </>
    ),
    primary: 'Sigue',
  },
  {
    eyebrow: 'cómo decide',
    title: 'Tú apruebas todo.',
    body: (
      <>
        Nada entra a la trama sin tu confirmación. La IA propone, tú eliges qué resuena.
        Lo que no, se descarta. Tu mapa es tuyo —{' '}
        <em>la IA es solo un copiloto silencioso</em>.
      </>
    ),
    primary: 'Sigue',
  },
  {
    eyebrow: 'cómo te orientas',
    title: 'Los atajos son tus amigos.',
    body: (
      <>
        Aprieta{' '}
        <kbd className="font-mono text-micro leading-none px-1.5 py-1 mx-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-600 shadow-sm">
          ⌘ K
        </kbd>{' '}
        para buscar cualquier cosa,{' '}
        <kbd className="font-mono text-micro leading-none px-1.5 py-1 mx-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-600 shadow-sm">
          ?
        </kbd>{' '}
        para ver todos los atajos. El sidebar de la izquierda te lleva a cada sección.
      </>
    ),
    primary: 'Empezar',
  },
]

export function Onboarding({
  enabled,
  onComplete,
}: {
  /** True solo si la trama está vacía Y el usuario no marcó "no mostrar". */
  enabled: boolean
  onComplete: () => void
}) {
  const [open, setOpen] = useState(() => {
    if (!enabled) return false
    if (typeof window === 'undefined') return false
    return !window.localStorage.getItem(STORAGE_KEY)
  })
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    // Si cambia el flag enabled (porque el usuario empezó a tener data),
    // cerramos el tour automáticamente. Es coherente con "si ya empezaste
    // a usar Trama, este tour no aplica".
    if (!enabled && open) {
      setOpen(false)
    }
  }, [enabled, open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') skip()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIdx])

  function finish() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* localStorage disabled */
    }
    setOpen(false)
    onComplete()
  }

  function skip() {
    finish()
  }

  function next() {
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1)
    else finish()
  }

  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }

  if (!open) return null

  const step = STEPS[stepIdx]
  if (!step) return null
  const isLast = stepIdx === STEPS.length - 1

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-paper-50/95 backdrop-blur-sm animate-view-fade"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenido a Trama"
        className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-up"
      >
        <div className="w-full max-w-xl">
          {/* ι2: folio number como en una página de prólogo — "i / iv".
              Roman numerals, font serif italic, separado del ornament
              de abajo. Le da peso de cuaderno con capítulos numerados. */}
          <p
            className="text-center font-serif italic text-sm text-ink-300 mb-4 tabular-nums"
            aria-hidden
          >
            {romanNumeral(stepIdx + 1)} · {romanNumeral(STEPS.length)}
          </p>

          {/* Ornament arriba — guiño editorial */}
          <div className="flex justify-center mb-6 text-ink-300">
            <OrnamentBreak size={84} />
          </div>

          {/* ι2: eyebrow en small caps serif Spectral (era el plano
              section-eyebrow). Más refinado, coherente con HomeView. */}
          <p
            className="section-eyebrow-serif text-center mb-3"
            style={{ color: 'var(--accent-gold)' }}
          >
            {step.eyebrow}
          </p>

          <h2 className="font-serif text-h1 text-ink-800 leading-tight tracking-tight text-center mb-3">
            {step.title}
          </h2>

          {/* ι2: accent-rule entre título y body — pausa visual breve,
              como una entradilla de capítulo. */}
          <div className="accent-rule mx-auto w-12 mb-5" />

          <div className="text-ink-500 text-lead leading-relaxed text-center max-w-lg mx-auto mb-10">
            {step.body}
          </div>

          {/* Progreso + acciones */}
          <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
            <button
              onClick={skip}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              Saltar
            </button>

            <div className="flex items-center gap-1.5" aria-label="Progreso del tour">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === stepIdx
                      ? 'w-6 bg-ink-700'
                      : i < stepIdx
                        ? 'w-1.5 bg-ink-500'
                        : 'w-1.5 bg-ink-200'
                  }`}
                  aria-hidden
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {stepIdx > 0 && (
                <button
                  onClick={back}
                  className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
                >
                  ← Atrás
                </button>
              )}
              <button
                onClick={next}
                className="btn-accent text-sm inline-flex items-center gap-1.5"
              >
                {isLast && <SparkleIcon size={12} />}
                {step.primary}
              </button>
            </div>
          </div>

          {/* End mark abajo — cierra el bloque como un capítulo */}
          <div className="flex justify-center mt-10 text-ink-200">
            <EndMark size={14} />
          </div>
        </div>
      </div>
    </>
  )
}
