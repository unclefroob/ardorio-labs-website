import { motion, useReducedMotion, type Variants, type Easing } from 'framer-motion'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: EASE },
  }),
}

const appCapabilities = [
  'Personality assessment and archetypes',
  'Career matches ranked by performance',
  'Day-in-the-life simulations',
  'Degree recommendations',
]

const crmCapabilities = [
  'Leads and a full sales pipeline',
  'Institutions, trials and invoices',
  'Simulation and degree content',
  'Roles and permissions',
]

const pipeline = ['New', 'Contacted', 'Meeting', 'Qualified', 'Offer', 'Won']

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c} className="flex items-start gap-3 text-sm text-stone-600">
          <span className="font-mono text-stone-400 shrink-0 mt-0.5">—</span>
          {c}
        </li>
      ))}
    </ul>
  )
}

export default function PathIQProductMap() {
  const reduce = useReducedMotion()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Student-facing product */}
      <motion.div
        custom={0}
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
        className="bg-cream-200 rounded-2xl p-8 flex flex-col"
      >
        <p className="label text-stone-500 mb-2">For students</p>
        <h3 className="font-serif text-2xl text-ink mb-6">The product</h3>

        {/* Abstract simulation UI */}
        <div className="rounded-xl border border-cream-300 bg-cream-100 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="label text-stone-500">Simulation · task 3 of 5</span>
            <span className="w-2 h-2 rounded-full bg-green-500" />
          </div>
          <div className="h-1 rounded-full bg-cream-300 overflow-hidden mb-4">
            <motion.div
              className="h-full bg-stone-700"
              initial={{ width: '0%' }}
              whileInView={{ width: '60%' }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: EASE, delay: 0.3 }}
            />
          </div>
          <p className="font-serif text-lg text-ink leading-snug mb-3">
            The load report doesn't add up.
          </p>
          <div className="space-y-1.5 mb-4">
            <div className="h-2 rounded bg-cream-300 w-full" />
            <div className="h-2 rounded bg-cream-300 w-4/5" />
          </div>
          <div className="flex items-center justify-between">
            <span className="label text-stone-400">Your response</span>
            <span className="px-2.5 py-0.5 rounded-full bg-cream-300 font-mono text-xs text-ink">
              Score 82
            </span>
          </div>
        </div>

        <Bullets items={appCapabilities} />
      </motion.div>

      {/* Internal CRM */}
      <motion.div
        custom={1}
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
        className="bg-cream-200 rounded-2xl p-8 flex flex-col"
      >
        <p className="label text-stone-500 mb-2">For the team</p>
        <h3 className="font-serif text-2xl text-ink mb-6">The internal CRM</h3>

        {/* Sales pipeline */}
        <div className="rounded-xl border border-cream-300 bg-cream-100 p-4 mb-6">
          <p className="label text-stone-500 mb-4">Sales pipeline</p>
          <div className="relative flex items-center gap-1.5 flex-wrap">
            {pipeline.map((s, i) => {
              const won = s === 'Won'
              return (
                <span key={s} className="flex items-center gap-1.5">
                  <span
                    className={`px-2.5 py-1 rounded-full font-mono text-[11px] leading-none border ${
                      won
                        ? 'bg-ink text-cream-100 border-ink'
                        : 'bg-cream-200 text-stone-600 border-cream-300'
                    }`}
                  >
                    {s}
                  </span>
                  {i < pipeline.length - 1 && (
                    <span className="text-cream-400 text-xs" aria-hidden>
                      ›
                    </span>
                  )}
                </span>
              )
            })}
            {!reduce && (
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-px bg-stone-700"
                initial={{ width: 0 }}
                animate={{ width: ['0%', '100%'] }}
                transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.8 }}
              />
            )}
          </div>
        </div>

        <Bullets items={crmCapabilities} />
      </motion.div>
    </div>
  )
}
