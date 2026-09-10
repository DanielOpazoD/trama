import { useMemo } from 'react'
import { isPinEnabled } from '../components/AppPinGate'
import type { CommandSearchBuildInput } from './commandSearchModel'
import { useModuleVisibility } from './useModuleVisibility'
import { useSectionAlias } from './useSectionAlias'
import { useSectionPin } from './useSectionPin'
import { useSectionVisibility } from './useSectionVisibility'

/**
 * Lo que el buscador sabe de las preferencias de secciones: cuáles se ven, cuáles
 * piden PIN y con qué alias se llama cada una. Sale de `useCommandSearch`, que
 * solo orquesta la búsqueda.
 */
export function useCommandSearchVisibility(): Pick<
  CommandSearchBuildInput,
  'sectionAliases' | 'visibility'
> {
  const sectionVis = useSectionVisibility()
  const moduleVis = useModuleVisibility()
  const { isPinRequired } = useSectionPin()
  const { sectionAliases } = useSectionAlias()
  const pinActive = isPinEnabled()
  const visibility = useMemo(
    () => ({
      isViewVisible: sectionVis.isVisible,
      isModuleVisible: moduleVis.isVisible,
      isPinRequired,
      pinActive,
    }),
    [isPinRequired, moduleVis.isVisible, pinActive, sectionVis.isVisible],
  )
  return { sectionAliases, visibility }
}
