import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import SEO from '../../components/SEO'

const scope = [
  'Product strategy and roadmap',
  'End-to-end platform engineering',
  'Student-facing application',
  'Institution management portal',
  'AI-powered simulation scoring',
  'Personality and career matching',
  'Billing, payments, and communications',
  'Multi-institution deployment',
  'Go-to-market strategy and launch',
]

const outcomes = [
  { value: '0 → 1', label: 'Full build' },
  { value: '3', label: 'Markets served' },
  { value: 'AI-first', label: 'From day one' },
  { value: 'Live', label: 'On time' },
]

const productFeatures = [
  {
    index: '01',
    title: 'A profile that actually fits',
    body: `Most career tools ask what students want. PathIQ finds out what they're actually like. The personality assessment covers working style, motivation, social preferences, and learning approach — and returns a primary archetype (Analyst, Builder, Creator, Organiser, Communicator, Supporter, Leader, Explorer, Innovator, Strategist, Technician, or Advisor) alongside a secondary where the picture warrants it. Students leave with a starting point that reflects who they are, not what they hoped to hear.`,
  },
  {
    index: '02',
    title: 'Careers matched to performance, not preference',
    body: `Interest alone is a weak signal. PathIQ ranks career matches using both personality fit and how a student actually performed in simulations — so the list reflects where they're likely to thrive, not just what sounded appealing on paper. The more a student explores, the sharper their results become.`,
  },
  {
    index: '03',
    title: 'Degree recommendations that close the loop',
    body: `Career matches connect directly to degree programmes ranked by relevance to the student's results. Schools and universities scope the catalogue to their own offerings, so students see pathways that are real and available to them. For universities, it's a way to connect prospective students to the programmes they're genuinely a good fit for — before they've even applied.`,
  },
]

const aiDetails = [
  {
    index: '01',
    title: 'Prompt augmentation at evaluation time',
    body: `Student responses aren't sent to Claude in isolation. Each evaluation prompt is assembled at runtime by injecting the simulation title, task prompt, and scenario text into a stored template — so the model evaluates responses in full context. Claude knows what role the student was playing, what scenario they were in, and what the task asked before reading a word of their answer.`,
  },
  {
    index: '02',
    title: 'CMS-authored system prompts',
    body: `Evaluation rubrics live in the database, not in code. Institution admins write the system prompt and user prompt template for each task directly in the management portal — defining what good looks like for their specific scenario. The evaluation engine substitutes runtime variables into the template at call time. Non-technical staff can change how the AI judges a task without a deployment.`,
  },
  {
    index: '03',
    title: 'Structured output with JSON constraints',
    body: `Every evaluation call instructs Claude to return JSON only — a score and a feedback string. The response is validated with a regex extraction step as a safety net against stray formatting, and score values are clamped to a valid range regardless of what the model returns. The AI layer behaves like a typed service boundary: predictable inputs, predictable outputs.`,
  },
  {
    index: '04',
    title: 'Parallel inference with timeout isolation',
    body: `When a student completes a simulation with multiple open-ended tasks, all evaluations are dispatched concurrently — no sequential waiting. A configurable timeout runs against each call independently using Promise.race, so a slow API response can't delay the rest of the results. Any individual failure degrades gracefully without surfacing an error to the student.`,
  },
  {
    index: '05',
    title: 'Hybrid AI and rule-based scoring',
    body: `Structured task types — multiple choice, ranking, checkbox, numeric — are scored with deterministic logic that never touches the API. AI evaluation is reserved for open-ended responses where language understanding is the point. This keeps costs proportional to complexity, makes structured results fully reproducible, and concentrates AI spend on the tasks that actually benefit from it.`,
  },
]

