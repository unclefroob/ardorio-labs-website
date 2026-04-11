import { useParams, Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'
import { getNewsItem, news, formatDate, type NewsCategory } from '../data/newsroom'

const categoryColour: Record<NewsCategory, string> = {
  Partnership: 'bg-emerald-50 text-emerald-700',
  'New Work': 'bg-blue-50 text-blue-700',
  Company: 'bg-amber-50 text-amber-700',
}

export default function NewsroomArticle() {
  const { slug } = useParams<{ slug: string }>()
  const item = getNewsItem(slug ?? '')

  if (!item) {
    return <Navigate to="/newsroom" replace />
  }

  // Find adjacent item (next older)
  const sorted = [...news].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const currentIndex = sorted.findIndex((n) => n.slug === item.slug)
  const next = sorted[currentIndex + 1] ?? null

  return (
    <div className="pt-14">
      <SEO
        title={item.title}
        description={item.excerpt}
        canonical={`/newsroom/${item.slug}`}
        type="article"
      />

      <div className="divider" />

      {/* Back nav */}
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <Link
          to="/newsroom"
          className="inline-flex items-center gap-2 label hover:text-ink transition-colors group"
        >
          <ArrowLeft
            size={12}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          All news
        </Link>
      </div>

      {/* Article header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-6xl mx-auto px-6 pt-10 pb-12"
      >
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-mono tracking-wide ${categoryColour[item.category]}`}
            >
              {item.category}
            </span>
            <span className="label">{formatDate(item.date)}</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight mb-6">
            {item.title}
          </h1>

          <p className="text-stone-600 text-lg leading-relaxed border-l-2 border-cream-300 pl-5">
            {item.excerpt}
          </p>
        </div>
      </motion.div>

      <div className="divider" />

      {/* Article body */}
      <motion.article
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="max-w-6xl mx-auto px-6 py-14"
      >
        <div
          className="prose-newsroom max-w-3xl text-stone-700 leading-relaxed space-y-5"
          dangerouslySetInnerHTML={{ __html: item.body }}
        />
      </motion.article>

      <div className="divider" />

      {/* Footer nav — next article or back */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          {next ? (
            <div className="flex-1 min-w-0">
              <p className="label mb-2">Up next</p>
              <Link
                to={`/newsroom/${next.slug}`}
                className="group flex items-start gap-3"
              >
                <h3 className="font-serif text-2xl text-ink leading-snug group-hover:text-stone-700 transition-colors max-w-xl">
                  {next.title}
                </h3>
                <ArrowUpRight
                  size={18}
                  className="shrink-0 text-stone-400 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all mt-1"
                />
              </Link>
            </div>
          ) : (
            <div />
          )}

          <Link to="/newsroom" className="btn-ghost shrink-0">
            All news <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
