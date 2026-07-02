type ReindexPending = { entities: number; quotes: number } | null

export type ReindexProgress = {
  totalPending: number | null
  progressMax: number
  progressValue: number
  isComplete: boolean
}

export function buildReindexProgress({
  pending,
  running,
  runStartTotal,
  runProcessed,
}: {
  pending: ReindexPending
  running: boolean
  runStartTotal: number
  runProcessed: number
}): ReindexProgress {
  const totalPending = pending ? pending.entities + pending.quotes : null
  const progressMax = Math.max(runStartTotal, 1)
  const progressValue = running
    ? Math.min(runProcessed, progressMax)
    : totalPending === 0
      ? progressMax
      : Math.min(runProcessed, progressMax)

  return {
    totalPending,
    progressMax,
    progressValue,
    isComplete: totalPending === 0,
  }
}
