import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import SEO from '../../components/SEO'

const scope = [
  'Product strategy and positioning',
  'Full-stack web application',
  'Scheduling and auto-fill engine',
  'Shift marketplace and swap workflow',
  'GPS time & attendance',
  'Payroll export',
  'iOS & Android mobile apps',
  'Stripe billing integration',
  'Go-to-market and launch',
]

const outcomes = [
  { value: '0 → 1', label: 'Full build' },
  { value: '2 plans', label: 'Monetisation' },
  { value: 'iOS + Android', label: 'Mobile apps' },
  { value: 'Live', label: 'rosterio.app' },
]

const productFeatures = [
  {
    index: '01',
    title: 'Roster management without the spreadsheet',
    body: `Most shift businesses still build rosters in Excel, or worse, a whiteboard. Rosterio replaces that with a drag-and-drop scheduler that shows your labour cost in real time as you add shifts, lets you save recurring schedules as templates, and publishes to the whole team in one click. Multi-location support is built in from the start, not bolted on later.`,
  },
  {
    index: '02',
    title: 'Auto-fill that actually thinks',
    body: `The auto-fill engine assigns staff to unfilled shifts in under a second. It considers role eligibility, declared availability, weekly hour balance across the team, and cost, so the roster it generates isn't just filled, it's fair and within budget. Managers review the result, make any tweaks, and publish. A full week's roster that used to take an hour takes five minutes.`,
  },
  {
    index: '03',
    title: 'A marketplace for open shifts',
    body: `When a shift can't be covered, managers post it to the marketplace. Staff browse open shifts from the mobile app and claim the ones they want, with no group chat required. The manager gets a one-tap approval notification. The shift fills. No back-and-forth. Rosterio keeps a full audit trail of every claim and approval in case payroll or compliance ever needs it.`,
  },
  {
    index: '04',
    title: 'GPS clock-in that closes the payroll loop',
    body: `Staff clock in and out from the mobile app. GPS verification confirms they're on-site without requiring a dedicated hardware terminal. Timesheets auto-generate from the clock records and go to managers for approval before export. The result is payroll data that flows directly from the roster, with fewer errors, less manual reconciliation, and a CSV that any payroll provider can import.`,
  },
]

const engineDetails = [
  {
    index: '01',
    title: 'Constraint satisfaction in a single pass',
    body: `The auto-fill engine doesn't brute-force combinations. It scores each candidate against every open shift using a weighted function of role match, availability, hours already scheduled, and hourly cost, then assigns greedily in a single pass ordered by constraint tightness. Shifts with fewer eligible staff are filled first, so the engine doesn't paint itself into a corner. It runs in under a second on a full week's roster regardless of team size.`,
  },
  {
    index: '02',
    title: 'Fairness as a first-class constraint',
    body: `Hour balance across the team isn't an afterthought. Each candidate's hours-so-far are factored directly into the assignment score, with configurable weighting. The engine tends to distribute shifts equitably without needing a separate rebalancing pass. Managers who care about fairness get it by default; managers who care about cost can dial the cost weight up and the fairness weight down.`,
  },
  {
    index: '03',
    title: 'Real-time labour cost in the scheduler',
    body: `As a manager adds or moves shifts, the estimated labour cost updates immediately, before they publish. The figure accounts for each staff member's hourly rate and the hours assigned that week. Managers see the cost consequence of every scheduling decision in real time, which means fewer "wait, how much?" moments when payroll runs.`,
  },
]

