import { motion, type Easing } from 'framer-motion'
import type { ServiceLevel } from '../data/services'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

export default function ServiceLevels({ levels }: { levels: ServiceLevel[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {levels.map((level, i) => (
        <motion.div
          key={level.name}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
          className="relative flex flex-col bg-cream-200 rounded-2xl p-6 overflow-hidden"
        >
          {/* Ascending accent bar: taller with each level */}
          <div
            aria-hidden
            className="absolute top-0 left-0 h-1 rounded-b-full"
            style={{
              width: `${33 * (i + 1)}%`,
              background: 'linear-gradient(90deg, rgba(71,191,255,0.7), rgba(134,59,255,0.9))',
            }}
          />

          <div className="flex items-center justify-between mb-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, rgba(134,59,255,0.16), rgba(71,191,255,0.14))',
              }}
            >
              <level.icon size={20} strokeWidth={1.75} style={{ color: '#863BFF' }} />
            </div>
            <span className="label text-stone-500">{level.tag}</span>
          </div>

          <p className="font-serif text-lg text-ink">{level.name}</p>
          <p className="text-xs text-stone-500 mb-4">{level.audience}</p>

          <ul className="space-y-2 mt-auto">
            {level.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2.5 text-sm text-stone-600 leading-relaxed">
                <span className="font-mono text-stone-400 shrink-0 mt-0.5">—</span>
                {o}
              </li>
            ))}
          </ul>
        </motion.div>
      ))}
    </div>
  )
}
