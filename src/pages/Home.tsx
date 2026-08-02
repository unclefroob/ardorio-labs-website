import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion, type Variants, type Easing } from 'framer-motion'
import { ArrowUpRight, Workflow, GraduationCap } from 'lucide-react'
import SEO from '../components/SEO'
import GlowMark from '../components/GlowMark'
import Sparkles, { type Spark, SPARK_COLORS } from '../components/Sparkles'
import HomeNewsroom from '../components/HomeNewsroom'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

// The hero leads on the two flagships (AI that works, systems you own), with the
// efficiency payoff underneath. Plain and direct, one word emphasised per line.
const heroHeadlines = [
  // Flagship promise — AI that works, in systems you own
  <>
    <span className="block">AI that does the work,</span>
    <span className="block">in systems you <em>own</em>.</span>
  </>,
  // Own vs rent — the CRM angle
  <>
    <span className="block">Own your CRM,</span>
    <span className="block"><em>don't</em> rent it.</span>
  </>,
  // Efficiency payoff
  <>
    <span className="block">Less manual work,</span>
    <span className="block"><em>more</em> output.</span>
  </>,
]

const services = [
  {
    icon: Workflow,
    title: 'Custom builds you own',
    short: 'applied-ai',
    description: 'We build custom, AI-native systems that do your team\'s manual work, from internal tools to full AI-native CRMs, in place of the SaaS you rent.',
    tags: ['AI-native CRMs', 'Internal tools', 'Workflow automation', 'Integrations'],
  },
  {
    icon: GraduationCap,
    title: 'AI Training & Enablement',
    short: 'training',
    description: 'We get your team through their real work faster with AI, with hands-on workshops and the guardrails to use it safely.',
    tags: ['ChatGPT', 'Copilot', 'Claude', 'Building agents'],
  },
]

// Sparkles for the Ardorio AI product band, clustered toward its right glow.
const aiSparks: Spark[] = [
  { x: '86%', y: '24%', size: 5, color: SPARK_COLORS.purple, delay: 0, duration: 6 },
  { x: '94%', y: '58%', size: 3, color: SPARK_COLORS.cyan, delay: 0.6, duration: 5.4 },
  { x: '78%', y: '82%', size: 4, color: SPARK_COLORS.lilac, delay: 1.1, duration: 6.6 },
]

// A sparse cluster drifting near the closing call-to-action.
const ctaSparks: Spark[] = [
  { x: '80%', y: '28%', size: 5, color: SPARK_COLORS.purple, delay: 0, duration: 6 },
  { x: '92%', y: '62%', size: 3, color: SPARK_COLORS.cyan, delay: 0.7, duration: 5.5 },
  { x: '70%', y: '80%', size: 4, color: SPARK_COLORS.lilac, delay: 1.2, duration: 6.8 },
]

// The two flagship pushes, shown as prominent bands high on the page.
const flagships = [
  {
    kicker: 'Our product · Ardorio AI',
    to: '/ardorio-ai',
    cta: 'Explore Ardorio AI',
    headline: (
      <>
        An AI layer for
        <br /> your <em>business.</em>
      </>
    ),
    blurb:
      'The AI layer we build for clients, made a product. It answers from your own knowledge, drafts in your voice, and does the repetitive work your team does by hand.',
    tags: ['AI Brain', 'Assistant', 'Pipelines', 'CRM intelligence'],
    sparks: aiSparks,
  },
  {
    kicker: 'Custom build · AI-native CRMs',
    to: '/ai-native-crm',
    cta: 'Explore AI-native CRMs',
    headline: (
      <>
        A CRM built for you,
        <br /> <em>AI-native.</em>
      </>
    ),
    blurb:
      'Custom CRMs with AI at the core, built around how your business works and owned by you, in place of the SaaS you rent by the seat.',
    tags: ['Built for you', 'You own it', 'Replaces SaaS', 'AI at the core'],
    sparks: ctaSparks,
  },
]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: EASE },
  }),
}

const drawIn: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  show: { scaleX: 1, opacity: 1, transition: { duration: 0.7, ease: EASE } },
}

function AnimatedDivider() {
  return (
    <motion.div
      className="divider origin-left"
      variants={drawIn}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    />
  )
}

