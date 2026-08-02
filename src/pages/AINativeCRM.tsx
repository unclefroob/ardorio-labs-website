import { Link } from 'react-router-dom'
import { motion, useReducedMotion, type Variants, type Easing } from 'framer-motion'
import {
  ArrowUpRight,
  SlidersHorizontal,
  Bot,
  Network,
  Workflow,
  KeyRound,
  Layers,
  Search,
  Blocks,
  ArrowLeftRight,
  Users,
  type LucideIcon,
} from 'lucide-react'
import SEO from '../components/SEO'
import GlowMark from '../components/GlowMark'
import Sparkles from '../components/Sparkles'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: EASE },
  }),
}

interface Feature {
  icon: LucideIcon
  title: string
  body: string
}

const features: Feature[] = [
  {
    icon: SlidersHorizontal,
    title: 'Built around your process',
    body: 'Not a generic template you bend your business to. We shape the CRM to how your team actually works, and the fields, stages, and rules that matter to you.',
  },
  {
    icon: Bot,
    title: 'AI does the admin',
    body: 'The data entry, enrichment, deduping, and logging your team does by hand is handled for them, so records stay clean without the busywork.',
  },
  {
    icon: Network,
    title: 'It surfaces the next move',
    body: 'The CRM reads itself and tells your team what to do next, the follow-ups, the matches, and the opportunities that would otherwise slip.',
  },
  {
    icon: Workflow,
    title: 'Automations built in',
    body: 'No-code pipelines pull the information, generate the work, and push it back through your CRM, running on their own inside your guardrails.',
  },
  {
    icon: KeyRound,
    title: 'You own it',
    body: 'Your system and your data, not a per-seat licence that grows with your team. No vendor lock-in, and nothing held hostage.',
  },
  {
    icon: Layers,
    title: 'Replaces what you rent',
    body: 'One custom system in place of the stack of SaaS subscriptions you pay for every month, built to do more than any of them did.',
  },
]

interface Step {
  icon: LucideIcon
  title: string
  body: string
}

const steps: Step[] = [
  {
    icon: Search,
    title: 'Map your process',
    body: 'We learn how your business really runs and where your current CRM slows you down or makes you work around it.',
  },
  {
    icon: Blocks,
    title: 'Build your CRM',
    body: 'We build a custom, AI-native system around that process, with the AI doing the work rather than sitting on the side.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Migrate and integrate',
    body: 'We bring your existing data across and connect the tools you already use, so nothing is left behind in the move.',
  },
  {
    icon: Users,
    title: 'Your team runs it',
    body: 'You own the system and run it day to day. We train your team, stay close, and keep refining it with you.',
  },
]

const rented = [
  'A per-seat licence that grows every time you hire',
  'One workflow for everyone, whatever your business does',
  'AI features bolted onto a database built years ago',
  'Your data on the vendor’s terms, hard to leave',
  'You adapt your business to the tool',
]

const owned = [
  'Built once and owned outright, no per-seat rent',
  'Shaped to your exact process and language',
  'AI at the core, doing the work end to end',
  'Your data in your system, yours to keep',
  'The tool is shaped to your business',
]