export default function RosterioCaseStudy() {
  return (
    <div className="pt-14">
      <SEO
        title="Rosterio | Workforce Management Platform Case Study"
        description="How Ardorio built Rosterio, a full-stack workforce operating system for shift-based businesses, from scheduling and auto-fill to GPS attendance and payroll export."
        canonical="/work/rosterio"
        type="article"
      />
      <div className="divider" />

      {/* Back */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <Link to="/work" className="btn-ghost text-xs inline-flex items-center gap-1.5">
          <ArrowLeft size={12} /> All work
        </Link>
      </div>

      {/* Header */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 right-0 w-[36rem] h-[36rem]"
          style={{
            background:
              'radial-gradient(circle at 60% 45%, rgba(134,59,255,0.14), rgba(71,191,255,0.10) 42%, transparent 70%)',
            filter: 'blur(32px)',
          }}
        />
      <div className="relative max-w-6xl mx-auto px-6 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="label">Live · rosterio.app</span>
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              Rosterio
            </h1>
            <p className="text-stone-500 text-sm mt-2">
              Workforce operating system for shift-based businesses
            </p>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-4">
            <p className="text-stone-600 leading-relaxed">
              We built Rosterio from the ground up, across strategy, product, engineering, and launch. Scheduling, attendance, payroll, mobile. One platform for every part of running a shift team.
            </p>
            <a
              href="https://rosterio.app"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost self-start"
            >
              Visit site <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </div>
      </div>

      <div className="divider" />

      {/* Outcome stats */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {outcomes.map((stat) => (
            <div key={stat.label} className="p-6 bg-cream-200 rounded-2xl">
              <div className="font-serif text-2xl" style={{ color: '#863BFF' }}>{stat.value}</div>
              <div className="label mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="divider" />

      {/* What it is */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <p className="label mb-4">The product</p>
            <h2 className="font-serif text-3xl text-ink">
              Shift management,<br />
              <em>end to end.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 space-y-5 text-stone-700 leading-relaxed">
            <p>
              Rosterio is a workforce operating system for businesses that run on shifts, like hospitality, retail, healthcare, and venues. The kind of businesses where the roster is built on a Sunday, half the team messages in sick on Wednesday, and payroll is reconciled by hand on Friday afternoon.
            </p>
            <p>
              The platform covers the full lifecycle: scheduling, publishing, auto-filling gaps, handling swap requests, tracking attendance with GPS clock-in, and exporting timesheets straight to payroll. Staff get a mobile app on iOS and Android that keeps them across their schedule without needing to check a group chat.
            </p>
            <p>
              We built it from the ground up, across product strategy, full-stack application, scheduling engine, mobile, billing, and launch. The founders had the industry knowledge. We built everything around it.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Product features */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="label mb-4">What managers get</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              From roster to payroll,<br />
              <em>without the friction.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              Every feature in Rosterio was built around a specific frustration that managers of shift-based teams deal with every week. Less time in a spreadsheet, fewer messages, no payroll surprises.
            </p>
          </div>
        </div>

        <div>
          {productFeatures.map((item, i) => (
            <motion.div
              key={item.index}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="py-8 border-b border-cream-300 grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              <div className="lg:col-span-4 flex items-start gap-4">
                <span className="label shrink-0 pt-0.5 w-6" style={{ color: '#863BFF' }}>{item.index}</span>
                <h3 className="font-serif text-xl text-ink">{item.title}</h3>
              </div>
              <p className="lg:col-span-8 text-stone-600 leading-relaxed text-sm">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="divider" />

      {/* Scheduling engine section */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="label mb-4">Scheduling engine</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              Auto-fill that runs<br />
              <em>in under a second.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              The auto-fill engine isn't a random assignment. It's a constraint-aware scheduler that considers roles, availability, cost, and fairness simultaneously, and shows the cost impact of every decision before the roster goes out.
            </p>
          </div>
        </div>

        <div>
          {engineDetails.map((item, i) => (
            <motion.div
              key={item.index}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="py-8 border-b border-cream-300 grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              <div className="lg:col-span-4 flex items-start gap-4">
                <span className="label shrink-0 pt-0.5 w-6" style={{ color: '#863BFF' }}>{item.index}</span>
                <h3 className="font-serif text-xl text-ink">{item.title}</h3>
              </div>
              <p className="lg:col-span-8 text-stone-600 leading-relaxed text-sm">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="divider" />

      {/* What we built */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <p className="label mb-4">Scope</p>
            <h2 className="font-serif text-3xl text-ink">Everything,<br /><em>end to end.</em></h2>
            <p className="text-stone-500 text-sm mt-4 leading-relaxed">
              One team that owned product, engineering, and launch.
            </p>
          </div>
          <div className="lg:col-span-7">
            <ul className="space-y-3">
              {scope.map((item) => (
                <li key={item} className="flex items-start gap-3 text-stone-700 text-sm py-2 border-b border-cream-200">
                  <span className="font-mono text-stone-400 shrink-0 mt-0.5">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* How it works callout */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-cream-200 rounded-2xl p-10 lg:p-14"
        >
          <p className="label mb-6">How it works</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h2 className="font-serif text-3xl text-ink mb-5">
                From roster to payroll<br />in one place.
              </h2>
              <p className="text-stone-600 leading-relaxed text-sm mb-5">
                The workflow follows the real cadence of a shift business. Build the roster, publish it, handle the week's changes as they happen, then close out with timesheets that are already approved and ready to export.
              </p>
              <p className="text-stone-600 leading-relaxed text-sm">
                Staff interact through the mobile app, viewing their schedule, picking up open shifts, requesting swaps, and clocking in. Everything flows back to the manager view without a message being sent.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { step: '01', label: 'Build the roster', detail: 'Drag, drop, or let auto-fill handle it in one click' },
                { step: '02', label: 'Publish to the team', detail: 'Staff get notified instantly on mobile' },
                { step: '03', label: 'Manage the week', detail: 'Approve swaps and open-shift claims as they come in' },
                { step: '04', label: 'Track attendance', detail: 'GPS clock-in generates timesheets automatically' },
                { step: '05', label: 'Export to payroll', detail: 'Approved timesheets export as CSV to any provider' },
              ].map((row) => (
                <div key={row.step} className="flex items-start gap-4 p-4 bg-cream-100/70 rounded-xl">
                  <span className="label shrink-0 pt-0.5" style={{ color: '#863BFF' }}>{row.step}</span>
                  <div>
                    <p className="text-sm font-medium text-ink">{row.label}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{row.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="divider" />

      {/* Testimonial */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="p-8 bg-cream-200 rounded-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <p className="font-serif text-3xl text-cream-400 leading-none mb-3 select-none">"</p>
              <p className="text-stone-500 italic leading-relaxed">
                We're putting together a full testimonial with the Rosterio founder. It will live here shortly.
              </p>
            </div>
            <div className="lg:col-span-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cream-300 flex items-center justify-center shrink-0">
                <span className="font-mono text-xs text-stone-600">RO</span>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-800">Rosterio Founder</p>
                <a
                  href="https://rosterio.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-stone-500 hover:text-ink transition-colors"
                >
                  rosterio.app ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Footer CTA */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-serif text-2xl text-ink">Got something to build?</h2>
            <p className="text-stone-600 mt-1 text-sm">We respond within 24 hours.</p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Get in touch
          </Link>
        </div>
      </div>
    </div>
  )
}
