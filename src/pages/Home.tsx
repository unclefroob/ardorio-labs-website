import { Link } from 'react-router-dom'
import { motion, type Variants, type Easing } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'
import Logo from '../components/Logo'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const services = [
  {
    index: '01',
    title: 'Enterprise Technology',
    short: 'Enterprise',
    description: 'We help large organisations move faster — auditing tech stacks, modernising infrastructure, and building the engineering culture to sustain it.',
  },
  {
    index: '02',
    title: 'AI Engineering',
    short: 'Artificial Intelligence',
    description: 'From readiness assessments to production deployments — we help organisations find, build, and govern AI that actually works.',
  },
  {
    index: '03',
    title: 'Startup Launch Partnerships',
    short: 'Startups',
    description: 'We co-build with ambitious founders. Product strategy, full-stack development, and go-to-market — until you\'re live.',
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

export default function Home() {
  return (
    <div>
      <SEO
        title="Technology Built for Australian Enterprises & Founders"
        description="Ardorio partners with Australian enterprises and startup founders to build technology that ships — enterprise platforms, AI engineering, and end-to-end product development."
        canonical="/"
      />
      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 max-w-6xl mx-auto px-6">
        <Logo size={200} className="absolute top-32 right-0 opacity-[0.07] pointer-events-none" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-10 items-end">
          {/* Heading */}
          <motion.div
            className="lg:col-span-7"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
<h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] text-ink">
              Technology<br />
              <em>built</em> for<br />
              enterprises and<br />
              founders.
            </h1>
          </motion.div>

          {/* Right column */}
          <motion.div
            className="lg:col-span-5 lg:pb-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: EASE }}
          >
            <p className="text-stone-600 text-lg leading-relaxed mb-8">
              We partner with major corporations and startup founders to build technology that ships — and keeps working after we're gone.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/contact" className="btn-primary">
                Start a conversation
              </Link>
              <Link to="/work" className="btn-ghost">
                See our work <ArrowUpRight size={14} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Divider */}
      <div className="divider" />

      {/* Services — editorial list */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <p className="label">What we do</p>
          <Link to="/services" className="btn-ghost text-xs">
            All services <ArrowUpRight size={12} />
          </Link>
        </div>

        <div>
          {services.map((service, i) => (
            <motion.div
              key={service.index}
              custom={i}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeUp}
            >
              <Link
                to={`/services#${service.short.toLowerCase().replace(/\s/g, '-')}`}
                className="group flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8 py-7 border-b border-cream-300 hover:bg-cream-200 -mx-4 px-4 rounded-lg transition-colors"
              >
                <span className="label shrink-0 pt-1 w-8">{service.index}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-serif text-2xl text-ink group-hover:text-stone-700 transition-colors">
                      {service.title}
                    </h3>
                    <ArrowUpRight
                      size={18}
                      className="shrink-0 text-stone-400 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all mt-1"
                    />
                  </div>
                  <p className="text-stone-600 text-sm mt-2 leading-relaxed max-w-xl">
                    {service.description}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="divider" />

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
                  Career navigation platform built from scratch. We owned the full product — architecture, design, engineering, and AI recommendation features — from first commit to launch.
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
              <p className="text-stone-500 italic leading-relaxed text-sm mb-8">
                A testimonial from the PathIQ founder is on the way — we worked closely with their team through the full product launch.
              </p>
              <div className="flex items-center gap-3 pt-6 border-t border-cream-300">
                <div className="w-9 h-9 rounded-full bg-cream-300 flex items-center justify-center">
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
                    pathiq.com.au
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Divider */}
      <div className="divider" />

      {/* Bottom CTA — minimal strip */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
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
