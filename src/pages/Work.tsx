import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'

export default function Work() {
  return (
    <div className="pt-14">
      <SEO
        title="Work — Products We've Built"
        description="Case studies from Ardorio's enterprise technology and AI product engagements in Australia. See how we build from zero to live."
        canonical="/work"
      />
      {/* Header */}
      <div className="divider" />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="label mb-6">Our Work</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              Things we've<br />
              <em>shipped.</em>
            </h1>
          </div>
          <div className="lg:col-span-5">
            <p className="text-stone-600 leading-relaxed">
              We partner closely with every client. More case studies from enterprise and AI engagements are coming — the first one is below.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* PathIQ Case Study */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Project header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="label">Live</span>
              </div>
              <h2 className="font-serif text-4xl text-ink">PathIQ</h2>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <Link to="/work/pathiq" className="btn-primary">
                Read case study <ArrowUpRight size={14} />
              </Link>
              <a
                href="https://pathiq.com.au"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                Visit site <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          {/* Main content */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Story */}
            <div className="lg:col-span-7 space-y-5 text-stone-700 leading-relaxed">
              <p>
                PathIQ is a platform that helps professionals navigate career transitions with more clarity and confidence. The founders came to Ardorio with a sharp idea and domain insight — but needed a technical co-builder to own the full product.
              </p>
              <p>
                We joined the team at the beginning: shaped the product architecture, built the full-stack application, designed the user flows, and shipped the AI-powered recommendation engine that sits at the core of the platform.
              </p>
              <p>
                From first commit to launch, we moved fast without cutting corners — and the result is a polished, scalable product live at pathiq.com.au.
              </p>
            </div>

            {/* Meta / tags */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <p className="label mb-3">Scope</p>
                <div className="space-y-2">
                  {[
                    'Product Strategy',
                    'Full-Stack Development',
                    'UX & Interface Design',
                    'AI Feature Engineering',
                    'Go-to-Market Support',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-stone-600">
                      <span className="font-mono text-stone-400">—</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="label mb-3">Outcomes</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: '3', label: 'Markets served' },
                    { value: '12', label: 'Career archetypes' },
                    { value: 'Claude', label: 'AI at the core' },
                    { value: 'Live', label: 'pathiq.com.au' },
                  ].map((stat) => (
                    <div key={stat.label} className="p-4 bg-cream-200 rounded-xl">
                      <div className="font-serif text-xl text-ink">{stat.value}</div>
                      <div className="label mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Testimonial */}
          <div className="mt-12 p-8 bg-cream-200 rounded-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8">
                <p className="font-serif text-3xl text-cream-400 leading-none mb-3 select-none">"</p>
                <p className="text-stone-500 italic leading-relaxed">
                  We're currently putting together a full case study with the PathIQ founder. Their testimonial will live here — watch this space.
                </p>
              </div>
              <div className="lg:col-span-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cream-300 flex items-center justify-center shrink-0">
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
                    pathiq.com.au ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="divider" />

      {/* Clevedon Case Study */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Project header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="label">Live</span>
              </div>
              <h2 className="font-serif text-4xl text-ink">Clevedon</h2>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <Link to="/work/clevedon" className="btn-primary">
                Read case study <ArrowUpRight size={14} />
              </Link>
              <a
                href="https://clevedon.app"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                Visit site <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          {/* Main content */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Story */}
            <div className="lg:col-span-7 space-y-5 text-stone-700 leading-relaxed">
              <p>
                Clevedon is an AI task breakdown platform that turns any brief — a Jira ticket, a client scope, an unclear instruction — into a structured, role-specific plan a user can actually start on.
              </p>
              <p>
                We built the product end to end: full-stack Next.js application, AI breakdown engine on Claude, team collaboration features, usage metering, and a three-tier monetisation model from free through to team.
              </p>
              <p>
                The AI layer is built to behave like a knowledgeable colleague — using domain vocabulary specific to the user's profession, learning from their history, and reasoning across a team when distributing work.
              </p>
            </div>

            {/* Meta / tags */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <p className="label mb-3">Scope</p>
                <div className="space-y-2">
                  {[
                    'Product Strategy',
                    'Full-Stack Development',
                    'AI Breakdown Engine',
                    'Team Collaboration',
                    'Subscription Tiers',
                    'Go-to-Market',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-stone-600">
                      <span className="font-mono text-stone-400">—</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="label mb-3">Outcomes</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: '0 → 1', label: 'Full build' },
                    { value: '3 tiers', label: 'Monetisation' },
                    { value: 'Any role', label: 'Domain-aware AI' },
                    { value: 'Live', label: 'In production' },
                  ].map((stat) => (
                    <div key={stat.label} className="p-4 bg-cream-200 rounded-xl">
                      <div className="font-serif text-xl text-ink">{stat.value}</div>
                      <div className="label mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="divider" />

      {/* More coming */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="label mb-2">More case studies</p>
            <p className="text-stone-600 text-sm">Enterprise and AI engagements — coming soon.</p>
          </div>
          <Link to="/contact" className="btn-primary shrink-0">
            Work with us
          </Link>
        </div>
      </div>
    </div>
  )
}
