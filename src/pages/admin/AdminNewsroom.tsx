import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Logo from '../../components/Logo'
import { listNews, formatDate, type NewsItem } from '../../data/newsroom'

export default function AdminNewsroom() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listNews({ all: true })
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function handleLogout() { logout(); navigate('/admin/login') }

  const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin /</span>
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">clients</Link>
            <span className="font-mono text-xs text-stone-400">/ newsroom</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Newsroom</h1>
            <p className="text-stone-500 text-sm">Manage announcements, partnerships, and updates.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2">
              Clients
            </Link>
            <Link to="/admin/newsroom/new" className="btn-primary">
              New article
            </Link>
          </div>
        </div>

        {loading && (
          <p className="font-mono text-xs text-stone-400 animate-pulse">Loading…</p>
        )}

        {error && (
          <p className="font-mono text-xs text-red-500">{error}</p>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
            <p className="text-stone-400 text-sm">No articles yet.</p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="grid gap-2">
            {sorted.map(item => (
              <Link
                key={item.slug}
                to={`/admin/newsroom/${item.slug}`}
                className="flex items-center justify-between bg-cream-200 border border-cream-300 rounded-xl px-4 py-3 hover:border-stone-400 transition-colors group gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-stone-400 uppercase tracking-wide">{item.category}</span>
                    {item.published === false && (
                      <span className="font-mono text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Draft</span>
                    )}
                  </div>
                  <p className="text-ink truncate group-hover:underline">{item.title}</p>
                </div>
                <p className="font-mono text-xs text-stone-400 shrink-0">{formatDate(item.date)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
