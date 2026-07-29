import { Link } from 'react-router-dom'
import { motion, type Variants, type Easing } from 'framer-motion'
import { ArrowUpRight, Gauge } from 'lucide-react'
import SEO from '../components/SEO'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: EASE },
  }),
}

interface Project {
  slug: string
  name: string
  site: string
  tagline: string
  // The efficiency payoff: what manual work the product removes for its users.
  outcome: string
  // Metric-ready slot. Populate with real figures when we have them, e.g.
  // { value: '80%', label: 'less time building rosters' }. Rendered only when set.
  stat?: { value: string; label: string }
  tags: string[]
}

const projects: Project[] = [
  {
    slug: 'pathiq',
    name: 'PathIQ',
    site: 'pathiq.com.au',
    tagline:
      'An AI career-discovery platform where students test-drive real careers through simulations. We built the product and the internal CRM the team runs it on.',
    outcome:
      'AI does work that would otherwise need a team of career advisors, matching students to real-world career paths in seconds.',
    tags: ['AI product', 'Full-stack', 'Internal CRM'],
  },
  {
    slug: 'rosterio',
    name: 'Rosterio',
    site: 'rosterio.app',
    tagline:
      'A workforce operating system for shift-based businesses, with constraint-aware auto-fill scheduling, a shift marketplace, GPS attendance, and native mobile apps.',
    outcome:
      'Constraint-aware auto-fill builds compliant rosters automatically, replacing the hours managers used to spend piecing them together by hand.',
    tags: ['Full-stack', 'iOS & Android', 'Scheduling engine'],
  },
]

const testimonial = {
  quote:
    "Working with Ryan and Jansen from Ardorio has been a game changer for bringing PathIQ to life. From day one, they've gone above and beyond, not just executing on ideas, but genuinely investing in the vision. Their ability to translate concepts into practical, scalable solutions has been outstanding, and they've consistently delivered with speed, clarity, and professionalism.",
  name: 'Calum Batey',
  role: 'Founder, PathIQ',
  initials: 'PQ',
}

export default function Work() {
  return (
    <div className="pt-14">
      <SEO
        title="Work | Products We've Built"
        description="Case studies from Ardorio's AI and product engagements in Australia. See how we build AI products that cut manual work and make businesses more efficient, from zero to live."
        canonical="/work"
      />
      <div className="divider" />

      {/* Header */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="label mb-6">Our work</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              Things we've<br />
              <em>shipped.</em>
            </h1>
          </div>
          <div className="lg:col-span-5">
            <p className="text-stone-600 leading-relaxed">
              We build products that cut the manual work out of a business and put AI on the parts that used to take hours. Zero to live, and we stay close to every client afterwards. More case studies from enterprise and AI engagements are coming.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Projects */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projects.map((p, i) => (
            <motion.div
              key={p.slug}
              custom={i}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeUp}
              className="bg-cream-200 rounded-2xl p-8 flex flex-col"
            >
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="label">Live · {p.site}</span>
              </div>
              <h2 className="font-serif text-3xl text-ink mb-3">{p.name}</h2>
              <div className="flex-1">
                <p className="text-stone-600 leading-relaxed text-sm mb-6">{p.tagline}</p>
                <div className="mb-6 pt-5 border-t border-cream-300">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Gauge size={13} className="text-[#863BFF]" />
                    <span className="label text-stone-500">Efficiency</span>
                  </div>
                  <p className="text-stone-700 text-sm leading-relaxed">{p.outcome}</p>
                  {p.stat && (
                    <p className="mt-3 text-sm text-stone-600">
                      <span className="font-serif text-2xl text-ink align-middle mr-1.5">
                        {p.stat.value}
                      </span>
                      {p.stat.label}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-8">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="px-3 py-1 bg-cream-300 rounded-full text-xs font-mono text-stone-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link to={`/work/${p.slug}`} className="btn-primary">
                  Read case study
                </Link>
                <a
                  href={`https://${p.site}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  Visit site <ArrowUpRight size={14} />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="divider" />

      {/* Testimonial */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, ease: EASE }}
        className="max-w-6xl mx-auto px-6 py-16"
      >
        <div className="bg-cream-200 rounded-2xl p-10 lg:p-16">
          <p className="label text-stone-500 mb-6">What our clients say</p>
          <p className="font-serif text-6xl text-cream-400 leading-none select-none mb-2">"</p>
          <blockquote className="italic text-stone-700 text-lg sm:text-xl leading-relaxed max-w-3xl">
            {testimonial.quote}
          </blockquote>
          <div className="mt-10 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-cream-300 flex items-center justify-center shrink-0">
              <span className="font-mono text-xs text-stone-600">{testimonial.initials}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-800">{testimonial.name}</p>
              <p className="text-xs text-stone-500">{testimonial.role}</p>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="divider" />

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="label mb-2">More case studies</p>
            <p className="text-stone-600 text-sm">Enterprise and AI engagements are coming soon.</p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Work with us
          </Link>
        </div>
      </div>
    </div>
  )
}
