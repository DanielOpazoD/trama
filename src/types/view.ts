/**
 * `ViewMode` — los slugs de las vistas top-level que monta `ViewRouter`.
 *
 * Antes vivía en `src/components/Sidebar.tsx` (porque ahí se renderiza
 * el switcher), pero el tipo es referenciado por App.tsx, ViewRouter,
 * useInitialView, CommandPalette, TopBar, MobileBottomNav, etc.
 * Tenerlo en `src/types/` evita el smell "tipo viviendo en un componente
 * y N archivos importándolo desde ahí".
 *
 * Si querés agregar una vista nueva: agregar slug acá, registrar la
 * lazy en ViewRouter, agregar entry en NAV_ITEMS de Sidebar, y
 * autocompletar el switch del CommandPalette.
 */
export type ViewMode =
  | 'inicio'
  | 'grafo'
  | 'entidades'
  | 'citas'
  | 'escuchas'
  | 'twitter'
  | 'momentos'
  | 'cronologia'
  | 'atlas'
  | 'chat'
  | 'sugerencias'
  // El Gabinete reúne los gestos literarios (Sortes, Espejo, Voz, Hojas,
  // Postales) en un índice descubrible. Ver src/components/GabineteView.tsx.
  | 'gabinete'
