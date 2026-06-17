import { useEffect, useRef } from 'react'

type ThreadPoint = {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
}

const POINT_COUNT = 38
const LINK_DISTANCE = 184
const POINTER_FORCE = 0.0007
const THREAD_ALPHA = 0.045
const POINT_ALPHA = 0.055

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function readCssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function makePoints(width: number, height: number): ThreadPoint[] {
  return Array.from({ length: POINT_COUNT }, (_, index) => {
    const side = index % 2 === 0 ? 'left' : 'right'
    const sideIndex = Math.floor(index / 2)
    const column = (sideIndex % 5) / 4
    const row = Math.floor(sideIndex / 5) / 4
    const xStart = side === 'left' ? 0.02 : 0.64
    const xRange = side === 'left' ? 0.28 : 0.34
    return {
      x: width * (xStart + column * xRange) + Math.sin(index * 2.1) * 26,
      y: height * (0.04 + row * 0.86) + Math.cos(index * 1.7) * 24,
      vx: Math.sin(index * 1.9) * 0.018,
      vy: Math.cos(index * 2.3) * 0.016,
      phase: index * 0.8,
    }
  })
}

export function LoginThreadField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas?.getContext('2d') ?? null
    } catch {
      context = null
    }
    if (!canvas || !context) return
    const ctx = context

    let frame = 0
    let raf = 0
    let width = 0
    let height = 0
    let points: ThreadPoint[] = []
    const pointer = { x: 0, y: 0, active: false }
    const reducedMotion = prefersReducedMotion()
    const ink = readCssColor('--ink-700', '24 24 27')
    const gold = readCssColor('--accent-gold', '#a07900')
    const cyan = readCssColor('--accent-cyan', '#2a9aa6')

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      points = makePoints(width, height)
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      frame += reducedMotion ? 0 : 1

      const drift = frame * 0.012
      for (const point of points) {
        if (!reducedMotion) {
          point.x += point.vx + Math.sin(drift + point.phase) * 0.014
          point.y += point.vy + Math.cos(drift + point.phase) * 0.012

          if (pointer.active) {
            const dx = pointer.x - point.x
            const dy = pointer.y - point.y
            const distance = Math.max(36, Math.hypot(dx, dy))
            const force = Math.min(1, 130 / distance) * POINTER_FORCE
            point.x += dx * force
            point.y += dy * force
          }

          if (point.x < -20) point.x = width + 20
          if (point.x > width + 20) point.x = -20
          if (point.y < -20) point.y = height + 20
          if (point.y > height + 20) point.y = -20
        }
      }

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i]!
          const b = points[j]!
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          if (distance > LINK_DISTANCE) continue
          const alpha = ((1 - distance / LINK_DISTANCE) * THREAD_ALPHA).toFixed(3)
          ctx.strokeStyle = `rgb(${ink} / ${alpha})`
          ctx.lineWidth = 0.7
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      for (const point of points) {
        ctx.fillStyle = `rgb(${ink} / ${POINT_ALPHA})`
        ctx.beginPath()
        ctx.arc(point.x, point.y, 1.25, 0, Math.PI * 2)
        ctx.fill()
      }

      const centerX = width * 0.5
      const centerY = height * 0.255
      const clearRadius = Math.min(width * 0.18, 190)
      const fade = ctx.createRadialGradient(
        centerX,
        centerY,
        clearRadius * 0.58,
        centerX,
        centerY,
        clearRadius,
      )
      fade.addColorStop(0, 'rgb(255 255 255 / 0.54)')
      fade.addColorStop(1, 'rgb(255 255 255 / 0)')
      ctx.fillStyle = fade
      ctx.fillRect(
        centerX - clearRadius,
        centerY - clearRadius,
        clearRadius * 2,
        clearRadius * 2,
      )

      ctx.strokeStyle = gold
      ctx.globalAlpha = reducedMotion ? 0.08 : 0.045 + Math.sin(frame * 0.035) * 0.014
      ctx.lineWidth = 0.95
      ctx.beginPath()
      ctx.moveTo(width * 0.32, height * 0.23)
      ctx.bezierCurveTo(
        width * 0.42,
        height * 0.14,
        width * 0.52,
        height * 0.33,
        width * 0.64,
        height * 0.23,
      )
      ctx.stroke()
      ctx.strokeStyle = cyan
      ctx.globalAlpha = reducedMotion ? 0.045 : 0.026 + Math.sin(frame * 0.028) * 0.01
      ctx.beginPath()
      ctx.moveTo(width * 0.25, height * 0.37)
      ctx.bezierCurveTo(
        width * 0.38,
        height * 0.28,
        width * 0.58,
        height * 0.42,
        width * 0.77,
        height * 0.29,
      )
      ctx.stroke()
      ctx.globalAlpha = 1

      if (!reducedMotion) raf = window.requestAnimationFrame(draw)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = true
    }
    const handlePointerLeave = () => {
      pointer.active = false
    }

    resize()
    draw()

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            resize()
            draw()
          })
    observer?.observe(canvas)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      window.cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  return (
    <canvas
      aria-hidden="true"
      className="trama-login-thread-field"
      data-testid="login-thread-field"
      ref={canvasRef}
    />
  )
}
