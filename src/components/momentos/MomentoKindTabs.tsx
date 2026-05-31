import type { MomentoKind } from '../../types'

export function MomentoKindTabs({
  kind,
  onChange,
}: {
  kind: MomentoKind
  onChange: (k: MomentoKind) => void
}) {
  return (
    <div className="flex gap-1 p-1 bg-paper-50/60 rounded-lg border border-ink-100/50 w-fit">
      {(['nota', 'recorte', 'foto'] as MomentoKind[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-3 py-1 rounded text-caption transition-all duration-150 active:scale-95 ${
            kind === k
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          {k === 'nota' ? 'Nota' : k === 'recorte' ? 'Recorte' : 'Foto'}
        </button>
      ))}
    </div>
  )
}
