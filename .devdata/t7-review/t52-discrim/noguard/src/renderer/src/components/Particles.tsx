import { useEffect, useRef } from 'react'

interface P {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
  hue: 'cyan' | 'purple' | 'blue'
}

/**
 * Lightweight ambient particle background (≤48 particles, frame-skipped,
 * pauses when the window is hidden, disabled for reduced-motion users).
 */
export function Particles(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0
    let h = 0
    let raf = 0
    let last = 0

    const resize = (): void => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const colors: Record<P['hue'], string> = {
      cyan: 'rgba(56,189,248,',
      purple: 'rgba(168,85,247,',
      blue: 'rgba(99,102,241,'
    }
    const N = Math.min(48, Math.max(24, Math.floor(window.innerWidth / 36)))
    const parts: P[] = Array.from({ length: N }, () => ({
      x: Math.random() * (w || 1280),
      y: Math.random() * (h || 800),
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.22,
      r: 0.8 + Math.random() * 1.8,
      a: 0.1 + Math.random() * 0.35,
      hue: (['cyan', 'purple', 'blue'] as const)[Math.floor(Math.random() * 3)]
    }))

    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick)
      // frame skip → ~30fps budget
      if (t - last < 33) return
      last = t
      if (document.hidden) return

      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -8) p.x = w + 8
        if (p.x > w + 8) p.x = -8
        if (p.y < -8) p.y = h + 8
        if (p.y > h + 8) p.y = -8
        const c = colors[p.hue]
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        grad.addColorStop(0, `${c}${p.a})`)
        grad.addColorStop(1, `${c}0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  )
}
