const FNV_OFFSET = 2_166_136_261
const FNV_PRIME = 16_777_619

export function initialGraphHash(): number {
  return FNV_OFFSET
}

export function hashGraphPart(hash: number, value: unknown): number {
  const text = String(value ?? '')
  let next = hash
  for (let i = 0; i < text.length; i += 1) {
    next ^= text.charCodeAt(i)
    next = Math.imul(next, FNV_PRIME)
  }
  next ^= 31
  return Math.imul(next, FNV_PRIME) >>> 0
}

export function graphHashToSignature(hash: number): string {
  return hash.toString(36)
}
