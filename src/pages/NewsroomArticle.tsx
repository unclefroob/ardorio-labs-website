import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import SEO from '../components/SEO'
import { listNews, formatDate, type NewsCategory, type NewsItem } from '../data/newsroom'
import { renderMarkdown } from '../lib/markdown'

const categoryColour: Record<NewsCategory, string> = {
  Partnership: 'bg-emerald-50 text-emerald-700',
  'New Work': 'bg-blue-50 text-blue-700',
  Company: 'bg-amber-50 text-amber-700',
}

export default function NewsroomArticle() {
  const { slug } = useParams<{ slug: string }>()
  const [items, setItems] = useState<NewsItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listNews()
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  if (error) {
    return (
      <div className="pt-32 max-w-6xl mx-auto px-6">
        <p className="font-mono text-xs text-red-500">{error}</p>
      </div>
    )
  }

  if (items === null) {
    return (
      <div className="pt-32 max-w-6xl mx-auto px-6">
        <p className="font-mono text-xs text-stone-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  const item = items.find(n => n.slug === slug)
  if (!item) return <Navigate to="/newsroom" replace />

  const sorted = [...items].sort(
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
        ogImage={item.image || undefined}
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

      {/* Hero image */}
      {item.image && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="max-w-6xl mx-auto px-6 pb-14"
        >
          <img
            src={item.image}
            alt=""
            className="block mx-auto w-auto max-w-full max-h-[36rem] rounded-2xl border border-cream-300"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </motion.div>
      )}

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
          dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }}
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
