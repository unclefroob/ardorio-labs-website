import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import SEO from '../../components/SEO'

const scope = [
  'Product strategy and positioning',
  'Full-stack Next.js application',
  'AI breakdown engine',
  'Authentication and user management',
  'Team collaboration features',
  'Usage metering and subscription tiers',
  'Landing page and go-to-market',
]

const outcomes = [
  { value: '0 → 1', label: 'Full build' },
  { value: '3 tiers', label: 'Monetisation' },
  { value: 'Any role', label: 'Personalised' },
  { value: 'Live', label: 'On time' },
]

const productFeatures = [
  {
    index: '01',
    title: 'Breakdown for your role, not anyone\'s role',
    body: `Paste any task — a Jira ticket, a client brief, a job on-site — and Clevedon returns a structured plan tailored to who you actually are. It accounts for your role, your experience level, and your professional background, then generates steps using the vocabulary and domain knowledge that make sense for that context. A plumber gets different steps than a product manager, even for the same brief.`,
  },
  {
    index: '02',
    title: 'A tool that gets sharper the more you use it',
    body: `Every breakdown a Pro user runs contributes to a synthesised profile that Clevedon uses to calibrate future results. Over time, the tool builds a working model of the user's background, preferences, and recurring project types — and uses that context to generate more relevant plans without the user having to explain themselves every time. The learning is automatic.`,
  },
  {
    index: '03',
    title: 'Team task distribution that reflects actual skills',
    body: `When a team uses Clevedon together, task assignment isn't round-robin. The AI receives each team member's role, skills, and experience, then distributes subtasks with explicit reasoning — naming who gets what and why. Teams spend less time negotiating handoffs and more time executing.`,
  },
]

const aiDetails = [
  {
    index: '01',
    title: 'Domain vocabulary injection',
    body: `System prompts instruct Claude to use the terminology of the user's actual profession — not generic productivity language. A fencer gets steps that reference post holes and rail spacing. A plumber gets isolation valves and pressure testing. This vocabulary grounding is baked into the prompt at generation time, informed by the user's declared role and experience level, and produces plans that feel written by a colleague rather than a chatbot.`,
  },
  {
    index: '02',
    title: 'Automated profile synthesis from usage history',
    body: `Every fifth breakdown, Clevedon triggers a background synthesis pass over the user's recent history. Claude reads the accumulated task inputs and extracts a distilled professional context — domain patterns, recurring project types, inferred strengths — and writes it back as a persistent profile. That profile travels into every subsequent prompt as injected context, without the user having to fill out a settings form.`,
  },
  {
    index: '03',
    title: 'Team roster-aware task assignment',
    body: `For team breakdowns, the full roster — names, roles, skills, bios — is injected into the prompt alongside the task. Claude assigns subtasks by reasoning across the team's collective capability, returning not just assignments but the rationale for each one. The model acts as a lightweight project manager, not a random distributor.`,
  },
  {
    index: '04',
    title: 'Structured output with fallback extraction',
    body: `Every Claude response is expected as JSON — structured steps, time estimates, assignees. A validation layer checks the response shape and, if the model returns malformed output, a regex-based extraction pass attempts to recover usable structure before surfacing an error. This keeps the product reliable even when the model drifts from the requested format.`,
  },
]

export default function ClevedonCaseStudy() {
  return (
    <div className="pt-14">
      <SEO
        title="Clevedon — AI Task Breakdown Platform Case Study"
        description="How Ardorio built Clevedon — an AI-powered task breakdown tool that turns any brief into a structured, role-specific plan — from zero to live."
        canonical="/work/clevedon"
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
      <div className="max-w-6xl mx-auto px-6 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="label">Live</span>
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              Clevedon
            </h1>
            <p className="text-stone-500 text-sm mt-2">
              AI task breakdown platform for individuals and teams
            </p>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-4">
            <p className="text-stone-600 leading-relaxed">
              We built Clevedon end to end — product strategy, full-stack application, AI engine, team collaboration, and a tiered monetisation model ready to scale.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Outcome stats */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {outcomes.map((stat) => (
            <div key={stat.label} className="p-6 bg-cream-200 rounded-2xl">
              <div className="font-serif text-2xl text-ink">{stat.value}</div>
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
              Any task.<br />
              <em>A plan you can start.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 space-y-5 text-stone-700 leading-relaxed">
            <p>
              Clevedon solves the moment before the work starts. Paste in anything — a Jira ticket, a client brief, a job description, an unclear instruction from a manager — and the platform returns a structured, ordered breakdown of exactly what to do next, calibrated to your role and experience.
            </p>
            <p>
              The problem it targets is specific: task initiation paralysis. The gap between receiving something to do and knowing how to start. Clevedon closes that gap in seconds, and does it without generic templates or one-size-fits-all checklists.
            </p>
            <p>
              The product scales from a solo user who runs five breakdowns a day to a team distributing complex deliverables across multiple contributors — all on the same platform, with a monetisation model built to grow with them.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Product features */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="label mb-4">What users get</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              Plans that fit<br />
              <em>the person, not just the task.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              Clevedon doesn't just break tasks down — it breaks them down for you specifically. Role, experience, background, and history all shape what the AI returns.
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
                <span className="label shrink-0 pt-0.5 w-6">{item.index}</span>
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

      {/* AI engineering */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="label mb-4">AI engineering</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              Claude as a<br />
              <em>domain expert.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              The AI layer is built to make Claude behave like a knowledgeable colleague rather than a general assistant — grounded in the user's profession, shaped by their history, and capable of reasoning across a team.
            </p>
          </div>
        </div>

        <div>
          {aiDetails.map((item, i) => (
            <motion.div
              key={item.index}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="py-8 border-b border-cream-300 grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              <div className="lg:col-span-4 flex items-start gap-4">
                <span className="label shrink-0 pt-0.5 w-6">{item.index}</span>
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

      {/* Scope */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <p className="label mb-4">Scope</p>
            <h2 className="font-serif text-3xl text-ink">Everything,<br /><em>end to end.</em></h2>
            <p className="text-stone-500 text-sm mt-4 leading-relaxed">
              One product. One team. Owned from first commit to launch.
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
