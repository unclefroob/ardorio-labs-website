import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import Logo from '../../components/Logo'
import { useAuth } from '../../context/AuthContext'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type {
  ClientProject, ClientBilling, Ticket, Milestone,
  TicketStatus, TicketPriority, TicketCategory, TicketHorizon, MilestoneStatus
} from '../../types/dashboard'

const STATUSES: TicketStatus[] = ['backlog', 'in-progress', 'testing', 'sign-off', 'done']
const PRIORITIES: TicketPriority[] = ['high', 'medium', 'low']
const CATEGORIES: TicketCategory[] = ['Feature', 'Bug', 'Design', 'Infrastructure']
const HORIZONS: TicketHorizon[] = ['infra', 'H1', 'H2', 'H3']
const MILESTONE_STATUSES: MilestoneStatus[] = ['pending', 'awaiting-approval', 'signed-off']

type Section = 'tickets' | 'milestones' | 'settings'

function GripHandle(props: React.HTMLAttributes<SVGSVGElement>) {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" {...props}>
      <circle cx="2" cy="3" r="1.5" />
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="13" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  )
}

interface TicketRowProps {
  ticket: Ticket
  onEdit: (t: Ticket) => void
}

function SortableTicketRow({ ticket, onEdit }: TicketRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center bg-cream-200 border border-cream-300 rounded-xl px-4 py-3 gap-3 ${isDragging ? 'shadow-lg z-10 relative' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-stone-300 hover:text-stone-500 transition-colors cursor-grab active:cursor-grabbing touch-none shrink-0"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripHandle />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">{ticket.title}</p>
        <p className="font-mono text-xs text-stone-400 mt-0.5">{ticket.status} · {ticket.category} · {ticket.priority}</p>
      </div>
      <div className="flex gap-3 shrink-0">
        <button onClick={() => onEdit(ticket)} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">Edit</button>
      </div>
    </div>
  )
}

