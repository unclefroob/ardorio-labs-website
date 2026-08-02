import { Link } from 'react-router-dom'
import { motion, useReducedMotion, type Variants, type Easing } from 'framer-motion'
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  PenTool,
  Network,
  Workflow,
  Gauge,
  Search,
  SlidersHorizontal,
  Users,
  LineChart,
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

interface Capability {
  icon: LucideIcon
  title: string
  body: string
}

const capabilities: Capability[] = [
  {
    icon: BookOpen,
    title: 'AI Brain',
    body: 'Answers drawn from your own knowledge, with citations back to the source. Your team asks in plain language and gets the right answer, not a guess.',
  },
  {
    icon: Bot,
    title: 'Assistant',
    body: 'A conversational assistant that works across your tools and takes real actions, inside clear guardrails you set.',
  },
  {
    icon: PenTool,
    title: 'Drafting in your voice',
    body: 'Emails, documents, and content written the way your business writes them, so the first draft is already most of the way there.',
  },
  {
    icon: Network,
    title: 'CRM intelligence',
    body: 'Reads your CRM and surfaces the opportunities hiding in it, the follow-ups and matches your team would miss by hand.',
  },
  {
    icon: Workflow,
    title: 'Pipelines',
    body: 'No-code automations that pull the information, generate the work, and push it back to your systems, running on their own.',
  },
  {
    icon: Gauge,
    title: 'Work done, in plain terms',
    body: 'A dashboard showing exactly what the AI handled this month, measured as work done rather than tokens or jargon.',
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
    title: 'We learn your business',
    body: 'We start by taking in your content, your tone, and the way you actually work, so the layer is yours from day one.',
  },
  {
    icon: SlidersHorizontal,
    title: 'We tune it to you',
    body: 'We shape the AI Brain and the assistant around your knowledge and process, and set the guardrails for safe use.',
  },
  {
    icon: Users,
    title: 'Your team uses it',
    body: 'It sits alongside the tools your team already has. No rip-and-replace, and no long rollout to get value.',
  },
  {
    icon: LineChart,
    title: 'You see the work done',
    body: 'You get a clear view of what the AI handled each month, and we keep refining it with you as you go.',
  },
]

export default function ArdorioAI() {
  const reduce = useReducedMotion()

  return (
    <div className="pt-14">
      <SEO
        title="Ardorio AI | An AI layer for your business"
        description="Ardorio AI is an AI layer over the tools you already use. It answers from your own knowledge, drafts in your voice, and does your team's repetitive work."
        canonical="/ardorio-ai"
        ogImage="/og-ardorio-ai.png"
      />
      <div className="divider" />

      {/* Hero */}
      <section className="grain relative overflow-hidden py-16 sm:py-20">
        <div className="relative z-[1] max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12 items-center">
            <div className="lg:col-span-7">
              <p className="label mb-6">Ardorio AI</p>
              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] text-ink">
                An AI layer for
                <br />
                your <em>business.</em>
              </h1>
              <p className="text-stone-600 text-lg leading-relaxed mt-8 mb-8 max-w-lg">
                Ardorio AI sits on top of the tools and data you already use. It answers from your own knowledge, drafts in your voice, and does the repetitive work your team does by hand. We set it up for you, tuned to how your business actually works.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/contact" className="btn-primary">
                  Book a demo
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

      {/* What it is */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4">
            <p className="label">The idea</p>
          </div>
          <div className="lg:col-span-8">
            <p className="font-serif text-2xl sm:text-3xl text-ink leading-snug">
              Most businesses don't need to replace their systems. They need an AI layer on top that does the work.
            </p>
            <p className="text-stone-600 leading-relaxed mt-6 max-w-2xl">
              Ardorio AI is that layer. Rather than another subscription bolted onto the pile, it is a system built around your knowledge and your process, that your team owns the value of. It is the same AI layer we build custom for clients, made repeatable so you can adopt it rather than commission it.
            </p>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Capabilities */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 w-[820px] max-w-full h-[420px] rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(134,59,255,0.08) 0%, rgba(71,191,255,0.04) 48%, transparent 72%)',
              filter: 'blur(54px)',
            }}
          />
        </div>
        <div className="relative z-[1] mb-10">
          <p className="label">What it does</p>
        </div>
        <div className="relative z-[1] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((c, i) => {
            const Icon = c.icon
            return (
              <motion.div
                key={c.title}
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
                <h3 className="font-serif text-xl text-ink mb-2">{c.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{c.body}</p>
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
          <p className="label text-stone-500">Done for you</p>
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
                  <span className="font-mono text-xs text-stone-400">
                    0{i + 1}
                  </span>
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

      {/* Proof — Buxton */}
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
            Ardorio AI runs today at a premium Melbourne real estate firm, drafting in their voice, answering from their own knowledge, and surfacing opportunities across their CRM.
          </p>
          <p className="text-stone-600 leading-relaxed mt-6 max-w-2xl">
            We built the layer around how they actually work, ingested their content and tone, and set it live for their agents and support staff. They are the first firm running on Ardorio AI, with more onboarding now.
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
              See it on your business.
            </h2>
            <p className="text-stone-600 mt-2">
              We'll show you the AI layer running on work like yours.
            </p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Book a demo
          </Link>
        </div>
      </section>
    </div>
  )
}
