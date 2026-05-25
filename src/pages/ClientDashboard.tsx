import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ClientProject, Comment, Note } from '../types/dashboard'
import ClientHeader from '../components/dashboard/ClientHeader'
import StatusBoard from '../components/dashboard/StatusBoard'
import ProjectNotes from '../components/dashboard/ProjectNotes'
import { useClientAuth } from '../context/ClientAuthContext'
import { useAuth } from '../context/AuthContext'
import { DashboardContext } from '../context/DashboardContext'

const API = import.meta.env.VITE_API_URL

export default function ClientDashboard() {
  const { slug } = useParams<{ slug: string }>()
  const { token: adminToken } = useAuth()
  const { token: clientToken, assignedProjects } = useClientAuth()
  const [client, setClient] = useState<ClientProject | null>(null)
  const [status, setStatus] = useState<'loading' | 'not-found' | 'error' | 'ok'>('loading')
  const [signingOff, setSigningOff] = useState<string | null>(null)

  const isAssignedClient = !!clientToken && assignedProjects.includes(slug ?? '')
  const isAdmin = !!adminToken
  const canInteract = isAssignedClient || isAdmin
  const canSignOff = isAssignedClient
  const authToken = adminToken ?? clientToken

  useEffect(() => {
    if (!slug) { setStatus('not-found'); return }
    setStatus('loading')
    fetch(`${API}/clients/${slug}`)
      .then(res => {
        if (res.status === 404) { setStatus('not-found'); return null }
        if (!res.ok) throw new Error(`API error ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data) {
          const project = data as ClientProject
          if (!project.notes) project.notes = []
          project.tickets.forEach(t => { if (!t.comments) t.comments = [] })
          setClient(project)
          setStatus('ok')
        }
      })
      .catch(() => setStatus('error'))
  }, [slug])

  async function handleSignOff(milestoneId: string) {
    if (!slug || !authToken) return
    setSigningOff(milestoneId)
    try {
      const res = await fetch(`${API}/clients/${slug}/milestones/${milestoneId}/sign-off`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!res.ok) throw new Error()
      const updated = await res.json() as ClientProject
      if (!updated.notes) updated.notes = client?.notes ?? []
      updated.tickets.forEach(t => { if (!t.comments) t.comments = [] })
      setClient(updated)
    } finally {
      setSigningOff(null)
    }
  }

  async function handleAddComment(ticketId: string, content: string): Promise<Comment[]> {
    if (!slug || !authToken) return []
    const res = await fetch(`${API}/clients/${slug}/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Failed to post comment')
    }
    return res.json() as Promise<Comment[]>
  }

  function handleCommentsUpdate(ticketId: string, comments: Comment[]) {
    setClient(c => c ? {
      ...c,
      tickets: c.tickets.map(t => t.id === ticketId ? { ...t, comments } : t),
    } : c)
  }

  async function handleAddNote(content: string) {
    if (!slug || !authToken) return
    const res = await fetch(`${API}/clients/${slug}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Failed to save note')
    }
    const notes: Note[] = await res.json()
    setClient(c => c ? { ...c, notes } : c)
  }

  if (status === 'loading') return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <p className="font-mono text-xs text-stone-400 animate-pulse">Loading...</p>
    </div>
  )

  if (status === 'not-found') return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <p className="label mb-4">404</p>
      <h1 className="font-serif text-4xl text-ink mb-3">We can't find that project.</h1>
      <p className="text-stone-600 text-sm max-w-sm">
        If you're a client, check your URL or contact your Ardorio project lead.
      </p>
      <a href="https://ardorio.co" className="btn-ghost mt-8">Back to ardorio.co</a>
    </div>
  )

  if (status === 'error') return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <p className="label mb-4">Error</p>
      <h1 className="font-serif text-3xl text-ink mb-3">Something went wrong.</h1>
      <p className="text-stone-600 text-sm max-w-sm">We couldn't load this project right now. Please try again.</p>
    </div>
  )

  return (
    <DashboardContext.Provider value={{ canInteract, addComment: handleAddComment }}>
      <div className="pt-14">
        <div className="divider" />
        <ClientHeader client={client!} />
        <StatusBoard
          tickets={client!.tickets}
          milestones={client!.milestones}
          canSignOff={canSignOff}
          onSignOff={handleSignOff}
          signingOff={signingOff}
          onCommentsUpdate={handleCommentsUpdate}
        />
        {canInteract && (
          <>
            <div className="divider" />
            <ProjectNotes notes={client!.notes} onAdd={handleAddNote} />
          </>
        )}
      </div>
    </DashboardContext.Provider>
  )
}
