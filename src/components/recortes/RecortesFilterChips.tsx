export type RecortesFilter = 'pending' | 'archived' | 'promoted'

const FILTERS: Array<{ value: RecortesFilter; label: string }> = [
  { value: 'pending', label: 'pendientes' },
  { value: 'archived', label: 'archivados' },
  { value: 'promoted', label: 'promovidos' },
]

export function RecortesFilterChips({
  filter,
  counts,
  onChangeFilter,
}: {
  filter: RecortesFilter
  counts: Record<RecortesFilter, number>
  onChangeFilter: (filter: RecortesFilter) => void
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {FILTERS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChangeFilter(value)}
          aria-pressed={filter === value}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
            filter === value
              ? 'bg-ink-800 text-paper-50'
              : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100/60'
          }`}
        >
          {label}
          <span className="ml-1 text-micro tabular-nums opacity-70">{counts[value]}</span>
        </button>
      ))}
    </div>
  )
}
