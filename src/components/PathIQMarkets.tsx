import { motion, type Variants, type Easing } from 'framer-motion'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}

const markets = [
  { name: 'Students', line: 'Make a confident, evidence-based decision about what to study and why.' },
  { name: 'Schools', line: 'Stronger career-guidance outcomes, backed by how students actually perform.' },
  { name: 'Universities', line: 'Connect prospective students to the programmes that genuinely fit them.' },
]

export default function PathIQMarkets() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      {/* Three markets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {markets.map((m) => (
          <motion.div
            key={m.name}
            variants={item}
            className="bg-cream-200 rounded-2xl p-6 text-center sm:text-left"
          >
            <p className="font-serif text-xl text-ink mb-2">{m.name}</p>
            <p className="text-sm text-stone-600 leading-relaxed">{m.line}</p>
          </motion.div>
        ))}
      </div>

      {/* Converge into one platform */}
      <motion.div variants={item} className="relative w-full h-8 hidden sm:block" aria-hidden>
        <div className="absolute left-[16.666%] top-0 h-4 w-px bg-cream-400" />
        <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-cream-400" />
        <div className="absolute left-[83.333%] top-0 h-4 w-px bg-cream-400" />
        <div className="absolute top-4 left-[16.666%] right-[16.666%] h-px bg-cream-400" />
        <div className="absolute left-1/2 top-4 h-4 w-px -translate-x-1/2 bg-cream-400" />
      </motion.div>

      {/* Platform base */}
      <motion.div
        variants={item}
        className="mt-4 sm:mt-0 rounded-2xl border border-cream-300 bg-cream-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1.5 sm:gap-3 text-center"
      >
        <span className="font-serif text-lg text-ink">One PathIQ platform</span>
        <span className="hidden sm:inline text-cream-400" aria-hidden>·</span>
        <span className="label text-stone-500">separate catalogues and configurations for each</span>
      </motion.div>
    </motion.div>
  )
}
