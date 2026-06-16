import type { HTMLAttributes } from 'react'

import './TramaMascot.css'

type TramaMascotProps = HTMLAttributes<HTMLSpanElement> & {
  className?: string
}

export function TramaMascot({ className = '', ...props }: TramaMascotProps) {
  return (
    <span
      aria-label="Mascota de Trama"
      className={['trama-mascot', className].filter(Boolean).join(' ')}
      role="img"
      {...props}
    />
  )
}
