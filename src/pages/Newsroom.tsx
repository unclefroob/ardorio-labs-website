import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type Variants, type Easing } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'
import { news, formatDate, type NewsCategory } from '../data/newsroom'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: EASE },
  }),
}

const CATEGORIES: Array<NewsCategory | 'All'> = ['All', 'Partnership', 'New Work', 'Company']

const categoryColour: Record<NewsCategory, string> = {
  Partnership: 'bg-emerald-50 text-emerald-700',
  'New Work': 'bg-blue-50 text-blue-700',
  Company: 'bg-amber-50 text-amber-700',
}

export default function Newsroom() {
  const [active, setActive] = useState<NewsCategory | 'All'>('All')

  const sorted = [...news].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const filtered = active === 'All' ? sorted : sorted.filter((n) => n.category === active)

  return (
    <div className="pt-14">
      <SEO
        title="Newsroom — Announcements, Partnerships & Updates"
        description="The latest from Ardorio — new partnerships, products we've shipped, and company announcements."
        canonical="/newsroom"
      />

      {/* Header */}
      <div className="divider" />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="label mb-6">Newsroom</p>
            <h1 className="font-serif text-5xl sm:text-6xl text-ink leading-tight">
              What we've<br />
              <em>been up to.</em>
            </h1>
          </div>
          <div className="lg:col-span-5">
            <p className="text-stone-600 leading-relaxed">
              Partnerships, new products, and company announcements — everything happening at Ardorio.
            </p>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Filter bar */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-2">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`px-4 py-1.5 rounded-full font-mono text-xs tracking-wider uppercase transition-colors ${
                active === cat
                  ? 'bg-ink text-cream-100'
                  : 'bg-cream-200 text-stone-600 hover:bg-cream-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* News list */}
      <div className="max-w-6xl mx-auto px-6 pb-20 pt-6">
        {filtered.length === 0 ? (
          <p className="text-stone-500 py-12 text-sm">Nothing here yet — check back soon.</p>
        ) : (
          <div>
            {filtered.map((item, i) => (
              <motion.div
                key={item.slug}
                custom={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
              >
                <Link
                  to={`/newsroom/${item.slug}`}
                  className="group flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-10 py-8 border-b border-cream-300 hover:bg-cream-200 -mx-4 px-4 rounded-lg transition-colors"
                >
                  {/* Date column */}
                  <div className="shrink-0 sm:w-36">
                    <p className="label">{formatDate(item.date)}</p>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-mono tracking-wide mb-3 ${categoryColour[item.category]}`}
                        >
                          {item.category}
                        </span>
                        <h2 className="font-serif text-2xl sm:text-3xl text-ink leading-snug group-hover:text-stone-700 transition-colors">
                          {item.title}
                        </h2>
                        <p className="text-stone-600 text-sm mt-3 leading-relaxed max-w-2xl">
                          {item.excerpt}
                        </p>
                      </div>
                      <ArrowUpRight
                        size={20}
                        className="shrink-0 text-stone-400 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all mt-1"
                      />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
