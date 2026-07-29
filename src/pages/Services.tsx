import { Link } from 'react-router-dom'
import { motion, type Variants, type Easing } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'
import { services } from '../data/services'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: EASE },
  }),
}

export default function Services() {
  return (
    <div className="pt-14">
      <SEO
        title="Services | AI Efficiency, Automation & Team Enablement"
        description="Ardorio finds the slow, manual, repetitive work across your business and builds the AI that removes it, then trains your team to run it. We also build MVPs for founders fast. We build what we recommend."
        canonical="/services"
      />
      <div className="divider" />

      {/* Header */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="label mb-6">Services</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              Less manual work,<br />
              <em>more done.</em>
            </h1>
          </div>
          <div className="lg:col-span-5">
            <p className="text-stone-600 leading-relaxed">
              Most of what we do comes down to one thing, helping your business get more done with less effort. We find where AI creates real leverage and build it, and we train your team to work faster with it. For founders, we also build a first product fast.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Services */}
      <div className="max-w-6xl mx-auto px-6 py-16 space-y-4">
        {services.map((s, i) => (
          <motion.div
            key={s.slug}
            custom={i}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
            variants={fadeUp}
          >
            <Link
              to={`/services/${s.slug}`}
              className="group block bg-cream-200 rounded-2xl p-8 lg:p-10 hover:bg-cream-300 transition-colors"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 lg:items-center">
                <h2 className="lg:col-span-4 font-serif text-2xl lg:text-3xl text-ink group-hover:text-stone-700 transition-colors">
                  {s.title}
                </h2>
                <p className="lg:col-span-6 text-stone-600 leading-relaxed">{s.tagline}</p>
                <div className="lg:col-span-2 lg:text-right">
                  <span className="btn-ghost">
                    Learn more <ArrowUpRight size={14} />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="divider" />

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-serif text-2xl text-ink">Get started with us</h2>
            <p className="text-stone-600 mt-1 text-sm">
              Tell us what you're working on and we'll figure it out together.
            </p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Get in touch
          </Link>
        </div>
      </div>
    </div>
  )
}
