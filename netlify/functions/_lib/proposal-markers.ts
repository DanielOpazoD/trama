/** Remove stale inline proposal payloads before replaying assistant prose. */
export function stripTramaProposalBlock(text: string): string {
  return text.replace(/<<<TRAMA-PROPOSAL[\s\S]*?TRAMA-PROPOSAL>>>/g, '').trim()
}
