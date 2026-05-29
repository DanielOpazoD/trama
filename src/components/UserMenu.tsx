/**
 * UserMenu — avatar del usuario logueado con menú de cerrar sesión.
 *
 * Es el <UserButton> de Clerk envuelto en <Show when="signed-in"> para
 * que solo aparezca cuando hay sesión activa. Si Clerk no está
 * configurado (sin VITE_CLERK_PUBLISHABLE_KEY), no renderiza nada — en
 * modo legacy single-user no hay sesión que mostrar.
 *
 * Vive en el cluster derecho del TopBar, junto al StatusPill, así está
 * disponible desde cualquier vista. Al hacer clic abre el menú de Clerk
 * (gestionar cuenta / cerrar sesión).
 */
import { Show, UserButton } from '@clerk/react'

export function UserMenu() {
  const hasClerk = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  if (!hasClerk) return null

  return (
    <Show when="signed-in">
      <UserButton />
    </Show>
  )
}
