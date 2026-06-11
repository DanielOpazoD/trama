import type { SavedFolderColor } from '../../../../lib/pdfStudio/render/persistence'

const folderColors: Record<
  SavedFolderColor,
  { back: string; front: string; tab: string }
> = {
  blue: { back: '#58b7df', front: '#35a6d6', tab: '#8fd4ef' },
  green: { back: '#45bf73', front: '#28a85a', tab: '#8edfa9' },
  orange: { back: '#f18a32', front: '#e56f18', tab: '#f8b36d' },
  purple: { back: '#9b7ad7', front: '#8061c8', tab: '#c3adf0' },
  slate: { back: '#7d8b99', front: '#667482', tab: '#abb6c1' },
}

export function WorkspaceFolderIcon({
  color,
  size = 26,
}: {
  color: SavedFolderColor
  size?: number
}) {
  const c = folderColors[color]
  return (
    <svg width={size} height={size} viewBox="0 0 32 26" aria-hidden>
      <path
        d="M2.5 7.5c0-1.5 1.2-2.7 2.7-2.7h7l2.2 3h12.4c1.5 0 2.7 1.2 2.7 2.7v10.2c0 1.5-1.2 2.7-2.7 2.7H5.2c-1.5 0-2.7-1.2-2.7-2.7Z"
        fill={c.back}
      />
      <path d="M5.4 5h7.1l2.2 3H5.4Z" fill={c.tab} />
      <path
        d="M2.5 10.5h27v10.2c0 1.5-1.2 2.7-2.7 2.7H5.2c-1.5 0-2.7-1.2-2.7-2.7Z"
        fill={c.front}
      />
      <path
        d="M3.5 11.5h25M5.3 23.4h21.4c1.5 0 2.8-1.2 2.8-2.8V10.5c0-1.5-1.2-2.8-2.8-2.8H14.4l-2.2-3H5.3c-1.5 0-2.8 1.2-2.8 2.8v13.1c0 1.6 1.2 2.8 2.8 2.8Z"
        fill="none"
        stroke="rgba(31,28,24,0.26)"
        strokeWidth="1"
      />
    </svg>
  )
}

export const workspaceFolderColorOptions: Array<{
  label: string
  value: SavedFolderColor
}> = [
  { label: 'azul', value: 'blue' },
  { label: 'verde', value: 'green' },
  { label: 'naranja', value: 'orange' },
  { label: 'morado', value: 'purple' },
  { label: 'gris', value: 'slate' },
]
