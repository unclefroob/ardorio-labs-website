import { motion, type Variants, type Easing } from 'framer-motion'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const decisions = [
  {
    index: '01',
    title: 'Measuring what fits',
    common:
      'A validated personality test mapped to careers. Cheap, fast, and what most career tools ship.',
    call: 'Personality is the starting point, but performance is the stronger signal. So we built simulations that grade what a student actually does, and took on the far higher cost of authoring and marking them.',
  },
  {
    index: '02',
    title: 'Grading at scale',
    common:
      'Send every answer to one capable model and let it mark everything. Simple, and flexible enough for any task.',
    call: 'The model is reserved for open-ended judgement; structured answers are scored by deterministic rules. Timeouts and a safe fallback keep AI cost, latency and variance away from the student.',
  },
  {
    index: '03',
    title: 'Defining a good answer',
    common:
      'One marking standard, set by us and applied everywhere. Consistent across the platform and simple to support.',
    call: "Each institution authors its own rubric in the CRM, injected at grading time so a teacher's standard drives the score, not ours. A structured template keeps the added variance in check.",
  },
  {
    index: '04',
    title: 'Running the business',
    common: 'Plug in an off-the-shelf CRM like HubSpot alongside the product and move on.',
    call: 'The sales motion, with its trials, institutions and per-catalogue setup, was too tied to the product for a generic tool. We built the CRM into the platform, so leads, billing and content share one source of truth.',
  },
]

export default function PathIQApproach() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    >
      {decisions.map((d) => (
        <motion.div
          key={d.index}
          variants={item}
          className="py-8 border-b border-cream-300 grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          <div className="lg:col-span-4 flex items-start gap-4">
            <span className="label shrink-0 pt-0.5 w-6">{d.index}</span>
            <h3 className="font-serif text-xl text-ink leading-tight">{d.title}</h3>
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-dashed border-cream-400 p-4">
              <p className="label text-stone-400 mb-1.5">The default</p>
              <p className="text-sm text-stone-500 leading-relaxed">{d.common}</p>
            </div>
            <div className="rounded-xl border border-cream-300 bg-cream-100 p-4">
              <p className="label text-stone-500 mb-1.5">Our call</p>
              <p className="text-sm text-ink leading-relaxed">{d.call}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
