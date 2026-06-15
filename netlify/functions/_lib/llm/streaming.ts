export type OpenAICompatibleSseFrame =
  | { content: string; tokensIn?: never; tokensOut?: never }
  | { content?: never; tokensIn?: number; tokensOut?: number }

export function parseOpenAICompatibleSseBlock(
  eventBlock: string,
): OpenAICompatibleSseFrame[] {
  const frames: OpenAICompatibleSseFrame[] = []
  for (const line of eventBlock.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') continue
    let parsed: {
      choices?: Array<{ delta?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    try {
      parsed = JSON.parse(payload)
    } catch {
      continue
    }
    const delta = parsed.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) {
      frames.push({ content: delta })
    }
    if (parsed.usage) {
      frames.push({
        tokensIn: parsed.usage.prompt_tokens,
        tokensOut: parsed.usage.completion_tokens,
      })
    }
  }
  return frames
}
