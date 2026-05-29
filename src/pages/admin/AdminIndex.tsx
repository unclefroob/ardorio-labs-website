import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/apiClient'
import Logo from '../../components/Logo'
import type { ClientProject } from '../../types/dashboard'

export default function AdminIndex() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<ClientProject[]>('/clients')
      .then(setClients)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Client projects</h1>
            <p className="text-stone-500 text-sm">Manage dashboards and project status.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin/buxton" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2">
              Buxton
            </Link>
            <Link to="/admin/newsroom" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2">
              Newsroom
            </Link>
            <Link to="/admin/staff" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2">
              Staff
            </Link>
            <Link to="/admin/users" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors border border-cream-300 rounded-lg px-3 py-2">
              Client users
            </Link>
            <Link to="/admin/new" className="btn-primary">
              New client
            </Link>
          </div>
        </div>

        {loading && (
          <p className="font-mono text-xs text-stone-400 animate-pulse">Loading clients...</p>
        )}

        {error && (
          <p className="font-mono text-xs text-red-500">{error}</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
            <p className="text-stone-400 text-sm">No clients yet.</p>
          </div>
        )}

        {!loading && clients.length > 0 && (
          <div className="grid gap-3">
            {clients.map(client => {
              const done = client.tickets.filter(t => t.status === 'done').length
              const total = client.tickets.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <Link
                  key={client.slug}
                  to={`/admin/${client.slug}`}
                  className="flex items-center justify-between bg-cream-200 border border-cream-300 rounded-2xl px-6 py-4 hover:border-stone-400 transition-colors group"
                >
                  <div>
                    <p className="font-medium text-ink group-hover:underline">{client.clientName}</p>
                    <p className="text-stone-400 text-sm mt-0.5">{client.projectName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-ink">{pct}%</p>
                    <p className="font-mono text-xs text-stone-400">{done}/{total} done</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
