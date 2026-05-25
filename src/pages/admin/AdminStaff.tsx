import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/apiClient'
import Logo from '../../components/Logo'

interface AdminUser {
  _id: string
  email: string
}

export default function AdminStaff() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ username: '', password: '' })

  useEffect(() => {
    apiFetch<AdminUser[]>('/admin-users')
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function upsert() {
    if (!form.username.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        const body: Record<string, string> = {}
        if (form.username) body.username = form.username
        if (form.password) body.password = form.password
        const updated = await apiFetch<AdminUser>(`/admin-users/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        setUsers(u => u.map(x => x._id === editingId ? updated : x))
        flash('Saved.')
      } else {
        if (!form.password) { flash('Password is required'); return }
        const created = await apiFetch<AdminUser>('/admin-users', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        setUsers(u => [...u, created])
        flash('Admin user created.')
      }
      setForm({ username: '', password: '' })
      setEditingId(null)
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this admin user?')) return
    try {
      await apiFetch(`/admin-users/${id}`, { method: 'DELETE' })
      setUsers(u => u.filter(x => x._id !== id))
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  function startEdit(user: AdminUser) {
    setEditingId(user._id)
    setForm({ username: user.email, password: '' })
  }

  const inputCls = "w-full bg-cream-200 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin /</span>
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">clients</Link>
            <span className="font-mono text-xs text-stone-400">/ staff</span>
          </div>
          <button onClick={() => { logout(); navigate('/admin/login') }} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Admin users</h1>
            <p className="text-stone-500 text-sm">Manage staff access to the admin dashboard.</p>
          </div>
          {msg && <span className="font-mono text-xs text-stone-500">{msg}</span>}
        </div>

        {loading && <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>}
        {error && <p className="font-mono text-xs text-red-500">{error}</p>}

        {!loading && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-4">
              <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider">
                {editingId ? 'Edit admin user' : 'New admin user'}
              </h2>

              <div>
                <label className="label block mb-1.5">Username</label>
                <input
                  className={inputCls}
                  placeholder="e.g. ryan"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                />
              </div>

              <div>
                <label className="label block mb-1.5">
                  {editingId ? 'New password' : 'Password'}{' '}
                  {editingId && <span className="text-stone-400">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={upsert} disabled={saving} className="btn-primary disabled:opacity-50">
                  {editingId ? 'Update' : 'Create'}
                </button>
                {editingId && (
                  <button
                    onClick={() => { setEditingId(null); setForm({ username: '', password: '' }) }}
                    className="font-mono text-xs text-stone-400 hover:text-ink transition-colors px-3"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* User list */}
            <div className="space-y-3">
              {users.length === 0 && (
                <div className="text-center py-16 border border-dashed border-cream-300 rounded-2xl">
                  <p className="text-stone-400 text-sm">No admin users found.</p>
                </div>
              )}
              {users.map(user => (
                <div key={user._id} className="flex items-center justify-between bg-cream-200 border border-cream-300 rounded-2xl px-5 py-4">
                  <p className="font-medium text-ink">{user.email}</p>
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(user)} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">Edit</button>
                    <button onClick={() => deleteUser(user._id)} className="font-mono text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
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
