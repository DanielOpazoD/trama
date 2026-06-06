let seq = 0

export function nextId(prefix: string): string {
  return `${prefix}${(seq += 1)}`
}

export function nextIdNumber(): number {
  return seq + 1
}

export function reseedIdCounter(max: number): void {
  if (max > seq) seq = max
}
