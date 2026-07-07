import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'

const services = [
  {
    id: 'applied-ai',
    index: '01',
    title: 'Find the gap, build the fix',
    description:
      'Most organisations don\'t have an AI problem, they have an adoption problem. We come in, work out where AI and better technology actually create leverage, and build the thing that captures it. We build what we recommend, so you end up with a working system in production rather than a strategy deck that sits on a shelf.',
    offerings: [
      'Opportunity and gap assessments',
      'Custom AI features (RAG, agents, LLM integration)',
      'Full-stack products and internal tooling',
      'Workflow automation and integration',
      'Legacy and infrastructure modernisation',
      'Governance, guardrails and responsible use',
    ],
    clients: 'Established businesses that know AI matters but not yet where it pays off',
  },
  {
    id: 'training',
    index: '02',
    title: 'AI Training & Enablement',
    description:
      'Most teams don\'t need another AI talking point, they need to use it well in real work. We train your people directly, with hands-on workshops, practical prompting and workflow design, and the responsible-use guardrails that keep it safe. It\'s also how much of our build work starts, because once a team sees what\'s possible, the gaps worth fixing become obvious.',
    offerings: [
      'AI literacy and hands-on training',
      'Team workshops and enablement',
      'Prompting and workflow design',
      'Tool selection and rollout',
      'Responsible-use policy and guardrails',
      'Executive and board advisory',
    ],
    clients: 'Teams rolling AI out and unsure where to start',
  },
  {
    id: 'mvp',
    index: '03',
    title: 'Zero to MVP',
    description:
      'Founders come to us with sharp domain insight and no time to build a team. We build the POC or MVP fast, enough real product to put in front of users, test the idea, and raise or sell against. Product strategy, full-stack build, AI features, and the push to launch.',
    offerings: [
      'Rapid POC and MVP builds',
      'Product strategy and validation',
      'Full-stack development',
      'AI-powered product features',
      'UX and interface design',
      'Launch and go-to-market support',
    ],
    clients: 'Founders with strong domain insight and no time to build a team',
  },
]

export default function Services() {
  return (
    <div className="pt-14">
      <SEO
        title="Services | Applied AI, AI Training & Rapid MVP Builds"
        description="Ardorio finds where AI creates leverage in your business and builds the products to capture it, trains teams to adopt AI well, and builds POCs and MVPs for founders fast. We build what we recommend."
        canonical="/services"
      />
      <h1 className="sr-only">Services</h1>
      <div className="divider" />

      {/* Services */}
      <div className="max-w-6xl mx-auto px-6 py-8 pt-14">
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
