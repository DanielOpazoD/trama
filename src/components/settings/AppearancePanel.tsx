import { PanelHeader } from './_shared'

/**
 * ν3 + ola transversal 2026-06: tres temas — paper (día), night (noche frío),
 * vela (noche cálido) — presentados como TARJETAS DE PREVISUALIZACIÓN: una
 * mini-hoja con el papel, una línea serif y el acento de cada tema, en vez de
 * tres botones planos. Elegir tema se vuelve un momento de producto.
 *
 * Los colores de cada tarjeta van HARDCODEADOS a propósito (excepción
 * deliberada a la regla "solo CSS vars"): cada tarjeta representa SU tema,
 * no el activo — con vars, las tres se teñirían del tema actual y la
 * previsualización no previsualizaría nada. Los valores son copia literal de
 * los tokens de index.css (:root / html.dark / html.dark.theme-vela); si esos
 * cambian, actualizar acá.
 */
const THEME_PREVIEWS: {
  id: 'paper' | 'night' | 'vela'
  label: string
  hint: string
  paper: string
  paperRaised: string
  ink: string
  inkMuted: string
  accent: string
  border: string
}[] = [
  {
    id: 'paper',
    label: 'Papel',
    hint: 'blanco neutro, para el día',
    paper: '#ffffff',
    paperRaised: '#fafafa',
    ink: '#18181b',
    inkMuted: '#63636b',
    accent: '#1f4d6b',
    border: '#e4e4e7',
  },
  {
    id: 'night',
    label: 'Noche',
    hint: 'neutro oscuro, sin glare',
    paper: '#09090b',
    paperRaised: '#18181b',
    ink: '#fafafa',
    inkMuted: '#9d9da6',
    accent: '#8db8d6',
    border: '#2a2a30',
  },
  {
    id: 'vela',
    label: 'Vela',
    hint: 'sepia cálido, lectura nocturna',
    paper: '#1a140e',
    paperRaised: '#261d14',
    ink: '#f7eedc',
    inkMuted: '#b3a285',
    accent: '#b8a070',
    border: '#3a2e1f',
  },
]

export function AppearancePanel({
  theme,
  onSetTheme,
}: {
  theme: 'paper' | 'night' | 'vela'
  onSetTheme: (t: 'paper' | 'night' | 'vela') => void
}) {
  return (
    <section>
      <PanelHeader
        title="Apariencia"
        hint="Papel para el día. Noche para luz baja. Vela para lectura nocturna con tinte cálido. La elección se recuerda en este navegador."
      />
      <div
        role="radiogroup"
        aria-label="Tema de la aplicación"
        className="grid grid-cols-3 gap-3 max-w-md"
      >
        {THEME_PREVIEWS.map((t) => {
          const active = theme === t.id
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={active}
              onClick={() => onSetTheme(t.id)}
              className={`group text-left rounded-xl border transition-all duration-200 overflow-hidden ${
                active
                  ? 'border-transparent ring-2 ring-[color:var(--accent-primary)] shadow-md shadow-ink-900/10'
                  : 'border-ink-100 hover:border-ink-200 hover:shadow-sm'
              }`}
            >
              {/* La mini-hoja: papel del tema + una línea serif + su acento. */}
              <span
                aria-hidden
                className="block px-3 pt-3 pb-2.5"
                style={{ backgroundColor: t.paper }}
              >
                <span
                  className="block rounded-md border px-2.5 py-2"
                  style={{ backgroundColor: t.paperRaised, borderColor: t.border }}
                >
                  <span
                    className="block font-serif text-lead leading-tight"
                    style={{ color: t.ink }}
                  >
                    Aa
                  </span>
                  <span
                    className="mt-1.5 block h-[2px] w-6 rounded-full"
                    style={{ backgroundColor: t.accent, opacity: 0.85 }}
                  />
                  <span
                    className="mt-1.5 block h-1 w-full rounded-full"
                    style={{ backgroundColor: t.inkMuted, opacity: 0.35 }}
                  />
                  <span
                    className="mt-1 block h-1 w-3/4 rounded-full"
                    style={{ backgroundColor: t.inkMuted, opacity: 0.25 }}
                  />
                </span>
              </span>
              <span className="block px-3 py-2 bg-paper-50">
                <span
                  className={`block text-caption font-medium ${
                    active ? 'text-ink-800' : 'text-ink-600'
                  }`}
                >
                  {t.label}
                </span>
                <span className="block text-micro text-ink-400">{t.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
