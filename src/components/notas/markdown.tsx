import { Fragment, type ReactNode } from 'react'

/**
 * Render de markdown liviano para las notas — SIN dependencias y SIN
 * `dangerouslySetInnerHTML`: produce nodos React, así que es seguro por
 * construcción (no hay inyección de HTML).
 *
 * Subconjunto soportado (el 90% de lo que se usa en un memo):
 *   Bloque : encabezados (#, ##, ###), listas (- / *), listas de tareas
 *            (- [ ] / - [x]), citas (>), bloques de código (```), reglas (---)
 *            y párrafos (saltos simples → <br>).
 *   Inline : **negrita**, _cursiva_, `código`, [enlace](url), URLs sueltas y
 *            #etiquetas (resaltadas en sage).
 *
 * Nota de diseño: la cursiva usa `_` (no `*`) para no pelearse con la negrita
 * `**` — es la convención más segura y común en notas.
 */

// Tono de acento del mundo Notas: fluye del primario único (--accent-primary),
// que world-notas remapea a salvia. Un solo sistema de tono para tags/chips —
// el mismo que usa .chip[data-tone='primary']; no se hardcodea el salvia.
const ACCENT = 'var(--accent-primary)'

// ---------- Inline ----------

type InlineRule = {
  re: RegExp
  render: (m: RegExpExecArray, key: string) => ReactNode
}

