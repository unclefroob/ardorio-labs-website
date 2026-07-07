import { useParams, Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'
import ServiceSteps from '../components/ServiceSteps'
import { getService, services } from '../data/services'

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const service = getService(slug || '')
  if (!service) return <Navigate to="/services" replace />

  const idx = services.findIndex((s) => s.slug === service.slug)
  const next = services[(idx + 1) % services.length]

  return (
    <div className="pt-14">
      <SEO
        title={`${service.title} | Services`}
        description={service.tagline}
        canonical={`/services/${service.slug}`}
      />

      <div className="divider" />

      {/* Back */}
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <Link
          to="/services"
          className="inline-flex items-center gap-2 label hover:text-ink transition-colors group"
        >
          <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
          All services
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative max-w-6xl mx-auto px-6 pt-10 pb-14"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7">
              <p className="label mb-4">Services</p>
              <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight">
                {service.title}
              </h1>
            </div>
            <div className="lg:col-span-5">
              <p className="text-stone-500 text-sm leading-relaxed">Best fit: {service.bestFit}</p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="divider" />

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <p className="text-stone-700 leading-relaxed text-lg">{service.description}</p>
          </div>
          <div className="lg:col-span-5">
            <p className="label mb-4">What that includes</p>
            <ul className="space-y-2.5">
              {service.offerings.map((o) => (
                <li key={o} className="flex items-start gap-3 text-sm text-stone-600">
                  <span className="font-mono text-stone-400 shrink-0 mt-0.5">—</span>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {service.steps.length > 0 && (
        <>
          <div className="divider" />

          {/* How we work */}
          <div className="max-w-6xl mx-auto px-6 py-14">
            <div className="mb-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
              <h2 className="font-serif text-3xl text-ink lg:col-span-5">How we work</h2>
              <p className="text-stone-600 leading-relaxed lg:col-span-6">
                A staged engagement, so you can commit as you see the value.
              </p>
            </div>
            <ServiceSteps steps={service.steps} />
          </div>
        </>
      )}

      {service.capabilities && service.capabilities.length > 0 && (
        <>
          <div className="divider" />

          {/* Capabilities */}
          <div className="max-w-6xl mx-auto px-6 py-14">
            <div className="mb-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
              <h2 className="font-serif text-3xl text-ink lg:col-span-5">What we can build</h2>
              <p className="text-stone-600 leading-relaxed lg:col-span-6">
                The building blocks we bring, and combine, to fit your problem.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {service.capabilities.map((c, i) => (
                <motion.div
                  key={c.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, delay: i * 0.05 }}
                  className="bg-cream-200 rounded-2xl p-6"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(134,59,255,0.16), rgba(71,191,255,0.14))',
                    }}
                  >
                    <c.icon size={20} strokeWidth={1.75} style={{ color: '#863BFF' }} />
                  </div>
                  <p className="font-serif text-lg text-ink mb-1.5">{c.name}</p>
                  <p className="text-sm text-stone-600 leading-relaxed">{c.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="divider" />

      {/* Footer nav + CTA */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <div>
            <p className="label mb-2">Next</p>
            <Link to={`/services/${next.slug}`} className="group inline-flex items-start gap-3">
              <h2 className="font-serif text-2xl text-ink group-hover:text-stone-700 transition-colors">
                {next.title}
              </h2>
              <ArrowUpRight
                size={18}
                className="shrink-0 text-stone-400 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all mt-1"
              />
            </Link>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Get in touch
          </Link>
        </div>
      </div>
    </div>
  )
}
