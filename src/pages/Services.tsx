import { Link } from 'react-router-dom'
import { Building2, Brain, Rocket, ArrowRight, CheckCircle2 } from 'lucide-react'

const services = [
  {
    id: 'enterprise',
    icon: Building2,
    label: 'Enterprise',
    title: 'Enterprise Tech Consulting',
    headline: 'Technology strategy for organisations that can\'t afford to stand still.',
    description:
      'We embed with enterprise teams to identify inefficiencies, modernise legacy systems, and build the engineering culture and tooling needed to move faster and safer in today\'s market.',
    offerings: [
      'Technology audits and roadmapping',
      'Digital transformation strategy',
      'Cloud migration and architecture',
      'Engineering team structure and process',
      'Vendor evaluation and selection',
      'Platform and infrastructure modernisation',
    ],
    cta: 'Talk to our enterprise team',
  },
  {
    id: 'ai',
    icon: Brain,
    label: 'AI',
    title: 'AI Consulting',
    headline: 'Practical AI that delivers results — not just prototypes.',
    description:
      'We help organisations move beyond AI experimentation. From assessing your AI readiness to designing and deploying models that integrate with your existing systems, we focus on the outcomes that matter.',
    offerings: [
      'AI readiness and opportunity assessments',
      'LLM integration and prompt engineering',
      'Custom model training and fine-tuning',
      'AI governance and risk frameworks',
      'RAG pipelines and knowledge bases',
      'AI product design and UX',
    ],
    cta: 'Explore AI consulting',
  },
  {
    id: 'startups',
    icon: Rocket,
    label: 'Startups',
    title: 'Startup Launch Partnerships',
    headline: 'More than a dev shop — a founding-level partner.',
    description:
      'We work with early-stage founders who need more than a contractor. We bring the technical depth, product thinking, and hands-on execution to help you go from idea to launched product — fast.',
    offerings: [
      'Product strategy and validation',
      'Full-stack development',
      'Design and UX',
      'AI-powered product features',
      'Go-to-market strategy support',
      'Pitch deck and investor readiness',
    ],
    cta: 'Start a conversation',
  },
]

export default function Services() {
  return (
    <div className="pt-24">
      {/* Header */}
      <section className="py-20 hero-glow">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-brand-light text-sm font-semibold uppercase tracking-widest mb-4">Services</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            How we work with you
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Three focused service lines. Each one built around delivering real outcomes.
          </p>
        </div>
      </section>

      {/* Service sections */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col gap-20">
          {services.map((service, i) => {
            const Icon = service.icon
            const isEven = i % 2 === 0

            return (
              <div
                key={service.id}
                id={service.id}
                className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                  !isEven ? 'lg:flex-row-reverse' : ''
                }`}
              >
                {/* Content */}
                <div className={isEven ? '' : 'lg:order-2'}>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs text-brand-light font-medium mb-6">
                    <Icon size={13} />
                    {service.label}
                  </div>
                  <h2 className="text-3xl font-bold text-white tracking-tight mb-4">
                    {service.title}
                  </h2>
                  <p className="text-white/70 text-lg font-medium mb-4 leading-snug">
                    {service.headline}
                  </p>
                  <p className="text-white/50 leading-relaxed mb-8">
                    {service.description}
                  </p>
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-light text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {service.cta} <ArrowRight size={14} />
                  </Link>
                </div>

                {/* Offerings card */}
                <div className={`glass rounded-2xl p-8 ${isEven ? '' : 'lg:order-1'}`}>
                  <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-5">What's included</p>
                  <ul className="flex flex-col gap-3.5">
                    {service.offerings.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <CheckCircle2 size={16} className="text-brand-light mt-0.5 shrink-0" />
                        <span className="text-white/70 text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-4">Not sure where to start?</h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            Tell us what you're working on and we'll figure out the right fit together.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-brand hover:bg-brand-light text-white font-medium rounded-lg transition-colors"
          >
            Get in touch <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