export default function Home() {
  const reduce = useReducedMotion()
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (reduce) return
    const timer = setInterval(
      () => setIdx((i) => (i + 1) % heroHeadlines.length),
      5200,
    )
    return () => clearInterval(timer)
  }, [reduce])

  return (
    <div>
      <SEO
        title="AI-Native CRMs & AI Layers for Australian Business"
        description="Ardorio builds AI that does your team's manual work, in systems you own instead of rent. Custom AI-native CRMs, and Ardorio AI, our ready-made AI layer, set up for you and tuned to how your business works."
        canonical="/"
      />
      {/* Hero */}
      <section className="grain relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="relative z-[1] max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12 items-center">
            {/* Heading + intro */}
            <div className="lg:col-span-7">
              <div className="min-h-[7rem] sm:min-h-[9rem] lg:min-h-[10rem]">
                <AnimatePresence mode="wait">
                  <motion.h1
                    key={idx}
                    className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] text-ink"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={{ duration: 0.5, ease: EASE }}
                  >
                    {heroHeadlines[idx]}
                  </motion.h1>
                </AnimatePresence>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.6, ease: EASE }}
              >
                <p className="text-stone-600 text-lg leading-relaxed mt-8 mb-8 max-w-lg">
                  We build AI that does your team's manual work, in systems you own instead of rent. Custom AI-native CRMs, and Ardorio AI, our ready-made AI layer. Set up for you, and tuned to how your business actually works.
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Link to="/contact" className="btn-primary">
                    Start a conversation
                  </Link>
                  <Link to="/ardorio-ai" className="btn-ghost">
                    Ardorio AI <ArrowUpRight size={14} />
                  </Link>
                  <Link to="/ai-native-crm" className="btn-ghost">
                    AI-native CRMs <ArrowUpRight size={14} />
                  </Link>
                </div>
              </motion.div>
            </div>

            {/* Glowing mark */}
            <motion.div
              className="lg:col-span-5 hidden lg:flex items-center justify-center relative"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35, duration: 0.9, ease: EASE }}
            >
              <GlowMark size={340} />
              {/* Floating accent dots */}
              {!reduce && (
                <>
                  <motion.span
                    className="absolute rounded-full"
                    style={{ width: 6, height: 6, background: '#47BFFF', top: '18%', left: '22%', boxShadow: '0 0 12px 3px rgba(71,191,255,0.4)' }}
                    animate={{ y: [0, -10, 0], opacity: [0.55, 0.85, 0.55] }}
                    transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
                  />
                  <motion.span
                    className="absolute rounded-full"
                    style={{ width: 4, height: 4, background: '#863BFF', bottom: '22%', left: '30%', boxShadow: '0 0 10px 2px rgba(134,59,255,0.4)' }}
                    animate={{ y: [0, 12, 0], opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 6.5, ease: 'easeInOut', repeat: Infinity, delay: 0.6 }}
                  />
                  <motion.span
                    className="absolute rounded-full"
                    style={{ width: 3, height: 3, background: '#EDE6FF', top: '34%', right: '26%' }}
                    animate={{ y: [0, -8, 0], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 5.5, ease: 'easeInOut', repeat: Infinity, delay: 1.1 }}
                  />
                </>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <div className="divider" />
      <section className="max-w-6xl mx-auto px-6 py-9">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-12"
        >
          <p className="label shrink-0 text-stone-500">Trusted by</p>
          <div className="flex items-center gap-x-10 gap-y-5 flex-wrap text-stone-600">
            <img
              src="/clients/ritchies.svg"
              alt="Ritchies IGA + Liquor"
              className="h-5 w-auto"
            />
            <span className="flex items-center gap-2" aria-label="PathIQ">
              <img src="/clients/pathiq-mark.png" alt="" className="h-7 w-auto" />
              <span className="font-sans font-bold text-2xl tracking-tight leading-none">
                PathIQ
              </span>
            </span>
          </div>
        </motion.div>
      </section>

      {/* Divider */}
      <AnimatedDivider />

      {/* Flagships — Ardorio AI + AI-native CRMs */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <p className="label mb-10">What we lead with</p>
        <div className="space-y-6">
          {flagships.map((f) => (
            <motion.div
              key={f.to}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, ease: EASE }}
              className="relative overflow-hidden rounded-2xl bg-cream-200"
            >
              <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
                <div
                  className="absolute right-[-4%] top-1/2 -translate-y-1/2 w-[560px] max-w-full h-[400px] rounded-full"
                  style={{
                    background:
                      'radial-gradient(ellipse at center, rgba(134,59,255,0.14) 0%, rgba(71,191,255,0.06) 48%, transparent 72%)',
                    filter: 'blur(50px)',
                  }}
                />
              </div>
              <Sparkles sparks={f.sparks} className="z-0" />
              <div className="relative z-[1] p-10 lg:p-14">
                <p className="label mb-5">{f.kicker}</p>
                <h2 className="font-serif text-4xl sm:text-5xl text-ink leading-tight">
                  {f.headline}
                </h2>
                <p className="text-stone-600 leading-relaxed mt-6 max-w-xl">
                  {f.blurb}
                </p>
                <div className="flex flex-wrap gap-2 mt-7">
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-1 bg-cream-100 rounded-full text-xs font-mono text-stone-600 border border-cream-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link to={f.to} className="btn-primary">
                    {f.cta}
                  </Link>
                  <Link to="/contact" className="btn-ghost">
                    Book a demo <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <AnimatedDivider />

      {/* Services — editorial list */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        {/* Ambient purple glow behind the cards */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-full h-[380px] rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(134,59,255,0.10) 0%, rgba(71,191,255,0.05) 45%, transparent 70%)',
              filter: 'blur(50px)',
            }}
          />
        </div>
        <Sparkles className="z-0" />
        <div className="relative z-[1] flex items-center justify-between mb-10">
          <p className="label">What we do</p>
          <Link to="/services" className="btn-ghost text-xs">
            All services <ArrowUpRight size={12} />
          </Link>
        </div>

        <div className="relative z-[1] grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service, i) => {
            const Icon = service.icon
            return (
              <motion.div
                key={service.short}
                custom={i}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
              >
                <Link
                  to={`/services/${service.short}`}
                  className="group h-full flex flex-col bg-cream-200 rounded-2xl p-8 hover:bg-cream-300/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-6">
                    <span className="w-11 h-11 rounded-xl bg-cream-100 border border-cream-300 flex items-center justify-center text-[#863BFF] shadow-[0_0_20px_rgba(134,59,255,0.18)] group-hover:shadow-[0_0_30px_rgba(134,59,255,0.38)] group-hover:scale-105 transition-all duration-300">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <ArrowUpRight
                      size={18}
                      className="text-stone-400 group-hover:text-[#863BFF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                    />
                  </div>
                  <h3 className="font-serif text-2xl text-ink mb-2 group-hover:text-[#863BFF] transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-stone-600 text-sm leading-relaxed mb-6 flex-1">
                    {service.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {service.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 bg-cream-100 rounded-full text-xs font-mono text-stone-600 border border-cream-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Divider */}
      <AnimatedDivider />

      {/* Latest newsroom entry */}
      <HomeNewsroom />

      {/* Divider */}
      <AnimatedDivider />

      {/* Featured work — PathIQ */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <p className="label">Featured work</p>
          <Link to="/work" className="btn-ghost text-xs">
            All projects <ArrowUpRight size={12} />
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-cream-200 rounded-2xl overflow-hidden"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Content */}
            <div className="p-10 lg:p-14 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-8">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="label">Live · pathiq.com.au</span>
                </div>
                <h2 className="font-serif text-4xl text-ink mb-4">PathIQ</h2>
                <p className="text-stone-600 leading-relaxed mb-8">
                  Career navigation platform built from scratch, where AI does work that would otherwise need a team of advisors. We owned the full product, from architecture and design through to the AI recommendation engine that matches people to paths in seconds, first commit to launch.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Product Strategy', 'Full-Stack', 'AI Features', 'Launch'].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-cream-300 rounded-full text-xs font-mono text-stone-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-10">
                <Link to="/work/pathiq" className="btn-primary">
                  Read case study
                </Link>
              </div>
            </div>

            {/* Testimonial block */}
            <div className="p-10 lg:p-14 border-t lg:border-t-0 lg:border-l border-cream-300 flex flex-col justify-center bg-cream-100/50">
              <p className="font-serif text-5xl text-cream-400 leading-none mb-4 select-none">"</p>
              <p className="text-stone-700 italic leading-relaxed text-sm mb-8">
                Working with Ryan and Jansen from Ardorio has been a game changer for bringing PathIQ to life. From day one, they've gone above and beyond, not just executing on ideas, but genuinely investing in the vision behind PathIQ. Their ability to translate concepts into practical, scalable solutions has been outstanding, and they've consistently delivered with speed, clarity, and professionalism.
              </p>
              <div className="flex items-center gap-3 pt-6 border-t border-cream-300">
                <div className="w-9 h-9 rounded-full bg-cream-300 flex items-center justify-center">
                  <span className="font-mono text-xs text-stone-600">PQ</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Calum Batey</p>
                  <p className="text-xs text-stone-500">Founder, PathIQ</p>
                  <a
                    href="https://pathiq.com.au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-stone-500 hover:text-ink transition-colors"
                  >
                    pathiq.com.au
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Divider */}
      <AnimatedDivider />

      {/* Bottom CTA — minimal strip */}
      <section className="relative overflow-hidden max-w-6xl mx-auto px-6 py-20">
        {/* Ambient purple glow behind the CTA */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
          <div
            className="absolute right-[8%] top-1/2 -translate-y-1/2 w-[520px] max-w-full h-[300px] rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(134,59,255,0.12) 0%, rgba(71,191,255,0.05) 50%, transparent 72%)',
              filter: 'blur(46px)',
            }}
          />
        </div>
        <Sparkles sparks={ctaSparks} className="z-0" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative z-[1] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
        >
          <div>
            <h2 className="font-serif text-3xl text-ink">Got something to build?</h2>
            <p className="text-stone-600 mt-1">We respond within 24 hours.</p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Get in touch
          </Link>
        </motion.div>
      </section>
    </div>
  )
}
