import { motion, useReducedMotion, type Variants, type Easing } from 'framer-motion'
import type { ServiceStep } from '../data/services'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
}

const line: Variants = {
  hidden: { scaleY: 0 },
  show: { scaleY: 1, transition: { duration: 0.9, ease: EASE } },
}

export default function ServiceSteps({ steps }: { steps: ServiceStep[] }) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      className="relative"
    >
      {/* Connector rail: drawn in, with a travelling pulse */}
      <div className="absolute left-[1.375rem] top-6 bottom-6 w-px" aria-hidden>
        <motion.div variants={line} className="w-full h-full origin-top bg-cream-300" />
        {!reduce && (
          <motion.span
            className="absolute left-1/2 -ml-[3px] w-1.5 h-1.5 rounded-full bg-stone-700"
            animate={{ top: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1 }}
          />
        )}
      </div>

      <div className="space-y-9">
        {steps.map((step) => (
          <motion.div key={step.title} variants={item} className="relative pl-16">
            <div className="absolute left-0 top-0 w-11 h-11 rounded-full border border-cream-300 bg-cream-100 flex items-center justify-center">
              <step.icon size={18} strokeWidth={1.75} className="text-stone-700" />
            </div>
            <h3 className="font-serif text-xl text-ink mb-2 pt-2.5 leading-none">{step.title}</h3>
            <p className="text-stone-600 leading-relaxed text-sm max-w-2xl">{step.body}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
