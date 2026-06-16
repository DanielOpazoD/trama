import './TramaMascot.css'

type TramaMascotProps = {
  className?: string
}

export function TramaMascot({ className = '' }: TramaMascotProps) {
  return (
    <span
      aria-label="Mascota de Trama"
      className={['trama-mascot', className].filter(Boolean).join(' ')}
      role="img"
    />
  )
}
