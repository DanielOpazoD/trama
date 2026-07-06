import { useEffect, useState } from 'react'
import { readDayParamFromSearch } from './momentosViewModel'

/**
 * ω-D: filtro por día desde el heatmap del Inicio. Lee `?day=YYYY-MM-DD` de la
 * URL al mount y se actualiza si cambia por navegación (popstate). Valida el
 * formato — un día con caracteres no numéricos queda null. Devuelve la string
 * ISO o null. Vive fuera de MomentosView para no cargar al orquestador con la
 * plomería de URL.
 */
export function useDayFilter(): string | null {
  const [day, setDay] = useState<string | null>(() => readDayParam())
  useEffect(() => {
    function onPop() {
      setDay(readDayParam())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return day
}

function readDayParam(): string | null {
  if (typeof window === 'undefined') return null
  return readDayParamFromSearch(window.location.search)
}

/** Quita `?day=` de la URL y notifica (popstate) para refrescar el filtro. */
export function clearDayFilter(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('day')
  window.history.pushState({}, '', url.toString())
  window.dispatchEvent(new PopStateEvent('popstate'))
}