export default function AdminClient() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [project, setProject] = useState<ClientProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [section, setSection] = useState<Section>('tickets')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [billing, setBilling] = useState<ClientBilling>({})
  const [billingSaving, setBillingSaving] = useState(false)
  const [billingMsg, setBillingMsg] = useState('')

  // Ticket modal
  const [ticketModalOpen, setTicketModalOpen] = useState(false)
  const [ticketForm, setTicketForm] = useState<Omit<Ticket, 'id'>>({
    title: '', description: '', status: 'backlog', priority: 'medium', category: 'Feature', horizon: 'H1', comments: [],
  })
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null)

  // Milestone form
  const [milestoneForm, setMilestoneForm] = useState<Omit<Milestone, 'id'>>({
    horizon: 'H1', label: '', description: '', approver: '', status: 'pending', date: '',
  })
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    apiFetch<ClientProject>(`/clients/${slug}`)
      .then(setProject)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [slug])

  // Billing has its own endpoint (the client GET above is public and strips it).
  useEffect(() => {
    if (!slug) return
    apiFetch<ClientBilling>(`/clients/${slug}/billing`)
      .then(setBilling)
      .catch(() => { /* a client with no billing yet is normal, not an error */ })
  }, [slug])

  async function saveBilling() {
    setBillingSaving(true)
    setBillingMsg('')
    try {
      const saved = await apiFetch<ClientBilling>(`/clients/${slug}/billing`, {
        method: 'PUT',
        body: JSON.stringify(billing),
      })
      setBilling(saved)
      setBillingMsg('Billing saved.')
      setTimeout(() => setBillingMsg(''), 2000)
    } catch (e: unknown) {
      setBillingMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBillingSaving(false)
    }
  }

  async function saveProject(updated: ClientProject) {
    setSaving(true)
    setSaveMsg('')
    try {
      const result = await apiFetch<ClientProject>(`/clients/${slug}`, {
        method: 'PUT',
        body: JSON.stringify(updated),
      })
      setProject(result)
      setSaveMsg('Saved.')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleDragEnd(event: DragEndEvent, horizon: TicketHorizon) {
    const { active, over } = event
    if (!over || active.id === over.id || !project) return

    const hTickets = project.tickets.filter(t => t.horizon === horizon)
    const oldIndex = hTickets.findIndex(t => t.id === active.id)
    const newIndex = hTickets.findIndex(t => t.id === over.id)
    const reordered = arrayMove(hTickets, oldIndex, newIndex)

    let ri = 0
    const newTickets = project.tickets.map(t => t.horizon === horizon ? reordered[ri++] : t)
    saveProject({ ...project, tickets: newTickets })
  }

  function openNewTicket() {
    setEditingTicketId(null)
    setTicketForm({ title: '', description: '', status: 'backlog', priority: 'medium', category: 'Feature', horizon: 'H1', comments: [] })
    setTicketModalOpen(true)
  }

  function openEditTicket(ticket: Ticket) {
    setEditingTicketId(ticket.id)
    setTicketForm({ title: ticket.title, description: ticket.description, status: ticket.status, priority: ticket.priority, category: ticket.category, horizon: ticket.horizon, comments: ticket.comments ?? [] })
    setTicketModalOpen(true)
  }

  function closeTicketModal() {
    setTicketModalOpen(false)
    setEditingTicketId(null)
  }

  function upsertTicket() {
    if (!project || !ticketForm.title.trim()) return
    const tickets = editingTicketId
      ? project.tickets.map(t => t.id === editingTicketId ? { ...ticketForm, id: editingTicketId } : t)
      : [...project.tickets, { ...ticketForm, id: crypto.randomUUID() }]
    saveProject({ ...project, tickets })
    closeTicketModal()
  }

  function deleteTicket(id: string) {
    if (!project) return
    saveProject({ ...project, tickets: project.tickets.filter(t => t.id !== id) })
  }

  function upsertMilestone() {
    if (!project || !milestoneForm.label.trim()) return
    const milestones = editingMilestoneId
      ? project.milestones.map(m => m.id === editingMilestoneId ? { ...milestoneForm, id: editingMilestoneId } : m)
      : [...project.milestones, { ...milestoneForm, id: crypto.randomUUID() }]
    saveProject({ ...project, milestones })
    setMilestoneForm({ horizon: 'H1', label: '', description: '', approver: '', status: 'pending', date: '' })
    setEditingMilestoneId(null)
  }

  function deleteMilestone(id: string) {
    if (!project) return
    saveProject({ ...project, milestones: project.milestones.filter(m => m.id !== id) })
  }

  function editMilestone(m: Milestone) {
    setEditingMilestoneId(m.id)
    setMilestoneForm({ horizon: m.horizon, label: m.label, description: m.description, approver: m.approver, status: m.status, date: m.date ?? '' })
    setSection('milestones')
  }

  async function deleteClient() {
    if (!project) return
    if (!confirm(`Delete ${project.clientName}? This cannot be undone.`)) return
    await apiFetch(`/clients/${slug}`, { method: 'DELETE' })
    navigate('/admin')
  }

  function handleLogout() { logout(); navigate('/admin/login') }

  if (loading) return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>
    </div>
  )

  if (error || !project) return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <p className="font-mono text-xs text-red-500">{error || 'Project not found'}</p>
    </div>
  )

  const inputCls = "w-full bg-cream-200 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors"
  const selectCls = inputCls

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin /</span>
            <Link to="/admin" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">clients</Link>
            <span className="font-mono text-xs text-stone-400">/ {slug}</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">{project.clientName}</h1>
            <p className="text-stone-500 text-sm">{project.projectName}</p>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="font-mono text-xs text-stone-500">{saveMsg}</span>}
            <Link to={`/${slug}`} target="_blank" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
              View dashboard ↗
            </Link>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 mb-8 border-b border-cream-300">
          {(['tickets', 'milestones', 'settings'] as Section[]).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`font-mono text-xs px-4 py-2 -mb-px border-b-2 transition-colors capitalize ${
                section === s ? 'border-ink text-ink' : 'border-transparent text-stone-400 hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* ── TICKETS ── */}
        {section === 'tickets' && (
          <div className="space-y-8">
            <div className="flex justify-end">
              <button onClick={openNewTicket} className="btn-primary">New ticket</button>
            </div>

            {project.tickets.length === 0 && (
              <div className="text-center py-24 border border-dashed border-cream-300 rounded-2xl">
                <p className="text-stone-400 text-sm">No tickets yet.</p>
              </div>
            )}

            {/* Ticket list grouped by horizon — each group is independently sortable */}
            {HORIZONS.map(h => {
              const hTickets = project.tickets.filter(t => t.horizon === h)
              if (!hTickets.length) return null
              return (
                <div key={h}>
                  <p className="font-mono text-xs text-stone-400 mb-2 uppercase tracking-wider">{h}</p>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={e => handleDragEnd(e, h)}
                  >
                    <SortableContext items={hTickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="grid gap-2">
                        {hTickets.map(t => (
                          <SortableTicketRow key={t.id} ticket={t} onEdit={openEditTicket} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )
            })}
          </div>
        )}

        {/* ── MILESTONES ── */}
        {section === 'milestones' && (
          <div className="space-y-8">
            <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6">
              <h2 className="font-mono text-xs text-stone-400 mb-4 uppercase tracking-wider">
                {editingMilestoneId ? 'Edit milestone' : 'Add milestone'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input className={inputCls} placeholder="Label (e.g. Horizon 1 Delivery)" value={milestoneForm.label} onChange={e => setMilestoneForm(f => ({ ...f, label: e.target.value }))} />
                <input className={inputCls} placeholder="Description" value={milestoneForm.description} onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))} />
                <input className={inputCls} placeholder="Approver name" value={milestoneForm.approver} onChange={e => setMilestoneForm(f => ({ ...f, approver: e.target.value }))} />
                <input className={inputCls} type="date" value={milestoneForm.date} onChange={e => setMilestoneForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <select className={selectCls} value={milestoneForm.horizon} onChange={e => setMilestoneForm(f => ({ ...f, horizon: e.target.value as TicketHorizon }))}>
                  {HORIZONS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <select className={selectCls} value={milestoneForm.status} onChange={e => setMilestoneForm(f => ({ ...f, status: e.target.value as MilestoneStatus }))}>
                  {MILESTONE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={upsertMilestone} disabled={saving} className="btn-primary disabled:opacity-50">
                  {editingMilestoneId ? 'Update milestone' : 'Add milestone'}
                </button>
                {editingMilestoneId && (
                  <button
                    onClick={() => { setEditingMilestoneId(null); setMilestoneForm({ horizon: 'H1', label: '', description: '', approver: '', status: 'pending', date: '' }) }}
                    className="font-mono text-xs text-stone-400 hover:text-ink transition-colors px-3"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              {project.milestones.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-cream-200 border border-cream-300 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm text-ink">{m.label}</p>
                    <p className="font-mono text-xs text-stone-400 mt-0.5">{m.horizon} · {m.status}{m.date ? ` · ${m.date}` : ''}</p>
                  </div>
                  <div className="flex gap-3 ml-4 shrink-0">
                    <button onClick={() => editMilestone(m)} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">Edit</button>
                    <button onClick={() => deleteMilestone(m.id)} className="font-mono text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {section === 'settings' && (
          <div className="space-y-6 max-w-lg">
            <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-3">
              <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider mb-4">Project details</h2>
              <div>
                <label className="label block mb-1.5">Client name</label>
                <input className={inputCls} value={project.clientName} onChange={e => setProject(p => p ? { ...p, clientName: e.target.value } : p)} />
              </div>
              <div>
                <label className="label block mb-1.5">Project name</label>
                <input className={inputCls} value={project.projectName} onChange={e => setProject(p => p ? { ...p, projectName: e.target.value } : p)} />
              </div>
              <div>
                <label className="label block mb-1.5">Description</label>
                <textarea rows={3} className={inputCls} value={project.description} onChange={e => setProject(p => p ? { ...p, description: e.target.value } : p)} />
              </div>
              <button onClick={() => saveProject(project)} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              {saveMsg && <p className="font-mono text-xs text-stone-500">{saveMsg}</p>}
            </div>

            {/* Billing is loaded and saved on its own endpoint: the client
                GET above is the public one and never carries billing, so
                folding it into saveProject would wipe it on every save. */}
            <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 space-y-3">
              <h2 className="font-mono text-xs text-stone-400 uppercase tracking-wider mb-1">Billing</h2>
              <p className="text-sm text-stone-500 mb-3">
                Used on invoices for this client. The billing email is where invoices are sent.
              </p>
              <div>
                <label className="label block mb-1.5">Billing email</label>
                <input
                  type="email" className={inputCls} placeholder="accounts@client.com"
                  value={billing.email ?? ''}
                  onChange={e => setBilling(b => ({ ...b, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Billing contact</label>
                <input
                  className={inputCls} placeholder="Dana Smith"
                  value={billing.contactName ?? ''}
                  onChange={e => setBilling(b => ({ ...b, contactName: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">ABN</label>
                <input
                  className={`${inputCls} font-mono`} placeholder="12 345 678 901"
                  value={billing.abn ?? ''}
                  onChange={e => setBilling(b => ({ ...b, abn: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Billing address</label>
                <textarea
                  rows={2} className={inputCls} placeholder="Level 1, 100 Example St, Melbourne VIC 3000"
                  value={billing.address ?? ''}
                  onChange={e => setBilling(b => ({ ...b, address: e.target.value }))}
                />
              </div>
              <button onClick={saveBilling} disabled={billingSaving} className="btn-primary disabled:opacity-50">
                {billingSaving ? 'Saving...' : 'Save billing'}
              </button>
              {billingMsg && <p className="font-mono text-xs text-stone-500">{billingMsg}</p>}
            </div>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
              <h2 className="font-mono text-xs text-red-400 uppercase tracking-wider mb-2">Danger zone</h2>
              <p className="text-sm text-stone-500 mb-4">Permanently delete this client and all their project data.</p>
              <button onClick={deleteClient} className="font-mono text-xs text-red-500 border border-red-300 rounded-lg px-4 py-2 hover:bg-red-100 transition-colors">
                Delete client
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ticket modal */}
      {ticketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={closeTicketModal} />
          <div className="relative bg-cream-100 border border-cream-300 rounded-2xl p-8 w-full max-w-lg shadow-xl">
            <h2 className="font-serif text-xl text-ink mb-6">
              {editingTicketId ? 'Edit ticket' : 'New ticket'}
            </h2>
            <div className="space-y-3 mb-6">
              <input
                autoFocus
                className={inputCls}
                placeholder="Title"
                value={ticketForm.title}
                onChange={e => setTicketForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && upsertTicket()}
              />
              <input
                className={inputCls}
                placeholder="Description (optional)"
                value={ticketForm.description}
                onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && upsertTicket()}
              />
              <div className="grid grid-cols-2 gap-3">
                <select className={selectCls} value={ticketForm.horizon} onChange={e => setTicketForm(f => ({ ...f, horizon: e.target.value as TicketHorizon }))}>
                  {HORIZONS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <select className={selectCls} value={ticketForm.status} onChange={e => setTicketForm(f => ({ ...f, status: e.target.value as TicketStatus }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className={selectCls} value={ticketForm.priority} onChange={e => setTicketForm(f => ({ ...f, priority: e.target.value as TicketPriority }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className={selectCls} value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category: e.target.value as TicketCategory }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <button onClick={upsertTicket} disabled={saving} className="btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : editingTicketId ? 'Save changes' : 'Add ticket'}
                </button>
                <button onClick={closeTicketModal} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors px-3">
                  Cancel
                </button>
              </div>
              {editingTicketId && (
                <button
                  onClick={() => { deleteTicket(editingTicketId); closeTicketModal() }}
                  className="font-mono text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
