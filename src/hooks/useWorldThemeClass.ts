import { useLayoutEffect } from 'react'
import type { World } from '../types/world'

/**
 * Aplica una clase `world-{world}` en `<html>` para que cada mundo tenga su
 * identidad de acento (Notas = salvia; Trama = prusia), definida en CSS y
 * compuesta con el tema activo (paper/night/vela). Usa `classList.toggle`
 * —igual que `useTheme`— para NO pisar las clases `dark`/`theme-vela`, y corre
 * en layout-effect para fijar el acento antes del primer pintado (sin parpadeo).
 */
export function useWorldThemeClass(world: World) {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('world-notas', world === 'notas')
    root.classList.toggle('world-trama', world === 'trama')
    return () => {
      root.classList.remove('world-notas', 'world-trama')
    }
  }, [world])
}
