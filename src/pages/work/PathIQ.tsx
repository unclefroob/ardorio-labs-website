import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import SEO from '../../components/SEO'
import PathIQEvalFlow from '../../components/PathIQEvalFlow'
import PathIQProductMap from '../../components/PathIQProductMap'
import PathIQMarkets from '../../components/PathIQMarkets'
import PathIQApproach from '../../components/PathIQApproach'

const scope = [
  'Product strategy and roadmap',
  'End-to-end platform engineering',
  'Student-facing application',
  'Internal CRM and sales pipeline',
  'Institution management portal',
  'AI-powered simulation scoring',
  'Personality and career matching',
  'Billing, payments, and communications',
  'Multi-institution deployment',
  'Go-to-market strategy and launch',
]

const productFeatures = [
  {
    index: '01',
    title: 'A profile that actually fits',
    body: `Most career tools ask what students want. PathIQ finds out what they're actually like. The personality assessment covers working style, motivation, social preferences, and learning approach, and returns a primary archetype (Analyst, Builder, Creator, Organiser, Communicator, Supporter, Leader, Explorer, Innovator, Strategist, Technician, or Advisor) alongside a secondary where the picture warrants it. Students leave with a starting point that reflects who they are, not what they hoped to hear.`,
  },
  {
    index: '02',
    title: 'Careers matched to performance, not preference',
    body: `Interest alone is a weak signal. PathIQ ranks career matches using both personality fit and how a student actually performed in simulations, so the list reflects where they're likely to thrive, not just what sounded appealing on paper. The more a student explores, the sharper their results become.`,
  },
  {
    index: '03',
    title: 'Degree recommendations that close the loop',
    body: `Career matches connect directly to degree programmes ranked by relevance to the student's results. Schools and universities scope the catalogue to their own offerings, so students see pathways that are real and available to them. For universities, it's a way to connect prospective students to the programmes they're genuinely a good fit for, before they've even applied.`,
  },
]

export default function PathIQCaseStudy() {
  return (
    <div className="pt-14">
      <SEO
        title="PathIQ | AI-Powered Career Platform Case Study"
        description="How Ardorio built PathIQ, an AI-powered career exploration platform for Australian students, schools, and universities, from zero to live."
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
              A founder came to us with an idea. We turned it into PathIQ: a live product students step inside to test-drive careers, backed by an internal CRM the team uses to run the platform and their sales.
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

      {/* One idea, two products */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <h2 className="font-serif text-3xl text-ink lg:col-span-5">
            One idea,<br />
            <em>two products.</em>
          </h2>
          <p className="text-stone-600 leading-relaxed lg:col-span-6">
            A founder came to us with an idea. We built the product students use, and the internal CRM the team runs it on, from content and institutions through to the sales pipeline.
          </p>
        </div>
        <PathIQProductMap />
      </div>

      <div className="divider" />

      {/* How we got here */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <h2 className="font-serif text-3xl text-ink lg:col-span-5">
            How we<br />
            <em>got here.</em>
          </h2>
          <p className="text-stone-600 leading-relaxed lg:col-span-6">
            A founder's idea only becomes a product through a run of decisions. These were the calls that shaped PathIQ, each one a step off the more obvious path.
          </p>
        </div>
        <PathIQApproach />
      </div>

      <div className="divider" />

      {/* What it is */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-5">
            <p className="label mb-4">The product</p>
            <h2 className="font-serif text-3xl text-ink">
              Career discovery,<br />
              <em>done properly.</em>
            </h2>
          </div>
          <p className="text-stone-600 leading-relaxed lg:col-span-6">
            Students don't read about a career, they spend a day inside it. The same platform serves three markets, each with its own catalogue and configuration.
          </p>
        </div>
        <PathIQMarkets />
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
              PathIQ connects the dots between who a student is, which careers suit them, and which degree gets them there, all in one place, grounded in how they actually perform.
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
          <p className="label mb-4">The scoring engine</p>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <h2 className="font-serif text-3xl text-ink lg:col-span-5">
              Inside a single<br />
              <em>evaluation.</em>
            </h2>
            <p className="text-stone-600 leading-relaxed lg:col-span-6">
              The AI-and-rules split is decided the moment a response comes in. Open-ended answers go to Claude, marked against the rubric; structured answers are scored by rules. Here is the full run, from submission to feedback.
            </p>
          </div>
        </div>

        <PathIQEvalFlow />

        {/* The rubric */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-5">
            <p className="label mb-3">The rubric</p>
            <h3 className="font-serif text-2xl text-ink leading-tight">
              The institution's<br />
              <em>definition of good.</em>
            </h3>
          </div>
          <div className="lg:col-span-7">
            <p className="text-stone-600 leading-relaxed text-sm mb-6">
              A rubric is how a school or university defines a strong answer. Staff write it in the CRM, no deploy required. At evaluation time it is injected into the prompt alongside the task and scenario, so Claude marks every student against the same standard rather than an opinion of the moment.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs font-mono text-stone-600">
              <span className="px-3 py-2 rounded-lg bg-cream-200 text-center">Written in the CRM</span>
              <span className="text-cream-400 text-center sm:px-1" aria-hidden>→</span>
              <span className="px-3 py-2 rounded-lg bg-cream-200 text-center">Injected into the prompt</span>
              <span className="text-cream-400 text-center sm:px-1" aria-hidden>→</span>
              <span className="px-3 py-2 rounded-lg bg-cream-200 text-center">Claude marks against it</span>
            </div>
          </div>
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
              Two products, three markets. One team that owned all of it.
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
                Each simulation drops a student into a real scenario, like a hospital emergency, a design brief, a marketing crisis, or a legal case. They make decisions, weigh trade-offs, write responses, and work through the kind of tasks that actually define the job.
              </p>
              <p className="text-stone-600 leading-relaxed text-sm">
                When they finish, they find out how they actually performed, not how they thought they would. That gap is what makes PathIQ useful. It replaces guesswork about future careers with evidence.
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

      {/* Testimonial */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="p-8 bg-cream-200 rounded-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <p className="font-serif text-4xl text-cream-400 leading-none mb-3 select-none">"</p>
              <p className="text-stone-700 italic leading-relaxed">
                Working with Ryan and Jansen from Ardorio has been a game changer for bringing PathIQ to life. From day one, they've gone above and beyond, not just executing on ideas, but genuinely investing in the vision behind PathIQ. Their ability to translate concepts into practical, scalable solutions has been outstanding, and they've consistently delivered with speed, clarity, and professionalism.
              </p>
              <p className="text-stone-700 italic leading-relaxed mt-4">
                What's stood out most is their collaborative approach. Ryan and Jansen don't just "build", they challenge thinking in the right way, offer smart recommendations, and make the entire process feel seamless. They've been an extension of our team throughout, and their support has been instrumental in turning PathIQ from an idea into a real, functioning product.
              </p>
            </div>
            <div className="lg:col-span-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cream-300 flex items-center justify-center shrink-0">
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
