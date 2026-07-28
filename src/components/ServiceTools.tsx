import { motion, type Easing } from 'framer-motion'
import type { ServiceTool } from '../data/services'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

export default function ServiceTools({ tools }: { tools: ServiceTool[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tools.map((tool, i) => (
        <motion.div
          key={tool.name}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
          className="relative flex flex-col bg-cream-200 rounded-2xl p-6 overflow-hidden"
        >
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-1"
            style={{
              background: 'linear-gradient(90deg, rgba(71,191,255,0.7), rgba(134,59,255,0.9))',
            }}
          />
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="font-serif text-xl text-ink">{tool.name}</p>
            <span className="label text-stone-500">{tool.provider}</span>
          </div>
          <p className="text-sm text-stone-600 leading-relaxed">{tool.description}</p>
        </motion.div>
      ))}
    </div>
  )
}
