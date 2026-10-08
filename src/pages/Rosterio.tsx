import { Link } from 'react-router-dom'
import { motion, type Variants, type Easing } from 'framer-motion'
import {
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  Clock,
  FileCheck2,
  Layers,
  Plane,
  Quote,
  ScanSearch,
  ShieldCheck,
  Sparkles as SparklesIcon,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import SEO from '../components/SEO'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: EASE },
  }),
}

const ROSTERIO_URL = 'https://rosterio.app'

// The compliance story is deliberately framed as Rosterio applying the
// customer's own rules. The customer owns its reading of the award and its IR
// compliance; Rosterio mirrors the Commission's data and provides the tooling.
interface Pillar {
  icon: LucideIcon
  title: string
  body: string
}

const compliancePillars: Pillar[] = [
  {
    icon: BookOpen,
    title: 'The Commission\'s data, untouched',
    body: 'Rates and award data come straight from the Fair Work Commission\'s published pay database, kept one row to one row and refreshed when it changes. Nobody re-types a penalty rate into a spreadsheet.',
  },
  {
    icon: Layers,
    title: 'Your reading, kept separate',
    body: 'Where an award leaves room for interpretation, or an enterprise agreement varies it, your team records the decision as a rule on your own version of the award. The base award stays intact and keeps receiving the annual wage review.',
  },
  {
    icon: Quote,
    title: 'Every figure cites its clause',
    body: 'Each priced segment of a shift and each roster check points back to the clause behind it. When payroll, an auditor or an employee asks why, the answer is already on the page.',
  },
  {
    icon: ScanSearch,
    title: 'No false passes',
    body: 'A check that wasn\'t given enough information says so rather than passing. A provisional answer is never dressed up as a clean one.',
  },
]

const checks = [
  { rule: 'Minimum engagement', clause: 'cl 10.9', status: 'pass' as const },
  { rule: '12 hours between shifts', clause: 'cl 16.6', status: 'breach' as const },
  { rule: 'Break placement', clause: 'cl 16.5', status: 'unevaluated' as const },
]

const statusStyle = {
  pass: 'bg-green-500/10 text-green-700 border-green-600/20',
  breach: 'bg-red-500/10 text-red-700 border-red-600/20',
  unevaluated: 'bg-stone-500/10 text-stone-600 border-stone-500/20',
}

const platform: Pillar[] = [
  {
    icon: CalendarRange,
    title: 'Rostering',
    body: 'Build a week in one click with Magic Fill, which fills every shift with balanced hours at the lowest compliant cost. Templates and multi-location built in.',
  },
  {
    icon: ShieldCheck,
    title: 'Checked before publishing',
    body: 'Rosters are checked against your rules while they\'re still a draft, so a breach is fixed on the screen instead of found in a back-pay claim.',
  },
  {
    icon: Clock,
    title: 'Time & attendance',
    body: 'GPS-verified clock in and out from the staff app or a kiosk, flowing into timesheets managers approve.',
  },
  {
    icon: Plane,
    title: 'Leave',
    body: 'Accruals and balances from a ledger. Approved leave blocks rostering across the whole platform, with any override recorded.',
  },
  {
    icon: Wallet,
    title: 'Payroll export',
    body: 'Approved, priced timesheets export to your payroll provider, with nothing re-keyed between the floor and the pay run.',
  },
  {
    icon: SparklesIcon,
    title: 'AI on top',
    body: 'A compliance copilot and award chat that answer questions about your rules in plain language, switched on per user.',
  },
]

const enterprise = [
  {
    title: 'Deploy in your own cloud',
    body: 'Rosterio can run inside your own cloud tenancy, with your IT team holding the infrastructure, backups and data location while we deploy and support the application.',
  },
  {
    title: 'Your rules, set up with you',
    body: 'We configure the award and agreement rules with your payroll and IR people during onboarding. Your admins maintain them from there with the rules tools.',
  },
  {
    title: 'Migration from what you run today',
    body: 'We bring across staff, history and timesheets from your current system, keeping the original records rather than only what mapped neatly.',
  },
  {
    title: 'Integrations and single sign-on',
    body: 'Payroll, HR and identity integrations scoped to your stack, delivered as part of implementation.',
  },
]