const INLINE_RULES: InlineRule[] = [
  {
    // `código`
    re: /`([^`]+)`/,
    render: (m, key) => (
      <code
        key={key}
        className="font-mono text-[0.85em] bg-ink-100 text-ink-700 rounded px-1 py-0.5"
      >
        {m[1]}
      </code>
    ),
  },
  {
    // **negrita**
    re: /\*\*([\s\S]+?)\*\*/,
    render: (m, key) => (
      <strong key={key} className="font-semibold text-ink-800">
        {renderInline(m[1]!, key)}
      </strong>
    ),
  },
  {
    // _cursiva_
    re: /_([^_]+)_/,
    render: (m, key) => (
      <em key={key} className="italic">
        {renderInline(m[1]!, key)}
      </em>
    ),
  },
  {
    // [texto](url)
    re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
    render: (m, key) => (
      <a
        key={key}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-ink-300 hover:decoration-ink-700 transition-colors"
        style={{ color: ACCENT }}
        onClick={(e) => e.stopPropagation()}
      >
        {m[1]}
      </a>
    ),
  },
  {
    // URL suelta
    re: /(https?:\/\/[^\s)]+)/,
    render: (m, key) => (
      <a
        key={key}
        href={m[1]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-ink-300 hover:decoration-ink-700 transition-colors break-all"
        style={{ color: ACCENT }}
        onClick={(e) => e.stopPropagation()}
      >
        {m[1]}
      </a>
    ),
  },
  {
    // #etiqueta (al inicio o tras un espacio; no toca "## título" ni "a#b")
    re: /(^|\s)#([\p{L}\p{N}_-]{1,40})/u,
    render: (m, key) => (
      <Fragment key={key}>
        {m[1]}
        <span className="font-medium" style={{ color: ACCENT }}>
          #{m[2]}
        </span>
      </Fragment>
    ),
  },
]

/** Renderiza una porción de texto inline (negrita, cursiva, código, etc.). */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let k = 0
  let guard = 0
  while (rest.length > 0 && guard++ < 5000) {
    let best: { rule: InlineRule; m: RegExpExecArray } | null = null
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest)
      if (m && (best === null || m.index < best.m.index)) best = { rule, m }
    }
    if (!best) {
      nodes.push(rest)
      break
    }
    const { rule, m } = best
    if (m.index > 0) nodes.push(rest.slice(0, m.index))
    nodes.push(rule.render(m, `${keyPrefix}-${k++}`))
    rest = rest.slice(m.index + m[0].length)
  }
  return nodes
}

// ---------- Bloque ----------

/** Texto de varias líneas → nodos por párrafo, con <br> en saltos simples. */
function renderParagraph(lines: string[], key: string): ReactNode {
  const out: ReactNode[] = []
  lines.forEach((line, i) => {
    if (i > 0) out.push(<br key={`br-${i}`} />)
    out.push(<Fragment key={`l-${i}`}>{renderInline(line, `${key}-${i}`)}</Fragment>)
  })
  return (
    <p key={key} className="leading-relaxed">
      {out}
    </p>
  )
}

/** Markdown → nodos React (bloques). */
export function renderMarkdown(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let para: string[] = []
  let key = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push(renderParagraph(para, `p-${key++}`))
      para = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Bloque de código ```
    if (/^```/.test(line)) {
      flushPara()
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!)
      blocks.push(
        <pre
          key={`code-${key++}`}
          className="bg-ink-100/70 border border-ink-100 rounded-lg p-3 overflow-x-auto text-caption font-mono text-ink-700 leading-relaxed"
        >
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Regla horizontal ---
    if (/^-{3,}\s*$/.test(line)) {
      flushPara()
      blocks.push(<hr key={`hr-${key++}`} className="border-ink-100 my-1" />)
      continue
    }

    // Encabezado # / ## / ### (requiere espacio → no choca con #tag)
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      flushPara()
      const level = h[1]!.length
      const cls =
        level === 1
          ? 'font-serif text-lg text-ink-800 font-medium'
          : level === 2
            ? 'font-serif text-base text-ink-800 font-medium'
            : 'text-sm uppercase tracking-eyebrow text-ink-500'
      blocks.push(
        <p key={`h-${key++}`} className={`${cls} mt-1`}>
          {renderInline(h[2]!, `h-${key}`)}
        </p>,
      )
      continue
    }

    // Cita > … (agrupa líneas consecutivas)
    if (/^>\s?/.test(line)) {
      flushPara()
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quote.push(lines[i]!.replace(/^>\s?/, ''))
        i++
      }
      i--
      blocks.push(
        <blockquote
          key={`q-${key++}`}
          className="border-l-2 border-ink-200 pl-3 italic text-ink-500 leading-relaxed"
        >
          {renderParagraph(quote, `q-${key}`)}
        </blockquote>,
      )
      continue
    }

    // Lista de tareas / viñetas (agrupa consecutivas)
    if (/^[-*]\s+/.test(line)) {
      flushPara()
      const items: ReactNode[] = []
      let li = 0
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        const raw = lines[i]!.replace(/^[-*]\s+/, '')
        const task = /^\[([ xX])\]\s+(.*)$/.exec(raw)
        if (task) {
          const checked = task[1] !== ' '
          items.push(
            <li key={`li-${li}`} className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-[3px] inline-flex items-center justify-center size-3.5 shrink-0 rounded border text-micro leading-none ${
                  checked
                    ? 'border-transparent text-paper-50'
                    : 'border-ink-300 text-transparent'
                }`}
                style={checked ? { backgroundColor: ACCENT } : undefined}
              >
                ✓
              </span>
              <span className={checked ? 'text-ink-400 line-through' : ''}>
                {renderInline(task[2]!, `t-${key}-${li}`)}
              </span>
            </li>,
          )
        } else {
          items.push(
            <li key={`li-${li}`} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-300"
              />
              <span>{renderInline(raw, `u-${key}-${li}`)}</span>
            </li>,
          )
        }
        li++
        i++
      }
      i--
      blocks.push(
        <ul key={`ul-${key++}`} className="space-y-1 leading-relaxed">
          {items}
        </ul>,
      )
      continue
    }

    // Línea en blanco → corta el párrafo
    if (line.trim() === '') {
      flushPara()
      continue
    }

    // Texto normal → acumula en el párrafo actual
    para.push(line)
  }
  flushPara()

  return blocks
}
