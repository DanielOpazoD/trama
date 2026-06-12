export function shouldReusePlaywrightServer({
  ci,
  reuseServer,
}: {
  ci?: string
  reuseServer?: string
}) {
  return !ci && reuseServer === '1'
}
