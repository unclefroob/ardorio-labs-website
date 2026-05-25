import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useClientAuth } from '../context/ClientAuthContext'
import Logo from '../components/Logo'
import type { ClientProject } from '../types/dashboard'

export default function ClientPortal() {
  const { assignedProjects, logout } = useClientAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!assignedProjects.length) { setLoading(false); return }
    Promise.all(
      assignedProjects.map(slug =>
        fetch(`${import.meta.env.VITE_API_URL}/clients/${slug}`).then(r => r.json() as Promise<ClientProject>)
      )
    ).then(setProjects).finally(() => setLoading(false))
  }, [assignedProjects])

  function handleLogout() { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-ink mb-1">Your projects</h1>
        <p className="text-stone-500 text-sm mb-8">Select a project to view its status dashboard.</p>

        {loading && <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>}

        {!loading && projects.length === 0 && (
          <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
            <p className="text-stone-400 text-sm">No projects assigned. Contact your Ardorio project manager.</p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map(project => {
              const done = project.tickets.filter(t => t.status === 'done').length
              const total = project.tickets.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <Link
                  key={project.slug}
                  to={`/${project.slug}`}
                  className="bg-cream-200 border border-cream-300 rounded-2xl px-6 py-5 hover:border-stone-400 transition-colors group"
                >
                  <p className="font-medium text-ink group-hover:underline mb-0.5">{project.clientName}</p>
                  <p className="text-stone-400 text-sm mb-4">{project.projectName}</p>
                  <div className="h-1.5 bg-cream-300 rounded-full overflow-hidden">
                    <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="font-mono text-xs text-stone-400 mt-2">{pct}% complete · {done}/{total} done</p>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
