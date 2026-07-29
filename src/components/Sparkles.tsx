import { motion, useReducedMotion } from 'framer-motion'

export interface Spark {
  /** CSS position, e.g. '18%' */
  x: string
  y: string
  /** dot diameter in px */
  size: number
  color: string
  delay: number
  duration: number
}

// The hero's accent-dot palette — cyan, brand purple, pale lilac. Reused so
// every sparkle on the page reads as the same chromatic moment as the mark.
export const SPARK_COLORS = {
  cyan: '#47BFFF',
  purple: '#863BFF',
  lilac: '#EDE6FF',
} as const

// A calm, deterministic scatter. Kept sparse on purpose — restraint is what
// keeps this feeling premium rather than novelty.
const DEFAULT_SPARKS: Spark[] = [
  { x: '8%', y: '24%', size: 5, color: SPARK_COLORS.cyan, delay: 0, duration: 5.5 },
  { x: '92%', y: '30%', size: 4, color: SPARK_COLORS.purple, delay: 0.8, duration: 6.5 },
  { x: '20%', y: '78%', size: 3, color: SPARK_COLORS.lilac, delay: 1.4, duration: 5 },
  { x: '78%', y: '70%', size: 5, color: SPARK_COLORS.purple, delay: 0.4, duration: 7 },
  { x: '50%', y: '14%', size: 3, color: SPARK_COLORS.cyan, delay: 1.1, duration: 6 },
]

interface SparklesProps {
  sparks?: Spark[]
  className?: string
}

/**
 * A decorative layer of slow-floating, twinkling glow dots. Absolutely fills
 * its nearest positioned ancestor, is pointer-transparent, and stills entirely
 * under prefers-reduced-motion. Purely atmospheric.
 */
export default function Sparkles({ sparks = DEFAULT_SPARKS, className = '' }: SparklesProps) {
  const reduce = useReducedMotion()

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden
    >
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            background: s.color,
            boxShadow: `0 0 ${s.size * 2.6}px ${s.size * 0.7}px ${s.color}66`,
          }}
          animate={
            reduce
              ? { opacity: 0.5 }
              : { y: [0, -12, 0], opacity: [0.3, 0.85, 0.3], scale: [1, 1.18, 1] }
          }
          transition={
            reduce
              ? undefined
              : { duration: s.duration, ease: 'easeInOut', repeat: Infinity, delay: s.delay }
          }
        />
      ))}
    </div>
  )
}
