import { useCallback, useState } from 'react'

export type AppModalKey =
  'settings' | 'reading' | 'sortes' | 'espejo' | 'careo' | 'palette' | 'shortcuts'

type AppModalState = Record<AppModalKey, boolean>

const CLOSED_MODALS: AppModalState = {
  settings: false,
  reading: false,
  sortes: false,
  espejo: false,
  careo: false,
  palette: false,
  shortcuts: false,
}

export function useAppModals() {
  const [state, setState] = useState<AppModalState>(CLOSED_MODALS)

  const openModal = useCallback((key: AppModalKey) => {
    setState((current) => (current[key] ? current : { ...current, [key]: true }))
  }, [])

  const closeModal = useCallback((key: AppModalKey) => {
    setState((current) => (!current[key] ? current : { ...current, [key]: false }))
  }, [])

  const toggleModal = useCallback((key: AppModalKey) => {
    setState((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  return {
    ...state,
    openModal,
    closeModal,
    toggleModal,
  }
}