export default function Rosterio() {
  return (
    <div className="pt-14">
      <SEO
        title="Rosterio | Workforce management that applies your compliance rules"
        description="Rosterio is Ardorio's workforce platform for shift-based businesses. Rostering, time and attendance, leave and payroll export, with an award engine that applies your organisation's own compliance rules to every shift."
        canonical="/rosterio"
      />
      <div className="divider" />

      {/* Hero */}
      <section className="grain relative overflow-hidden py-16 sm:py-20">
        <div className="relative z-[1] max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12 items-center">
            <div className="lg:col-span-7">
              <p className="label mb-6">Our product · Rosterio</p>
              <h1 className="font-serif text-5xl sm:text-6xl leading-[1.05] text-ink">
                Your compliance rules, applied to <em>every shift.</em>
              </h1>
              <p className="text-stone-600 text-lg leading-relaxed mt-8 mb-8 max-w-lg">
                Rosterio is the workforce platform we build and run. Rostering, time and attendance, leave and payroll export for shift-based businesses, with an award engine that takes your organisation's reading of its awards and agreements and applies it the same way on every roster, before it goes out.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/contact" className="btn-primary">
                  Book an enterprise demo
                </Link>
                <a
                  href={ROSTERIO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  Visit rosterio.app <ArrowUpRight size={14} />
                </a>
              </div>
            </div>

            {/* Roster check, as a manager sees it */}
            <motion.div
              className="lg:col-span-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
            >
              <div className="relative">
                <div
                  className="absolute -inset-8 rounded-full pointer-events-none"
                  aria-hidden
                  style={{
                    background:
                      'radial-gradient(ellipse at center, rgba(134,59,255,0.16) 0%, rgba(71,191,255,0.07) 50%, transparent 72%)',
                    filter: 'blur(40px)',
                  }}
                />
                <div className="relative bg-cream-100 border border-cream-300 rounded-2xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="label">Draft roster · Sat</p>
                    <FileCheck2 size={16} className="text-[#863BFF]" />
                  </div>
                  <p className="font-serif text-xl text-ink">14:00 – 22:00</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    General Retail Industry Award · your version
                  </p>
                  <div className="mt-5 space-y-2">
                    {checks.map((c) => (
                      <div
                        key={c.rule}
                        className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-cream-200/70"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{c.rule}</p>
                          <p className="font-mono text-[11px] text-stone-500">{c.clause}</p>
                        </div>
                        <span
                          className={`shrink-0 font-mono text-[11px] px-2 py-0.5 rounded-full border ${statusStyle[c.status]}`}
                        >
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-stone-500 mt-4 leading-relaxed">
                    Break times weren't entered, so placement is reported as unevaluated rather than passed.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* The idea */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4">
            <p className="label">The idea</p>
          </div>
          <div className="lg:col-span-8">
            <p className="font-serif text-2xl sm:text-3xl text-ink leading-snug">
              You already know your obligations. The hard part is applying them the same way on every roster, at every site, every week.
            </p>
            <p className="text-stone-600 leading-relaxed mt-6 max-w-2xl">
              Rosterio is the technology that does that. Your organisation sets how its awards and agreements are read, and stays in charge of those decisions. Rosterio applies them consistently to every shift and shows the clause behind every result, so your people spend their time on the judgement calls rather than on checking spreadsheets.
            </p>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Compliance engine */}
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
        <div className="relative z-[1] mb-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-5">
            <p className="label mb-4">The award engine</p>
            <h2 className="font-serif text-3xl sm:text-4xl text-ink leading-tight">
              Two layers,
              <br />
              <em>kept apart.</em>
            </h2>
          </div>
          <p className="lg:col-span-7 text-stone-600 leading-relaxed">
            The Commission publishes what each hour is worth. It doesn't say what makes an hour a Saturday hour under your agreement. Rosterio keeps the published data and your reading of it in separate layers, so each can be checked on its own.
          </p>
        </div>
        <div className="relative z-[1] grid grid-cols-1 md:grid-cols-2 gap-6">
          {compliancePillars.map((c, i) => {
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

      {/* Platform */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-baseline justify-between mb-10">
          <p className="label">The platform</p>
          <p className="label text-stone-500">Web · iOS · Android</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
          {platform.map((p, i) => {
            const Icon = p.icon
            return (
              <motion.div
                key={p.title}
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
                <h3 className="font-serif text-xl text-ink mb-2">{p.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{p.body}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      <div className="divider" />

      {/* Enterprise */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <p className="label mb-4">For enterprise</p>
            <h2 className="font-serif text-3xl text-ink">
              Fits how your
              <br />
              <em>organisation runs.</em>
            </h2>
            <p className="text-stone-500 text-sm mt-4 leading-relaxed">
              Smaller teams can start on their own at rosterio.app. Larger organisations get an implementation shaped around them.
            </p>
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
            {enterprise.map((e, i) => (
              <motion.div
                key={e.title}
                custom={i}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
                className="border-t border-cream-300 pt-5"
              >
                <h3 className="font-serif text-lg text-ink mb-2">{e.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{e.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Product vs custom */}
      <section className="max-w-6xl mx-auto px-6 py-14">
        <div className="bg-cream-200 rounded-2xl p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8">
            <p className="label mb-3">Built by Ardorio</p>
            <p className="text-stone-700 leading-relaxed">
              Rosterio is the off-the-shelf product, built by the same team that builds custom systems for clients. If your workforce process doesn't fit a product, we can build one around it that you own.
            </p>
          </div>
          <div className="lg:col-span-4 flex flex-wrap lg:justify-end gap-3">
            <Link to="/work/rosterio" className="btn-ghost">
              How we built it <ArrowUpRight size={14} />
            </Link>
            <Link to="/ai-native-crm" className="btn-ghost">
              Custom builds <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
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
              See your rules running on a real roster.
            </h2>
            <p className="text-stone-600 mt-2">
              We'll set up a demo against the award or agreement you work under.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link to="/contact" className="btn-primary">
              Book an enterprise demo
            </Link>
            <a
              href={ROSTERIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              Start a free trial <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