export default function PathIQCaseStudy() {
  return (
    <div className="pt-14">
      <SEO
        title="PathIQ — AI-Powered Career Platform Case Study"
        description="How Ardorio built PathIQ — an AI-powered career exploration platform for Australian students, schools, and universities — from zero to live."
        canonical="/work/pathiq"
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
              <span className="label">Live · pathiq.com.au</span>
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              PathIQ
            </h1>
            <p className="text-stone-500 text-sm mt-2">
              Career exploration platform for students, schools, and universities
            </p>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-4">
            <p className="text-stone-600 leading-relaxed">
              We built PathIQ from the ground up — strategy, product, engineering, and launch. The founders brought the domain expertise. We brought everything else.
            </p>
            <a
              href="https://pathiq.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost self-start"
            >
              Visit site <ArrowUpRight size={14} />
            </a>
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
              Career discovery,<br />
              <em>done properly.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 space-y-5 text-stone-700 leading-relaxed">
            <p>
              PathIQ helps students figure out what careers actually suit them — not through a list of job titles and a personality quiz, but by putting them inside the job itself. They take an assessment, get matched to career archetypes that fit their working style, and then step through realistic day-in-the-life simulations for the careers that interest them most.
            </p>
            <p>
              The platform serves three markets: students who want to make better decisions for themselves, schools looking to improve career guidance outcomes, and universities using it to connect prospective students to programmes that genuinely match them. All three run on the same platform, with separate catalogues and configurations for each.
            </p>
            <p>
              The founders came to Ardorio with deep domain expertise and a clear problem to solve. We built the product around it — and stayed until it was live.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Product features */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="label mb-4">What students get</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              From personality<br />
              <em>to a clear path forward.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              PathIQ connects the dots between who a student is, which careers suit them, and which degree gets them there — all in one place, grounded in how they actually perform.
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

      {/* AI section */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="label mb-4">AI engineering</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              Claude at the core<br />
              <em>of every simulation.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              The evaluation engine goes beyond sending a response to a model. Every call is context-assembled, rubric-driven, and structured for consistent output — with parallel dispatch, timeout isolation, and graceful degradation built in from the start.
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

      {/* What we built */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <p className="label mb-4">Scope</p>
            <h2 className="font-serif text-3xl text-ink">Everything,<br /><em>end to end.</em></h2>
            <p className="text-stone-500 text-sm mt-4 leading-relaxed">
              Three products. Three markets. One team that owned all of it.
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

      {/* Simulations explained */}
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
                Not a quiz.<br />A day on the job.
              </h2>
              <p className="text-stone-600 leading-relaxed text-sm mb-5">
                Each simulation drops a student into a real scenario — a hospital emergency, a design brief, a marketing crisis, a legal case. They make decisions, weigh trade-offs, write responses, and work through the kind of tasks that actually define the job.
              </p>
              <p className="text-stone-600 leading-relaxed text-sm">
                When they finish, they find out how they actually performed — not how they thought they would. That gap is what makes PathIQ useful. It replaces guesswork about future careers with evidence.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { step: '01', label: 'Personality assessment', detail: 'Understand your strengths and working style' },
                { step: '02', label: 'Career matches', detail: 'Ranked by fit, not just what you said you liked' },
                { step: '03', label: 'Choose a simulation', detail: 'Experience the job before you commit to it' },
                { step: '04', label: 'AI evaluation', detail: 'Personalised feedback within seconds of finishing' },
                { step: '05', label: 'Results and degrees', detail: 'Matched degree programmes based on how you performed' },
              ].map((row) => (
                <div key={row.step} className="flex items-start gap-4 p-4 bg-cream-100/70 rounded-xl">
                  <span className="label shrink-0 pt-0.5">{row.step}</span>
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

      {/* Testimonial placeholder */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="p-8 bg-cream-200 rounded-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <p className="font-serif text-4xl text-cream-400 leading-none mb-3 select-none">"</p>
              <p className="text-stone-500 italic leading-relaxed">
                We're putting together a full testimonial with the PathIQ founder. Watch this space.
              </p>
            </div>
            <div className="lg:col-span-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cream-300 flex items-center justify-center shrink-0">
                <span className="font-mono text-xs text-stone-600">PQ</span>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-800">PathIQ Founder</p>
                <a
                  href="https://pathiq.com.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-stone-500 hover:text-ink transition-colors"
                >
                  pathiq.com.au ↗
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
