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

interface ModalState {
  open: boolean
  editingId: string | null
  username: string
  password: string
  assignedProjects: string[]
}

const emptyModal: ModalState = { open: false, editingId: null, username: '', password: '', assignedProjects: [] }

export default function AdminUsers() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<ClientUser[]>([])
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [modal, setModal] = useState<ModalState>(emptyModal)

  useEffect(() => {
    Promise.all([
      apiFetch<ClientUser[]>('/client-users'),
      apiFetch<ClientProject[]>('/clients'),
    ]).then(([u, p]) => { setUsers(u); setProjects(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  function openCreate() { setModal({ ...emptyModal, open: true }) }
  function openEdit(u: ClientUser) { setModal({ open: true, editingId: u._id, username: u.username, password: '', assignedProjects: [...u.assignedProjects] }) }
  function closeModal() { setModal(emptyModal) }

  function toggleProject(slug: string) {
    setModal(m => ({
      ...m,
      assignedProjects: m.assignedProjects.includes(slug)
        ? m.assignedProjects.filter(s => s !== slug)
        : [...m.assignedProjects, slug],
    }))
  }

  async function save() {
    if (!modal.username.trim()) return
    setSaving(true)
    try {
      if (modal.editingId) {
        const body: Record<string, unknown> = { assignedProjects: modal.assignedProjects }
        if (modal.username) body.username = modal.username
        if (modal.password) body.password = modal.password
        const updated = await apiFetch<ClientUser>(`/client-users/${modal.editingId}`, {
          method: 'PUT', body: JSON.stringify(body),
        })
        setUsers(u => u.map(x => x._id === modal.editingId ? updated : x))
        flash('Saved.')
      } else {
        if (!modal.password) { flash('Password is required'); return }
        const created = await apiFetch<ClientUser>('/client-users', {
          method: 'POST', body: JSON.stringify({ username: modal.username, password: modal.password, assignedProjects: modal.assignedProjects }),
        })
        setUsers(u => [...u, created])
        flash('Client user created.')
      }
      closeModal()
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

  // Group users by project; unassigned at the end
  const byProject: { slug: string; clientName: string; users: ClientUser[] }[] = projects
    .map(p => ({
      slug: p.slug,
      clientName: p.clientName,
      users: users.filter(u => u.assignedProjects.includes(p.slug)),
    }))
    .filter(g => g.users.length > 0)

  const unassigned = users.filter(u => u.assignedProjects.length === 0)

  const inputCls = "w-full bg-cream-100 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"

  function UserRow({ user }: { user: ClientUser }) {
    return (
      <div className="flex items-center justify-between py-3 px-4 bg-cream-200 border border-cream-300 rounded-xl">
        <div>
          <p className="font-medium text-ink text-sm">{user.username}</p>
          {user.assignedProjects.length > 1 && (
            <p className="font-mono text-xs text-stone-400 mt-0.5">
              {user.assignedProjects.join(', ')}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <button onClick={() => openEdit(user)} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">Edit</button>
          <button onClick={() => deleteUser(user._id)} className="font-mono text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin /</span>
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">clients</Link>
            <span className="font-mono text-xs text-stone-400">/ client users</span>
          </div>
          <button onClick={() => { logout(); navigate('/admin/login') }} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Client users</h1>
            <p className="text-stone-500 text-sm">Manage logins and project access for clients.</p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="font-mono text-xs text-stone-500">{msg}</span>}
            <button onClick={openCreate} className="btn-primary">New client user</button>
          </div>
        </div>

        {loading && <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>}
        {error && <p className="font-mono text-xs text-red-500">{error}</p>}

        {!loading && users.length === 0 && (
          <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
            <p className="text-stone-400 text-sm">No client users yet.</p>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div className="space-y-8">
            {byProject.map(group => (
              <div key={group.slug}>
                <p className="font-mono text-xs text-stone-400 uppercase tracking-wider mb-3">{group.clientName}</p>
                <div className="space-y-2">
                  {group.users.map(u => <UserRow key={u._id} user={u} />)}
                </div>
              </div>
            ))}

            {unassigned.length > 0 && (
              <div>
                <p className="font-mono text-xs text-stone-400 uppercase tracking-wider mb-3">Unassigned</p>
                <div className="space-y-2">
                  {unassigned.map(u => <UserRow key={u._id} user={u} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-cream-100 border border-cream-300 rounded-2xl p-8 w-full max-w-sm shadow-xl">
            <h2 className="font-serif text-xl text-ink mb-6">
              {modal.editingId ? 'Edit client user' : 'New client user'}
            </h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="label block mb-1.5">Username</label>
                <input
                  autoFocus
                  className={inputCls}
                  placeholder="e.g. ritchies"
                  value={modal.username}
                  onChange={e => setModal(m => ({ ...m, username: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">
                  Password{modal.editingId && <span className="text-stone-400 ml-1">(leave blank to keep)</span>}
                </label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="••••••••"
                  value={modal.password}
                  onChange={e => setModal(m => ({ ...m, password: e.target.value }))}
                />
              </div>
              {projects.length > 0 && (
                <div>
                  <label className="label block mb-2">Assigned projects</label>
                  <div className="space-y-2">
                    {projects.map(p => (
                      <label key={p.slug} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={modal.assignedProjects.includes(p.slug)}
                          onChange={() => toggleProject(p.slug)}
                          className="accent-ink"
                        />
                        <span className="text-sm text-ink">{p.clientName}</span>
                        <span className="font-mono text-xs text-stone-400">{p.slug}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : modal.editingId ? 'Save changes' : 'Create'}
              </button>
              <button onClick={closeModal} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors px-3">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
