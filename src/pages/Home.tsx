import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Brain, Rocket, ChevronRight } from 'lucide-react'

const services = [
  {
    icon: Building2,
    title: 'Enterprise Tech Consulting',
    description:
      'We partner with major corporations to modernise their technology stack, streamline digital operations, and drive measurable outcomes across engineering and product.',
    link: '/services#enterprise',
  },
  {
    icon: Brain,
    title: 'AI Consulting',
    description:
      'From AI readiness assessments to full implementation — we help organisations identify high-value AI opportunities and deploy them safely and effectively.',
    link: '/services#ai',
  },
  {
    icon: Rocket,
    title: 'Startup Launch Partnerships',
    description:
      'We co-build with ambitious founders — providing the technical depth, product thinking, and execution support to take ideas from concept to launch.',
    link: '/services#startups',
  },
]

const stats = [
  { value: '10+', label: 'Enterprise clients' },
  { value: '3+', label: 'Startups launched' },
  { value: '100%', label: 'On-time delivery' },
]

export default function Home() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center hero-glow">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs text-blue-300 font-medium mb-8 animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-light animate-pulse" />
              Tech & AI Consulting · ardorio.co
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-6 animate-slide-up">
              <span className="text-gradient">Technology that</span>
              <br />
              <span className="text-white">moves fast.</span>
            </h1>

            <p className="text-lg sm:text-xl text-white/60 leading-relaxed max-w-xl mb-10 animate-slide-up">
              Ardorio delivers enterprise tech modernisation, AI strategy, and hands-on startup launch partnerships — built for teams that need to ship.
            </p>

            <div className="flex flex-wrap gap-4 animate-fade-in">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand hover:bg-brand-light text-white font-medium rounded-lg transition-colors text-sm"
              >
                Start a conversation
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/work"
                className="inline-flex items-center gap-2 px-6 py-3 glass hover:bg-white/10 text-white font-medium rounded-lg transition-colors text-sm"
              >
                See our work
                <ChevronRight size={16} />
              </Link>
            </div>

            {/* Stats */}
            <div className="mt-16 flex flex-wrap gap-10 animate-fade-in">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-white/40 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-24 relative section-glow">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-brand-light text-sm font-semibold uppercase tracking-widest mb-3">What we do</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Three ways we create impact
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {services.map((service) => {
              const Icon = service.icon
              return (
                <div key={service.title} className="glass rounded-2xl p-7 hover:bg-white/[0.07] transition-colors group">
                  <div className="w-11 h-11 bg-brand/15 rounded-xl flex items-center justify-center mb-5 group-hover:bg-brand/25 transition-colors">
                    <Icon size={20} className="text-brand-light" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3">{service.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-5">{service.description}</p>
                  <Link
                    to={service.link}
                    className="inline-flex items-center gap-1.5 text-brand-light text-sm font-medium hover:gap-2.5 transition-all"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Case Study Preview */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-brand-light text-sm font-semibold uppercase tracking-widest mb-3">Our work</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Built alongside founders
            </h2>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Content */}
              <div className="p-10 lg:p-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-xs font-medium mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Live · pathiq.com.au
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">PathIQ</h3>
                <p className="text-white/60 leading-relaxed mb-6">
                  We partnered with the PathIQ founders to take their product from early concept to a fully launched platform — covering architecture, design, engineering, and go-to-market strategy.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {['Product Strategy', 'Full-Stack Dev', 'AI Integration', 'Launch'].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-white/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <Link
                  to="/work"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-light text-white text-sm font-medium rounded-lg transition-colors"
                >
                  View case study <ArrowRight size={14} />
                </Link>
              </div>

              {/* Testimonial placeholder */}
              <div className="p-10 lg:p-12 bg-white/[0.02] border-t lg:border-t-0 lg:border-l border-white/5 flex flex-col justify-center">
                <div className="text-4xl text-white/10 font-serif mb-4">"</div>
                <p className="text-white/40 italic text-sm leading-relaxed mb-6">
                  Testimonial from the PathIQ founder coming soon.
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-white/40 text-xs font-medium">PQ</span>
                  </div>
                  <div>
                    <div className="text-white/30 text-sm font-medium">PathIQ Founder</div>
                    <a
                      href="https://pathiq.com.au"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-light/60 text-xs hover:text-brand-light transition-colors"
                    >
                      pathiq.com.au
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
            Ready to build something?
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto mb-10">
            Whether you're an enterprise looking to modernise or a founder with a product to ship — let's talk.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand hover:bg-brand-light text-white font-medium rounded-lg transition-colors"
          >
            Start a conversation
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
