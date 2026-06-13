const DEFAULT_MAX_WORKERS = '--maxWorkers=4'

export function buildVitestArgs(args) {
  const hasMaxWorkers = args.some(
    (arg) => arg === '--maxWorkers' || arg.startsWith('--maxWorkers='),
  )
  return hasMaxWorkers ? args : [DEFAULT_MAX_WORKERS, ...args]
}
