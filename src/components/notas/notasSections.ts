import {
  BibliotecaIcon,
  ClipboardIcon,
  FilePdfIcon,
  HomeIcon,
  KeyIcon,
  NotesIcon,
  PromptIcon,
  TasksIcon,
} from '../Icons'
import { NOTAS_SECTIONS, type NotasSection } from '../../types/notas'

export type NotasSectionMeta = {
  id: NotasSection
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

/** Registro canónico de las secciones del mundo Notas (orden de la chrome). */
const SECTION_META_BY_ID: Record<NotasSection, Omit<NotasSectionMeta, 'id'>> = {
  inicio: { label: 'Inicio', icon: HomeIcon },
  notas: { label: 'Notas', icon: NotesIcon },
  tareas: { label: 'Tareas', icon: TasksIcon },
  prompts: { label: 'Prompts', icon: PromptIcon },
  claves: { label: 'Claves', icon: KeyIcon },
  pdf: { label: 'Imprenta', icon: FilePdfIcon },
  planillas: { label: 'Planillas', icon: ClipboardIcon },
  biblioteca: { label: 'Biblioteca', icon: BibliotecaIcon },
}

export const SECTIONS: NotasSectionMeta[] = NOTAS_SECTIONS.map((id) => ({
  id,
  ...SECTION_META_BY_ID[id],
}))

export const NOTAS_SECTION_TITLES: Record<
  NotasSection,
  { title: string; subtitle: string }
> = {
  inicio: { title: 'Inicio', subtitle: 'mundo notas' },
  notas: { title: 'Notas', subtitle: 'capturas y anexos' },
  tareas: { title: 'Tareas', subtitle: 'recordatorios de la semana' },
  prompts: { title: 'Prompts', subtitle: 'biblioteca reutilizable' },
  claves: { title: 'Claves', subtitle: 'bajo llave' },
  pdf: { title: 'Imprenta', subtitle: 'editar PDF' },
  planillas: { title: 'Planillas', subtitle: 'rellenar e imprimir' },
  biblioteca: { title: 'Biblioteca', subtitle: 'tus archivos' },
}
