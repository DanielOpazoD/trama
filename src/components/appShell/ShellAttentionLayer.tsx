import type { ViewMode } from '../../types/view'
import type { PendingProposal } from '../RightPanel'
import { AskBar } from '../AskBar'
import { FocusModeExitButton } from '../FocusModeExitButton'
import { ReadingMode } from '../ReadingMode'
import type { ShellVisibility } from './appShellModel'

export function ShellAttentionLayer({
  visibility,
  focusMode,
  view,
  selectedEntityId,
  showProposal,
  readingOpen,
  onProposal,
  onOpenThread,
  onOpenReading,
  onCloseReading,
  onExitFocusMode,
}: {
  visibility: ShellVisibility
  focusMode: boolean
  view: ViewMode
  selectedEntityId: string | null
  showProposal: boolean
  readingOpen: boolean
  onProposal: (text: string, proposal: PendingProposal['proposal']) => void
  onOpenThread: (threadId: string) => void
  onOpenReading: () => void
  onCloseReading: () => void
  onExitFocusMode: () => void
}) {
  return (
    <>
      {visibility.bottomFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-paper-50/75 to-paper-50"
        />
      )}
      {visibility.askBar && (
        <AskBar
          view={view}
          selectedEntityId={selectedEntityId}
          busy={showProposal}
          onProposal={onProposal}
          onOpenThread={onOpenThread}
          onOpenReading={onOpenReading}
        />
      )}
      <ReadingMode open={readingOpen} onClose={onCloseReading} onProposal={onProposal} />
      {focusMode && <FocusModeExitButton onExit={onExitFocusMode} />}
    </>
  )
}
