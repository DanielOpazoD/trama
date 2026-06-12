export function shouldUseClerk({
  e2eBypass,
  publishableKey,
}: {
  e2eBypass?: string
  publishableKey?: string
}) {
  return Boolean(publishableKey) && e2eBypass !== '1'
}
