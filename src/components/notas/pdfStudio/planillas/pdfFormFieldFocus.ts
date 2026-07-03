/** Enfoca el control DOM de un casillero para escribir de inmediato (tras
 *  crear con shift+clic o doble clic sobre uno existente). Best-effort. */
export function focusFormFieldControl(
  id: string,
  options: { select?: boolean } = {},
): boolean {
  const selector = `[data-form-field-control="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
  const control = document.querySelector<HTMLElement>(selector)
  if (!control) return false
  control.focus({ preventScroll: true })
  if (options.select && control instanceof HTMLInputElement) {
    const selectableTypes = new Set(['', 'email', 'search', 'tel', 'text', 'url'])
    if (selectableTypes.has(control.type)) control.select()
  }
  return true
}
