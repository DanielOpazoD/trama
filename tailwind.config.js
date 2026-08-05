/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['Spectral', '"Iowan Old Style"', 'Palatino', 'Georgia', 'serif'],
        // Monospace para metadata técnica — timestamps, IDs, conteos
        // tabulares, atajos de teclado. JetBrains Mono y SF Mono caen
        // bien en macOS; Menlo es fallback robusto.
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          '"Cascadia Code"',
          'monospace',
        ],
      },
      // Palette wired to CSS variables in rgb-triplet form, so Tailwind's
      // alpha modifier works (bg-paper-50/70 → rgb(var(--paper-50) / 0.7)).
      // When .dark is applied to <html>, the variables flip and the whole UI
      // adapts without a single `dark:` class needed in components.
      colors: {
        paper: {
          50: 'rgb(var(--paper-50) / <alpha-value>)',
          100: 'rgb(var(--paper-100) / <alpha-value>)',
          200: 'rgb(var(--paper-200) / <alpha-value>)',
          300: 'rgb(var(--paper-300) / <alpha-value>)',
        },
        ink: {
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
        },
      },
      // Type scale canónico — 6 niveles semánticos. Antes había 12 variantes
      // (text-xs, text-[10px], text-[11px], text-[13px], text-sm, etc.). Usar
      // SIEMPRE estos nombres semánticos:
      //   - micro:   chips, eyebrows uppercase, kbd hints, conteos
      //   - caption: labels, metadata, dates en tabular-nums
      //   - body:    default UI, párrafos cortos
      //   - lead:    primer párrafo, intros, cita destacada
      //   - h2:      títulos de sección
      //   - h1:      títulos de vista
      // Los aliases legacy (xs/sm/base/lg/xl/2xl/3xl/4xl) los mantiene
      // Tailwind por default; pero el nuevo código debería usar los
      // nombres semánticos.
      fontSize: {
        micro: ['10px', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        caption: ['12px', { lineHeight: '1.5' }],
        body: ['14px', { lineHeight: '1.55' }],
        lead: ['16px', { lineHeight: '1.65' }],
        h2: ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        h1: ['32px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },
      // Tracking canónico — 4 valores semánticos. Antes había 9 (incluyendo
      // tracking-[0.18em] y tracking-wider que son casi idénticos).
      letterSpacing: {
        tight: '-0.02em', // serif headings que se ven mejor compactos
        normal: '0',
        eyebrow: '0.18em', // uppercase labels, badges, breadcrumbs
        shout: '0.3em', // greetings, ornaments separators
      },
      // Animaciones nuevas (skeleton shimmer + pulse-subtle). Las otras
      // (fade-up, slide-in-right, slide-up, ai-arrive, halo-pulse,
      // dash-flow, node-drift, etc.) viven en src/index.css porque
      // ya tienen keyframes calibrados con overshoot/easing específico
      // que serían tedious de expresar en config.
      //
      // El contrato global es: TODAS las animations usan
      // cubic-bezier(0.25, 1, 0.5, 1) ("out-quart") o variantes con
      // overshoot suave. Nada de linear ni ease.
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        // Revelado de media: la imagen FUNDE sobre su placeholder al resolver
        // el blob. Keyframe (no transition) a propósito: varios tiles ya traen
        // `transition-transform` para el hover-zoom, y dos utilidades de
        // transition compiten por transition-property — la animación no.
        'media-reveal': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'media-reveal': 'media-reveal 300ms ease-out',
      },
      transitionTimingFunction: {
        // Curva "expo-out" estilo Apple — empieza rápido, decelera suave.
        // Usar en cualquier transition que tenga transform o que sea más
        // larga que 150ms. Para color-only seguimos con ease (default).
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
      // Escala de capas semántica — una sola fuente de verdad para el
      // apilamiento de overlays. Antes había `z-50` ×31 + escaladas mágicas
      // (`z-[60]`, `z-[80]`, `z-[120]`, `z-[130]`) donde cada quien "ganaba"
      // su pelea local. Usar SIEMPRE estos nombres en cualquier elemento que
      // flote sobre el contenido; el orden ES el contrato:
      //   raised   contenido elevado dentro de una vista (chips, dots)
      //   sticky   headers sticky de vista
      //   nav      navegación (sidebar, bottom nav móvil)
      //   dropdown popovers anclados (WorldSwitcher, menús contextuales)
      //   overlay  backdrops de hojas/sheets
      //   modal    diálogos modales centrados
      //   lightbox visor de imágenes a pantalla completa
      //   toast    notificaciones efímeras (sobre todo lo navegable)
      //   tooltip  tooltips (nunca tapados)
      //   max      reservado para debug / overlays de captura
      // Los aliases numéricos (z-0…z-50) siguen disponibles para apilamiento
      // local dentro de un componente.
      zIndex: {
        raised: '10',
        sticky: '20',
        nav: '30',
        dropdown: '40',
        overlay: '50',
        modal: '60',
        lightbox: '70',
        toast: '80',
        tooltip: '90',
        max: '100',
      },
    },
  },
  plugins: [],
}
