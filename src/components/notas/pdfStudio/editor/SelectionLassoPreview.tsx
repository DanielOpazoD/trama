import { ACCENT } from './editorStyle'

type LassoPoint = { x: number; y: number }

export function SelectionLassoPreview({
  points,
  width,
  height,
}: {
  points: LassoPoint[]
  width: number
  height: number
}) {
  if (points.length < 2) return null
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  return (
    <svg
      aria-hidden="true"
      data-pdf-selection-lasso="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
