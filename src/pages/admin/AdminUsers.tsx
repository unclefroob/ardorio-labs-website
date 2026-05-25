import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/apiClient'
import Logo from '../../components/Logo'
import type { ClientProject } from '../../types/dashboard'

interface ClientUser {
  _id: string
  username: string
  assignedProjects: string[]
}

export default function AdminUsers() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<ClientUser[]>([])
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ username: '', password: '', assignedProjects: [] as string[] })

  useEffect(() => {
    Promise.all([
      apiFetch<ClientUser[]>('/client-users'),
      apiFetch<ClientProject[]>('/clients'),
    ]).then(([u, p]) => { setUsers(u); setProjects(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function flash(msg: string) {
    setSaveMsg(msg)
    setTimeout(() => setSaveMsg(''), 2500)
  }

  async function upsert() {
    if (!form.username.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        const body: Record<string, unknown> = { assignedProjects: form.assignedProjects }
        if (form.username) body.username = form.username
        if (form.password) body.password = form.password
        const updated = await apiFetch<ClientUser>(`/client-users/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        setUsers(u => u.map(x => x._id === editingId ? updated : x))
        flash('Saved.')
      } else {
        if (!form.password) { flash('Password required'); return }
        const created = await apiFetch<ClientUser>('/client-users', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        setUsers(u => [...u, created])
        flash('User created.')
      }
      setForm({ username: '', password: '', assignedProjects: [] })
      setEditingId(null)
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user?')) return
    await apiFetch(`/client-users/${id}`, { method: 'DELETE' })
    setUsers(u => u.filter(x => x._id !== id))
  }

  function startEdit(user: ClientUser) {
    setEditingId(user._id)
    setForm({ username: user.username, password: '', assignedProjects: [...user.assignedProjects] })
  }

  function toggleProject(slug: string) {
    setForm(f => ({
      ...f,
      assignedProjects: f.assignedProjects.includes(slug)
        ? f.assignedProjects.filter(s => s !== slug)
        : [...f.assignedProjects, slug],
    }))
  }

  const inputCls = "w-full bg-cream-200 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin /</span>
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">clients</Link>
            <span className="font-mono text-xs text-stone-400">/ users</span>
          </div>
          <button onClick={() => { logout(); navigate('/admin/login') }} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Client users</h1>
            <p className="text-stone-500 text-sm">Manage logins and project access for clients.</p>
          </div>
          {saveMsg && <span className="font-mono text-xs text-stone-500">{saveMsg}</span>}
        </div>

        {loading && <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>}
        {error && <p className="font-mono text-xs text-red-500">{error}</p>}

        {!loading && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-4">
              <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider">
                {editingId ? 'Edit user' : 'New user'}
              </h2>

              <div>
                <label className="label block mb-1.5">Username</label>
                <input className={inputCls} placeholder="e.g. ritchies" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>

              <div>
                <label className="label block mb-1.5">{editingId ? 'New password' : 'Password'} {editingId && <span className="text-stone-400">(leave blank to keep current)</span>}</label>
                <input type="password" className={inputCls} placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>

              <div>
                <label className="label block mb-2">Assigned projects</label>
                {projects.length === 0 && <p className="font-mono text-xs text-stone-400">No projects yet.</p>}
                <div className="space-y-2">
                  {projects.map(p => (
                    <label key={p.slug} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.assignedProjects.includes(p.slug)}
                        onChange={() => toggleProject(p.slug)}
                        className="accent-ink"
                      />
                      <span className="text-sm text-ink">{p.clientName}</span>
                      <span className="font-mono text-xs text-stone-400">{p.slug}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={upsert} disabled={saving} className="btn-primary disabled:opacity-50">
                  {editingId ? 'Update user' : 'Create user'}
                </button>
                {editingId && (
                  <button onClick={() => { setEditingId(null); setForm({ username: '', password: '', assignedProjects: [] }) }} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors px-3">
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* User list */}
            <div className="space-y-3">
              {users.length === 0 && (
                <div className="text-center py-16 border border-dashed border-cream-300 rounded-2xl">
                  <p className="text-stone-400 text-sm">No client users yet.</p>
                </div>
              )}
              {users.map(user => (
                <div key={user._id} className="bg-cream-200 border border-cream-300 rounded-2xl px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-ink">{user.username}</p>
                      {user.assignedProjects.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {user.assignedProjects.map(slug => (
                            <span key={slug} className="font-mono text-xs bg-cream-100 border border-cream-300 text-stone-500 rounded-md px-2 py-0.5">{slug}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="font-mono text-xs text-stone-400 mt-1">No projects assigned</p>
                      )}
                    </div>
                    <div className="flex gap-3 ml-4 shrink-0">
                      <button onClick={() => startEdit(user)} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">Edit</button>
                      <button onClick={() => deleteUser(user._id)} className="font-mono text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
