import { useMemo } from 'react'
import type { Entity, Quote } from '../../types'
import { describeYears, isAnniversary } from '../../hooks/useHiloOfTheDay'

/**
 * Efemérides — «tal día como hoy». La portada recuerda lo que entró a la
 * trama un día como hoy en años anteriores: la cita guardada hace dos
 * años, la entidad que llegó hace tres. El splash ya usaba UN aniversario
 * como frase (useHiloOfTheDay); acá la portada los muestra todos, como
 * la columna de efemérides de un diario. Si hoy no hay nada, no aparece.
 */

export type Efemeride =
  | {
      kind: 'quote'
      key: string
      yearsAgo: number
      text: string
      entityId: string | null
      entityName: string | null
    }
  | { kind: 'entity'; key: string; yearsAgo: number; entityId: string; name: string }

const MAX_ITEMS = 3

export function collectEfemerides(
  entities: Entity[],
  quotes: Quote[],
  today: Date = new Date(),
): Efemeride[] {
  const out: Efemeride[] = []
  // Citas primero — son las efemérides más íntimas.
  for (const q of quotes) {
    const ann = isAnniversary(q.createdAt, today)
    if (!ann) continue
    const ent = entities.find((e) => e.id === q.entityId) ?? null
    out.push({
      kind: 'quote',
      key: `q-${q.id}`,
      yearsAgo: ann.yearsAgo,
      text: q.text,
      entityId: ent?.id ?? null,
      entityName: ent?.name ?? null,
    })
  }
  for (const e of entities) {
    const ann = isAnniversary(e.createdAt, today)
    if (!ann) continue
    out.push({
      kind: 'entity',
      key: `e-${e.id}`,
      yearsAgo: ann.yearsAgo,
      entityId: e.id,
      name: e.name,
    })
  }
  // Los más viejos primero — «hace tres años» pesa más que «hace un año».
  return out.sort((a, b) => b.yearsAgo - a.yearsAgo).slice(0, MAX_ITEMS)
}

function clip(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut.slice(0, max)).trimEnd()}…`
}

export function Efemerides({
  entities,
  quotes,
  onSelectEntity,
}: {
  entities: Entity[]
  quotes: Quote[]
  onSelectEntity: (id: string) => void
}) {
  const items = useMemo(() => collectEfemerides(entities, quotes), [entities, quotes])
  if (items.length === 0) return null

  return (
    <section aria-label="Tal día como hoy">
      <h3 className="section-eyebrow mb-3">tal día como hoy</h3>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="font-serif text-lead leading-relaxed text-ink-600"
          >
            {item.kind === 'quote' ? (
              <>
                <span className="italic">«{clip(item.text)}»</span>
                {item.entityName && item.entityId ? (
                  <>
                    {' — '}
                    <button
                      onClick={() => onSelectEntity(item.entityId!)}
                      className="text-ink-700 hover:text-[color:var(--accent-primary)] transition-colors border-b border-transparent hover:border-current"
                    >
                      {item.entityName}
                    </button>
                  </>
                ) : null}
                <span className="text-ink-400">
                  , guardada {describeYears(item.yearsAgo)}
                </span>
              </>
            ) : (
              <>
                <span className="text-ink-400">{describeYears(item.yearsAgo)}, </span>
                <button
                  onClick={() => onSelectEntity(item.entityId)}
                  className="text-ink-700 hover:text-[color:var(--accent-primary)] transition-colors border-b border-transparent hover:border-current"
                >
                  {item.name}
                </button>
                <span className="text-ink-400"> entró a tu trama</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
