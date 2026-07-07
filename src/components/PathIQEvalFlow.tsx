import { motion, useReducedMotion, type Variants, type Easing } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
}

function Node({
  title,
  caption,
  glow = false,
  reduce,
}: {
  title: string
  caption: string
  glow?: boolean
  reduce: boolean | null
}) {
  return (
    <motion.div variants={item} className="relative">
      {glow && (
        <motion.div
          aria-hidden
          className="absolute -inset-3 rounded-2xl pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(134,59,255,0.16), rgba(71,191,255,0.10) 45%, transparent 70%)',
            filter: 'blur(16px)',
          }}
          animate={reduce ? undefined : { opacity: [0.45, 0.9, 0.45] }}
          transition={reduce ? undefined : { duration: 4, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
      <div className="relative rounded-xl border border-cream-300 bg-cream-100 p-4">
        <p className="font-serif text-lg text-ink leading-tight">{title}</p>
        <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{caption}</p>
      </div>
    </motion.div>
  )
}

/** Vertical connector with a downward signal pulse. */
function VConn({ reduce, height = 34 }: { reduce: boolean | null; height?: number }) {
  return (
    <motion.div variants={item} className="relative mx-auto w-px bg-cream-400" style={{ height }}>
      <ChevronDown
        size={13}
        className="absolute left-1/2 -translate-x-1/2 -bottom-1 text-stone-400"
      />
      {!reduce && (
        <motion.span
          aria-hidden
          className="absolute left-1/2 -ml-[3px] w-1.5 h-1.5 rounded-full bg-stone-700"
          animate={{ y: [0, height - 6], opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.5 }}
        />
      )}
    </motion.div>
  )
}

export default function PathIQEvalFlow() {
  const reduce = useReducedMotion()

  return (
    <div className="bg-cream-200 rounded-2xl p-8 lg:p-12">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
        className="mx-auto max-w-3xl flex flex-col items-stretch"
      >
        {/* Entry */}
        <div className="mx-auto w-full sm:max-w-xs">
          <Node
            title="Response submitted"
            caption="A student completes a simulation task and submits their answer."
            reduce={reduce}
          />
        </div>

        {/* Fork */}
        <motion.div variants={item} className="relative w-full h-6" aria-hidden>
          <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-cream-400" />
          <div className="absolute top-3 left-1/4 right-1/4 h-px bg-cream-400" />
          <div className="absolute left-1/4 top-3 h-3 w-px bg-cream-400" />
          <div className="absolute left-3/4 top-3 h-3 w-px bg-cream-400" />
        </motion.div>

        {/* Two lanes */}
        <div className="grid grid-cols-2 gap-4 lg:gap-8 items-stretch">
          {/* Open-ended lane */}
          <div className="flex flex-col">
            <motion.p variants={item} className="label text-stone-500 text-center mb-3">
              Open-ended
            </motion.p>
            <Node
              title="Prompt assembled"
              caption="Simulation title, task, scenario and the CMS-authored rubric are injected into a stored template at call time."
              reduce={reduce}
            />
            <VConn reduce={reduce} />
            <Node
              title="Claude evaluates"
              caption="Open-ended tasks are dispatched in parallel, each call wrapped in its own timeout."
              glow
              reduce={reduce}
            />
            <VConn reduce={reduce} />
            <Node
              title="Score parsed"
              caption="The JSON reply is parsed to a score and feedback, with the score clamped to a valid 0–100 range."
              reduce={reduce}
            />
          </div>

          {/* Structured lane */}
          <div className="flex flex-col">
            <motion.p variants={item} className="label text-stone-500 text-center mb-3">
              Structured
            </motion.p>
            <Node
              title="Deterministic scoring"
              caption="Multiple choice, ranking, checkbox and numeric answers are scored by rules. No model call, so results are fully reproducible."
              reduce={reduce}
            />
            {/* filler line down to the merge, so both lanes bottom-align */}
            <div className="relative flex-1 min-h-[24px] w-px mx-auto bg-cream-400" />
          </div>
        </div>

        {/* Merge */}
        <motion.div variants={item} className="relative w-full h-6" aria-hidden>
          <div className="absolute left-1/4 top-0 h-3 w-px bg-cream-400" />
          <div className="absolute left-3/4 top-0 h-3 w-px bg-cream-400" />
          <div className="absolute top-3 left-1/4 right-1/4 h-px bg-cream-400" />
          <div className="absolute left-1/2 top-3 h-3 w-px -translate-x-1/2 bg-cream-400" />
          <ChevronDown
            size={13}
            className="absolute left-1/2 -translate-x-1/2 -bottom-1 text-stone-400"
          />
        </motion.div>

        {/* Exit */}
        <div className="mx-auto w-full sm:max-w-xs">
          <Node
            title="Feedback to student"
            caption="A personalised result in seconds. A failed AI call degrades to a safe fallback, never an error."
            reduce={reduce}
          />
        </div>
      </motion.div>
    </div>
  )
}
