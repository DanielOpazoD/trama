export function readWebhookEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key)
  } catch {
    return process.env[key]
  }
}
