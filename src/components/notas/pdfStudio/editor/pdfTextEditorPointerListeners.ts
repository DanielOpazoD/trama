export function trackPointerMove(move: (event: PointerEvent) => void, done?: () => void) {
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    done?.()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
