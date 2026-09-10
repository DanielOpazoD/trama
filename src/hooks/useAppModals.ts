import { useCallback, useState } from 'react'
import type { SettingsSectionId } from '../components/settings/settingsModel'

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
  // La sección con que se abre Configuración. Solo `openSettingsAt` la fija y
  // cerrar la olvida: abrirla después desde la barra lateral no debe caer en la
  // sección que pidió un vacío (p. ej. «Conectar X»).
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | null>(null)

  const openModal = useCallback((key: AppModalKey) => {
    setState((current) => (current[key] ? current : { ...current, [key]: true }))
  }, [])

  const openSettingsAt = useCallback((section: SettingsSectionId) => {
    setSettingsSection(section)
    setState((current) => (current.settings ? current : { ...current, settings: true }))
  }, [])

  const closeModal = useCallback((key: AppModalKey) => {
    if (key === 'settings') setSettingsSection(null)
    setState((current) => (!current[key] ? current : { ...current, [key]: false }))
  }, [])

  const toggleModal = useCallback((key: AppModalKey) => {
    // Cerrada, la sección ya es null; abierta, alternar la cierra: se olvida igual.
    if (key === 'settings') setSettingsSection(null)
    setState((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  return {
    ...state,
    settingsSection,
    openModal,
    openSettingsAt,
    closeModal,
    toggleModal,
  }
}