export default function AINativeCRM() {
  const reduce = useReducedMotion()

  return (
    <div className="pt-14">
      <SEO
        title="AI-Native CRMs | Custom-built, and you own it"
        description="Ardorio builds custom, AI-native CRMs with AI at the core, not bolted on. Built around your process, they do the busywork, and you own the system and your data."
        canonical="/ai-native-crm"
        ogImage="/og-ai-native-crm.png"
      />
      <div className="divider" />

      {/* Hero */}
      <section className="grain relative overflow-hidden py-16 sm:py-20">
        <div className="relative z-[1] max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12 items-center">
            <div className="lg:col-span-7">
              <p className="label mb-6">AI-Native CRMs</p>
              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] text-ink">
                A CRM built for you,
                <br />
                <em>AI-native.</em>
              </h1>
              <p className="text-stone-600 text-lg leading-relaxed mt-8 mb-8 max-w-lg">
                We build custom CRMs with AI at the core, not bolted on. Built around how your business actually works, they do the data entry, enrichment, and follow-up your team does by hand. You own the system and your data, with no per-seat rent.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/contact" className="btn-primary">
                  Book a call
                </Link>
                <a href="#how-it-works" className="btn-ghost">
                  See how it works <ArrowUpRight size={14} />
                </a>
              </div>
            </div>

            <motion.div
              className="lg:col-span-5 hidden lg:flex items-center justify-center relative"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.9, ease: EASE }}
            >
              <GlowMark size={320} />
              {!reduce && <Sparkles />}
            </motion.div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* The idea */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4">
            <p className="label">Why AI-native</p>
          </div>
          <div className="lg:col-span-8">
            <p className="font-serif text-2xl sm:text-3xl text-ink leading-snug">
              Most CRMs are databases you pay to fill in. Yours should do the work.
            </p>
            <p className="text-stone-600 leading-relaxed mt-6 max-w-2xl">
              The big SaaS CRMs are generic by design, rented by the seat, and built long before AI. You mould your business to fit them, then pay people to keep them tidy. An AI-native CRM starts from the opposite place. It is built around your process, with AI doing the admin, surfacing the next move, and running the follow-ups, so the system earns its keep instead of adding to the pile.
            </p>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Own vs rent */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[620px] max-w-full h-[420px] rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(134,59,255,0.10) 0%, rgba(71,191,255,0.05) 48%, transparent 72%)',
              filter: 'blur(54px)',
            }}
          />
        </div>
        <div className="relative z-[1] mb-10">
          <p className="label">Own it, don't rent it</p>
        </div>
        <div className="relative z-[1] grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-cream-300 p-8">
            <p className="label text-stone-500 mb-6">A rented SaaS CRM</p>
            <ul className="space-y-3">
              {rented.map((r) => (
                <li key={r} className="flex gap-3 text-stone-600 text-sm leading-relaxed">
                  <span className="font-mono text-stone-400 shrink-0">—</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-cream-200 p-8 shadow-[0_0_40px_rgba(134,59,255,0.08)]">
            <p className="label text-[#863BFF] mb-6">Your AI-native CRM</p>
            <ul className="space-y-3">
              {owned.map((o) => (
                <li key={o} className="flex gap-3 text-stone-700 text-sm leading-relaxed">
                  <span className="font-mono text-[#863BFF] shrink-0">—</span>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* What you get */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="label">What you get</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={f.title}
                custom={i}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
                className="bg-cream-200 rounded-2xl p-7 flex flex-col"
              >
                <span className="w-11 h-11 rounded-xl bg-cream-100 border border-cream-300 flex items-center justify-center text-[#863BFF] shadow-[0_0_20px_rgba(134,59,255,0.16)] mb-6">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="font-serif text-xl text-ink mb-2">{f.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{f.body}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      <div className="divider" />

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-16 scroll-mt-20">
        <div className="flex items-baseline justify-between mb-10">
          <p className="label">How it works</p>
          <p className="label text-stone-500">Built with you</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div
                key={s.title}
                custom={i}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-xs text-stone-400">0{i + 1}</span>
                  <span className="text-[#863BFF]">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                </div>
                <h3 className="font-serif text-xl text-ink mb-2">{s.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{s.body}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      <div className="divider" />

      {/* Proof + Ardorio AI cross-link */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="bg-cream-200 rounded-2xl p-10 lg:p-14"
        >
          <div className="flex items-center gap-3 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="label">In production</span>
          </div>
          <p className="font-serif text-2xl sm:text-3xl text-ink leading-snug max-w-3xl">
            We built a premium Melbourne real estate firm an AI-native layer over their CRM, drafting in their voice, answering from their own knowledge, and surfacing opportunities their team would have missed by hand.
          </p>
          <p className="text-stone-600 leading-relaxed mt-6 max-w-2xl">
            The same AI that powers a custom CRM is available ready-made as{' '}
            <Link to="/ardorio-ai" className="text-ink underline underline-offset-4 hover:text-stone-600 transition-colors">
              Ardorio AI
            </Link>
            , our product. Start with the product, or have us build the whole system around you.
          </p>
        </motion.div>
      </section>

      <div className="divider" />

      {/* CTA */}
      <section className="relative overflow-hidden max-w-6xl mx-auto px-6 py-20">
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
          <div
            className="absolute right-[10%] top-1/2 -translate-y-1/2 w-[520px] max-w-full h-[300px] rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(134,59,255,0.12) 0%, rgba(71,191,255,0.05) 50%, transparent 72%)',
              filter: 'blur(46px)',
            }}
          />
        </div>
        <div className="relative z-[1] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-serif text-3xl sm:text-4xl text-ink">
              Own your CRM.
            </h2>
            <p className="text-stone-600 mt-2">
              Tell us what you run on today, and we'll show you what to replace it with.
            </p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Book a call
          </Link>
        </div>
      </section>
    </div>
  )
}
