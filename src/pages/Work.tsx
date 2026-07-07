import { Link } from 'react-router-dom'
import { motion, type Variants, type Easing } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
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

const projects = [
  {
    slug: 'pathiq',
    name: 'PathIQ',
    site: 'pathiq.com.au',
    tagline:
      'An AI career-discovery platform where students test-drive real careers through simulations. We built the product and the internal CRM the team runs it on.',
    tags: ['AI product', 'Full-stack', 'Internal CRM'],
  },
  {
    slug: 'rosterio',
    name: 'Rosterio',
    site: 'rosterio.app',
    tagline:
      'A workforce operating system for shift-based businesses, with constraint-aware auto-fill scheduling, a shift marketplace, GPS attendance, and native mobile apps.',
    tags: ['Full-stack', 'iOS & Android', 'Scheduling engine'],
  },
]

export default function Work() {
  return (
    <div className="pt-14">
      <SEO
        title="Work | Products We've Built"
        description="Case studies from Ardorio's AI and product engagements in Australia. See how we build from zero to live."
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
              We build from zero to live and stay close to every client. More case studies from enterprise and AI engagements are coming.
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
              <p className="text-stone-600 leading-relaxed text-sm mb-6 flex-1">{p.tagline}</p>
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
