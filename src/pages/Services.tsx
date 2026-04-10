import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'

const services = [
  {
    id: 'enterprise',
    index: '01',
    title: 'Enterprise Tech Consulting',
    description:
      'We embed with enterprise teams to diagnose what\'s slowing them down and fix it — whether that\'s legacy infrastructure, fragmented tooling, or an engineering culture that can\'t keep pace with the business.',
    offerings: [
      'Technology audits and roadmapping',
      'Digital transformation strategy',
      'Cloud migration and architecture',
      'Engineering team structure and process',
      'Vendor evaluation and selection',
      'Platform and infrastructure modernisation',
    ],
    clients: 'Major corporations and government organisations',
  },
  {
    id: 'ai',
    index: '02',
    title: 'AI Consulting',
    description:
      'AI that ships and stays in production — not just prototypes. We help organisations identify where AI creates real value, then build and deploy it in a way that\'s safe, maintainable, and measurable.',
    offerings: [
      'AI readiness and opportunity assessments',
      'LLM integration and prompt engineering',
      'Custom model training and fine-tuning',
      'RAG pipelines and knowledge systems',
      'AI governance and risk frameworks',
      'AI product design and UX',
    ],
    clients: 'Enterprises beginning or scaling their AI program',
  },
  {
    id: 'startups',
    index: '03',
    title: 'Startup Launch Partnerships',
    description:
      'We don\'t take on many startup partnerships — but when we do, we go all in. We sit inside the founding team and own whatever needs owning: product strategy, engineering, design, go-to-market. Until you\'re live.',
    offerings: [
      'Product strategy and validation',
      'Full-stack development',
      'UX and interface design',
      'AI-powered product features',
      'Go-to-market strategy',
      'Investor readiness support',
    ],
    clients: 'Pre-seed and seed stage founders with strong domain insight',
  },
]

export default function Services() {
  return (
    <div className="pt-14">
      {/* Header */}
      <div className="divider" />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="label mb-6">Services</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              Three ways we<br />
              <em>create impact.</em>
            </h1>
          </div>
          <div className="lg:col-span-5">
            <p className="text-stone-600 leading-relaxed">
              Each engagement is different. But our approach is the same — get close to the problem, be honest about what's needed, and build something that lasts.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Services */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {services.map((service, i) => (
          <motion.div
            key={service.id}
            id={service.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className="py-14 border-b border-cream-300"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Index + title */}
              <div className="lg:col-span-4">
                <p className="label mb-4">{service.index}</p>
                <h2 className="font-serif text-3xl text-ink">{service.title}</h2>
                <p className="text-xs text-stone-500 mt-4 leading-relaxed">
                  Best fit: {service.clients}
                </p>
              </div>

              {/* Description + offerings */}
              <div className="lg:col-span-5">
                <p className="text-stone-700 leading-relaxed mb-8">{service.description}</p>
                <ul className="space-y-2.5">
                  {service.offerings.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-stone-600">
                      <span className="font-mono text-stone-400 shrink-0 mt-0.5">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="lg:col-span-3 flex lg:justify-end lg:items-start pt-1">
                <Link to="/contact" className="btn-ghost">
                  Enquire <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-serif text-2xl text-ink">Not sure which fits?</h2>
            <p className="text-stone-600 mt-1 text-sm">Tell us what you're working on and we'll figure it out together.</p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Get in touch
          </Link>
        </div>
      </div>
    </div>
  )
}
