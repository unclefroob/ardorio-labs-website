import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type Easing } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { listNews, formatDate, type NewsItem } from '../data/newsroom'

const EASE: Easing = [0.25, 0.1, 0.25, 1]

/**
 * Features the most recent published newsroom entry on the homepage.
 * Renders nothing while loading, on error, or when there is no news,
 * so the homepage never shows an empty block.
 */
export default function HomeNewsroom() {
  const [item, setItem] = useState<NewsItem | null>(null)

  useEffect(() => {
    let active = true
    listNews()
      .then((items) => {
        if (!active) return
        const latest = [...items].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0]
        setItem(latest ?? null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  if (!item) return null

  return (
    <>
      <div className="divider" />
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <p className="label">From the newsroom</p>
          <Link to="/newsroom" className="btn-ghost text-xs">
            All news <ArrowUpRight size={12} />
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="bg-cream-200 rounded-2xl overflow-hidden"
        >
          <Link
            to={`/newsroom/${item.slug}`}
            className={`group block ${item.image ? 'grid grid-cols-1 lg:grid-cols-2' : ''}`}
          >
            {item.image && (
              <div className="lg:order-last bg-cream-300/40 flex items-center justify-center p-4 min-h-[14rem] lg:min-h-0">
                <img
                  src={item.image}
                  alt=""
                  className="max-w-full max-h-64 lg:max-h-[26rem] w-auto object-contain rounded-lg"
                  onError={e => {
                    const box = e.currentTarget.parentElement
                    if (box) box.style.display = 'none'
                  }}
                />
              </div>
            )}
            <div className="p-10 lg:p-14 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-4">
                <span className="label text-stone-500">{formatDate(item.date)}</span>
                <span className="w-1 h-1 rounded-full bg-cream-400" aria-hidden />
                <span className="label text-stone-500">{item.category}</span>
              </div>
              <h2 className="font-serif text-3xl lg:text-4xl text-ink leading-snug group-hover:text-stone-700 transition-colors">
                {item.title}
              </h2>
              <p className="text-stone-600 mt-3 leading-relaxed max-w-2xl">{item.excerpt}</p>
              <span className="btn-ghost mt-6 self-start">
                Read article <ArrowUpRight size={14} />
              </span>
            </div>
          </Link>
        </motion.div>
      </section>
    </>
  )
}
