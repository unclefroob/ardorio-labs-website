import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink } from 'lucide-react'

export default function Work() {
  return (
    <div className="pt-24">
      {/* Header */}
      <section className="py-20 hero-glow">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-brand-light text-sm font-semibold uppercase tracking-widest mb-4">Our Work</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            Projects we're proud of
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            We partner closely with every client. Here's what we've built together.
          </p>
        </div>
      </section>

      {/* PathIQ Case Study */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="glass rounded-2xl overflow-hidden">
          {/* Case study header */}
          <div className="p-10 lg:p-14 border-b border-white/5">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-xs font-medium mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Live
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">PathIQ</h2>
                <a
                  href="https://pathiq.com.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-brand-light text-sm hover:text-white transition-colors"
                >
                  pathiq.com.au <ExternalLink size={13} />
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Product Strategy', 'Full-Stack Dev', 'AI Integration', 'UX Design', 'Launch'].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-white/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Case study body */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
            {/* Story */}
            <div className="lg:col-span-2 p-10 lg:p-14 border-b lg:border-b-0 lg:border-r border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">The project</h3>
              <div className="space-y-4 text-white/60 leading-relaxed">
                <p>
                  PathIQ is a platform designed to help professionals navigate career transitions and make smarter decisions about their career path. The founders came to Ardorio with a clear vision but needed a technical partner who could own the full build.
                </p>
                <p>
                  We worked alongside the PathIQ team from early product definition through to launch — handling architecture decisions, building the full-stack application, integrating AI-powered recommendation features, and designing the user experience from the ground up.
                </p>
                <p>
                  The result is a polished, scalable platform that shipped on time and is live at pathiq.com.au.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { value: '0 → 1', label: 'Full product build' },
                  { value: 'On time', label: 'Delivered to schedule' },
                  { value: 'AI-powered', label: 'Career recommendations' },
                ].map((stat) => (
                  <div key={stat.label} className="p-5 bg-white/[0.03] border border-white/5 rounded-xl">
                    <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                    <div className="text-xs text-white/40">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonial */}
            <div className="p-10 lg:p-12 flex flex-col justify-between bg-white/[0.02]">
              <div>
                <div className="text-5xl text-brand/30 font-serif leading-none mb-5">"</div>
                <p className="text-white/40 italic text-sm leading-relaxed">
                  We're currently working with the PathIQ founder on a case study and testimonial. Check back soon.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-3 pt-8 border-t border-white/5">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <span className="text-white/40 text-xs font-bold">PQ</span>
                </div>
                <div>
                  <div className="text-white/40 text-sm font-medium">PathIQ Founder</div>
                  <a
                    href="https://pathiq.com.au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-light/50 text-xs hover:text-brand-light transition-colors"
                  >
                    pathiq.com.au
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* More coming soon */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="glass rounded-2xl p-10 text-center border-dashed">
          <p className="text-white/20 text-sm font-medium uppercase tracking-widest mb-3">More work</p>
          <p className="text-white/40 text-base">
            Additional case studies from our enterprise and AI consulting engagements coming soon.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-4">Want to be next?</h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            Whether you're launching a product or transforming an enterprise — we'd love to hear what you're building.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-brand hover:bg-brand-light text-white font-medium rounded-lg transition-colors"
          >
            Start a conversation <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
