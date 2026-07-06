import { motion, useReducedMotion } from 'framer-motion'
import Logo from './Logo'

interface GlowMarkProps {
  size?: number
  className?: string
}

/**
 * The Ardorio mark rendered as the brand's one sanctioned chromatic moment —
 * cyan/purple glow halos and drop-shadow lifted from the LinkedIn banner recipe,
 * with a slow vertical float. Decorative only.
 */
export default function GlowMark({ size = 300, className = '' }: GlowMarkProps) {
  const reduce = useReducedMotion()

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Outer halo */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: -size * 0.22,
          background:
            'radial-gradient(ellipse at center, rgba(71,191,255,0.18) 0%, rgba(134,59,255,0.24) 30%, rgba(126,20,255,0.10) 55%, transparent 75%)',
          filter: 'blur(40px)',
        }}
      />
      {/* Inner tighter halo */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: size * 0.12,
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(134,59,255,0.16) 0%, transparent 65%)',
          filter: 'blur(22px)',
        }}
      />
      {/* The mark itself */}
      <motion.div
        className="relative flex items-center justify-center w-full h-full"
        style={{
          filter:
            'drop-shadow(0 0 28px rgba(71,191,255,0.30)) drop-shadow(0 0 12px rgba(134,59,255,0.45))',
        }}
        animate={reduce ? undefined : { y: [0, -14, 0] }}
        transition={
          reduce
            ? undefined
            : { duration: 7, ease: 'easeInOut', repeat: Infinity }
        }
      >
        <Logo size={Math.round(size * 0.6)} />
      </motion.div>
    </div>
  )
}
