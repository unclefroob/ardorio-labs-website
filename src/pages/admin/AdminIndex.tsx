import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import AdminNav from '../../components/admin/AdminNav'
import type { ClientProject } from '../../types/dashboard'

export default function AdminIndex() {
  const [clients, setClients] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<ClientProject[]>('/clients')
      .then(setClients)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-cream-100">
      <AdminNav />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Projects</h1>
            <p className="text-stone-500 text-sm">Client project dashboards and status. Billing lives under Clients.</p>
          </div>
          <Link to="/admin/new" className="btn-primary">
            New client
          </Link>
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
