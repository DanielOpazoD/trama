/**
 * Splits an LLM chat reply into prose + an optional structured proposal.
 *
 * The model is asked to use a literal marker pair:
 *   <<<TRAMA-PROPOSAL
 *   {...json...}
 *   TRAMA-PROPOSAL>>>
 *
 * If the markers are present and the JSON parses, we lift the proposal out
 * and return the prose without it. If not, the whole content is prose and
 * proposal is null.
 *
 * Note: the proposal shape is validated lightly here. The endpoint should
 * still pass it through validateExtraction/validateReclassify before exposing
 * it to the UI as actionable items.
 */

import { z } from 'zod'

export type RawChatProposal = {
  entities?: unknown
  relationships?: unknown
  quotes?: unknown
  reclassifications?: unknown
}

const RawChatProposalSchema = z.object({
  entities: z.array(z.unknown()).optional(),
  relationships: z.array(z.unknown()).optional(),
  quotes: z.array(z.unknown()).optional(),
  reclassifications: z.array(z.unknown()).optional(),
})

export type ChatReply = {
  prose: string
  proposal: RawChatProposal | null
}

const OPEN = '<<<TRAMA-PROPOSAL'
const CLOSE = 'TRAMA-PROPOSAL>>>'

export function parseChatReply(raw: string): ChatReply {
  const start = raw.indexOf(OPEN)
  if (start === -1) {
    return { prose: raw.trim(), proposal: null }
  }
  const end = raw.indexOf(CLOSE, start + OPEN.length)
  if (end === -1) {
    // Open marker without close: treat as plain prose so we don't lose the
    // assistant's reply if the model misformatted the trailer.
    return { prose: raw.trim(), proposal: null }
  }

  const before = raw.slice(0, start).trim()
  const jsonSlice = raw.slice(start + OPEN.length, end).trim()

  let parsed: RawChatProposal | null = null
  try {
    const parseResult = RawChatProposalSchema.safeParse(JSON.parse(jsonSlice))
    if (parseResult.success) {
      parsed = parseResult.data
    }
  } catch {
    // Malformed JSON: drop the proposal but keep the prose so the user sees
    // the assistant's words.
    parsed = null
  }

  return { prose: before, proposal: parsed }
}

/**
 * Sniff whether a parsed proposal has anything actionable inside. Used to
 * skip persisting an empty `proposal: {}` when the model emits the block
 * with all-empty arrays.
 */
export function hasAnyProposal(p: RawChatProposal | null): boolean {
  if (!p) return false
  const counts = [
    Array.isArray(p.entities) ? p.entities.length : 0,
    Array.isArray(p.relationships) ? p.relationships.length : 0,
    Array.isArray(p.quotes) ? p.quotes.length : 0,
    Array.isArray(p.reclassifications) ? p.reclassifications.length : 0,
  ]
  return counts.some((c) => c > 0)
}
