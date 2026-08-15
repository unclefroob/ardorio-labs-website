import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import AdminNav from '../../components/admin/AdminNav'
import type { ClientProject } from '../../types/dashboard'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function AdminClientNew() {
  const navigate = useNavigate()
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Track manual slug edits so typing the client name stops overwriting them
  function handleClientName(value: string) {
    setClientName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  function handleSlug(value: string) {
    setSlugEdited(true)
    setSlug(value)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const finalSlug = slugify(slug)
    if (!finalSlug) { setError('Slug is required'); return }
    setError('')
    setSaving(true)
    try {
      const created = await apiFetch<ClientProject>('/clients', {
        method: 'POST',
        body: JSON.stringify({
          slug: finalSlug,
          clientName: clientName.trim(),
          projectName: projectName.trim(),
          description: description.trim(),
          lastUpdated: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
          // Optional at creation — the rest of the billing block is filled in
          // on the client's settings tab, and is only required to send an invoice.
          billing: billingEmail.trim() ? { email: billingEmail.trim() } : undefined,
          milestones: [],
          tickets: [],
          notes: [],
        }),
      })
      navigate(`/admin/${created.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client')
      setSaving(false)
    }
  }


  const inputCls = "w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"

  return (
    <div className="min-h-screen bg-cream-100">
      <AdminNav breadcrumb="admin / new" />

      <div className="max-w-xl mx-auto px-6 py-12">
        <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
          &larr; All projects
        </Link>

        <h1 className="font-serif text-3xl text-ink mt-6 mb-1">New client</h1>
        <p className="text-stone-500 text-sm mb-8">Create a client project with an empty dashboard.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label block mb-1.5">Client name</label>
            <input
              type="text"
              required
              value={clientName}
              onChange={e => handleClientName(e.target.value)}
              className={inputCls}
              placeholder="Acme Group"
            />
          </div>
          <div>
            <label className="label block mb-1.5">Project name</label>
            <input
              type="text"
              required
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              className={inputCls}
              placeholder="Customer portal rebuild"
            />
          </div>
          <div>
            <label className="label block mb-1.5">Slug</label>
            <input
              type="text"
              required
              value={slug}
              onChange={e => handleSlug(e.target.value)}
              className={`${inputCls} font-mono`}
              placeholder="acme-group"
            />
            <p className="font-mono text-xs text-stone-400 mt-1.5">
              Dashboard will live at ardorio.co/{slugify(slug) || '...'}
            </p>
          </div>
          <div>
            <label className="label block mb-1.5">Description</label>
            <textarea
              required
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="One or two sentences shown on the client dashboard."
            />
          </div>

          <div>
            <label className="label block mb-1.5">Billing email <span className="text-stone-400 font-normal">(optional)</span></label>
            <input
              type="email"
              value={billingEmail}
              onChange={e => setBillingEmail(e.target.value)}
              className={inputCls}
              placeholder="accounts@acmegroup.com"
            />
            <p className="font-mono text-xs text-stone-400 mt-1.5">
              Where invoices are sent. Can be added later, but is required before sending one.
            </p>
          </div>

          {error && <p className="font-mono text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Creating...' : 'Create client'}
            </button>
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
