export function FocusModeExitButton({ onExit }: { onExit: () => void }) {
  return (
    <button
      onClick={onExit}
      aria-label="Salir del modo focus"
      title="Salir del modo focus (\)"
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 section-eyebrow hover:text-ink-700 bg-paper-50/90 hover:bg-paper-50 border border-ink-100/60 hover:border-ink-200 rounded-md backdrop-blur transition-colors animate-fade-up"
    >
      <span>focus</span>
      <kbd className="font-mono text-micro px-1.5 py-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-500 leading-none">
        \
      </kbd>
    </button>
  )
}
