import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/apiClient'
import Logo from '../../components/Logo'
import type { ClientBilling } from '../../types/dashboard'

/**
 * Clients as billing records: who you invoice, where invoices go, and what
 * they owe. Deliberately separate from /admin/:slug, which is the project
 * dashboard — a client you only bill has no tickets or milestones, and
 * shouldn't need a project invented for them.
 */

interface ClientSummary {
  slug: string
  clientName: string
  projectName: string
  billing: Required<ClientBilling>
  invoiceCount: number
  outstandingCents: number
  outstandingFormatted: string
  overdueCount: number
}

const fieldCls = 'bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors'
const inputCls = `w-full ${fieldCls}`

function slugify(input: string): string {
  return input.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
}

const emptyBilling = { email: '', contactName: '', abn: '', address: '' }

export default function AdminClients() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ clientName: '', ...emptyBilling })
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({ clientName: '', slug: '', slugEdited: false, ...emptyBilling })

  function load() {
    return apiFetch<ClientSummary[]>('/clients/billing-summary')
      .then(setClients)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function startEdit(c: ClientSummary) {
    setEditing(c.slug)
    setNotice(''); setError('')
    setForm({ clientName: c.clientName, ...c.billing })
  }

  async function saveEdit(slug: string) {
    setSaving(true); setError('')
    try {
      // Two calls by design: billing lives behind its own admin-only endpoint,
      // because the client GET is public and must never carry it.
      await apiFetch(`/clients/${slug}/billing`, {
        method: 'PUT',
        body: JSON.stringify({
          email: form.email, contactName: form.contactName, abn: form.abn, address: form.address,
        }),
      })
      await apiFetch(`/clients/${slug}`, {
        method: 'PUT',
        body: JSON.stringify({ clientName: form.clientName.trim() }),
      })
      setEditing(null)
      setNotice('Client saved.')
      setTimeout(() => setNotice(''), 2500)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the client')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const slug = slugify(newForm.slug || newForm.clientName)
    if (!slug) { setError('A client name is required'); return }
    setSaving(true); setError('')
    try {
      // No project name or description: a billing-only client has neither, and
      // the API no longer requires them.
      await apiFetch('/clients', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          clientName: newForm.clientName.trim(),
          lastUpdated: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
          billing: {
            email: newForm.email.trim(), contactName: newForm.contactName.trim(),
            abn: newForm.abn.trim(), address: newForm.address.trim(),
          },
          milestones: [], tickets: [], notes: [],
        }),
      })
      setCreating(false)
      setNewForm({ clientName: '', slug: '', slugEdited: false, ...emptyBilling })
      setNotice('Client added.')
      setTimeout(() => setNotice(''), 2500)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the client')
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() { logout(); navigate('/admin/login') }

  const totalOutstanding = clients.reduce((sum, c) => sum + c.outstandingCents, 0)

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin / clients</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin/invoices" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
          &larr; Invoices
        </Link>

        <div className="flex items-end justify-between mt-6 mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">Clients</h1>
            <p className="text-stone-500 text-sm">
              {totalOutstanding > 0
                ? `${(totalOutstanding / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })} outstanding across all clients.`
                : 'Who you invoice, and where those invoices go.'}
            </p>
          </div>
          {!creating && (
            <button onClick={() => { setCreating(true); setError('') }} className="btn-primary">
              New client
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="bg-cream-200 border border-cream-300 rounded-2xl p-6 mb-6 space-y-4">
            <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider">New client</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Client name</label>
                <input
                  autoFocus required className={inputCls} placeholder="Acme Group"
                  value={newForm.clientName}
                  onChange={e => setNewForm(f => ({
                    ...f,
                    clientName: e.target.value,
                    slug: f.slugEdited ? f.slug : slugify(e.target.value),
                  }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Slug</label>
                <input
                  className={`${inputCls} font-mono`} placeholder="acme-group"
                  value={newForm.slug}
                  onChange={e => setNewForm(f => ({ ...f, slug: e.target.value, slugEdited: true }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Billing email</label>
                <input
                  type="email" className={inputCls} placeholder="accounts@acme.com"
                  value={newForm.email}
                  onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Billing contact</label>
                <input
                  className={inputCls} placeholder="Dana Smith"
                  value={newForm.contactName}
                  onChange={e => setNewForm(f => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">ABN</label>
                <input
                  className={`${inputCls} font-mono`} placeholder="12 345 678 901"
                  value={newForm.abn}
                  onChange={e => setNewForm(f => ({ ...f, abn: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Billing address</label>
                <input
                  className={inputCls} placeholder="Level 1, 100 Example St"
                  value={newForm.address}
                  onChange={e => setNewForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>
            <p className="font-mono text-xs text-stone-400">
              No project name needed. Add a project dashboard later from the client page if this
              client ever needs one.
            </p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Adding...' : 'Add client'}
              </button>
              <button
                type="button" onClick={() => { setCreating(false); setError('') }}
                className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && <p className="font-mono text-xs text-red-500 mb-4">{error}</p>}
        {notice && <p className="font-mono text-xs text-emerald-600 mb-4">{notice}</p>}

        {loading && <p className="font-mono text-xs text-stone-400 animate-pulse">Loading clients...</p>}

        {!loading && clients.length === 0 && !creating && (
          <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
            <p className="text-stone-400 text-sm">No clients yet.</p>
          </div>
        )}

        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.slug} className="bg-cream-200 border border-cream-300 rounded-2xl px-6 py-4">
              {editing === c.slug ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label block mb-1.5">Client name</label>
                      <input
                        className={inputCls} value={form.clientName}
                        onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label block mb-1.5">Billing email</label>
                      <input
                        type="email" className={inputCls} value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label block mb-1.5">Billing contact</label>
                      <input
                        className={inputCls} value={form.contactName}
                        onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label block mb-1.5">ABN</label>
                      <input
                        className={`${inputCls} font-mono`} value={form.abn}
                        onChange={e => setForm(f => ({ ...f, abn: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="label block mb-1.5">Billing address</label>
                      <input
                        className={inputCls} value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => saveEdit(c.slug)} disabled={saving} className="btn-primary disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{c.clientName}</p>
                    <p className="font-mono text-xs text-stone-400 mt-1 truncate">
                      {c.billing.email || <span className="text-amber-600">No billing email — cannot be invoiced</span>}
                    </p>
                    {c.billing.abn && (
                      <p className="font-mono text-xs text-stone-400 mt-0.5">ABN {c.billing.abn}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm text-ink">
                      {c.outstandingCents > 0 ? c.outstandingFormatted : '—'}
                    </p>
                    <p className="font-mono text-xs text-stone-400">
                      {c.invoiceCount === 0
                        ? 'No invoices'
                        : `${c.invoiceCount} invoice${c.invoiceCount === 1 ? '' : 's'}`}
                      {c.overdueCount > 0 && <span className="text-red-500"> · {c.overdueCount} overdue</span>}
                    </p>
                    <div className="flex items-center justify-end gap-3 mt-2">
                      <button
                        onClick={() => startEdit(c)}
                        className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
                      >
                        Edit
                      </button>
                      {/* The project dashboard, for clients that have one. */}
                      <Link
                        to={`/admin/${c.slug}`}
                        className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
                      >
                        {c.projectName ? 'Project' : 'Dashboard'}
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
