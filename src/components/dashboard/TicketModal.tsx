import { useState, useRef, useEffect } from 'react'
import type { Ticket, Comment } from '../../types/dashboard'
import { useDashboard } from '../../context/DashboardContext'

const statusLabel: Record<Ticket['status'], string> = {
  backlog:      'Backlog',
  'in-progress':'In Development',
  testing:      'Testing',
  'sign-off':   'Awaiting Sign-Off',
  done:         'Done',
}

const priorityColour: Record<Ticket['priority'], string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-stone-300',
}

interface Props {
  ticket: Ticket
  onClose: () => void
  onCommentsUpdate: (ticketId: string, comments: Comment[]) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TicketModal({ ticket, onClose, onCommentsUpdate }: Props) {
  const { canInteract, addComment } = useDashboard()
  const [comments, setComments] = useState<Comment[]>(ticket.comments ?? [])
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync if ticket comments updated externally
  useEffect(() => { setComments(ticket.comments ?? []) }, [ticket.comments])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const updated = await addComment(ticket.id, content)
      setComments(updated)
      onCommentsUpdate(ticket.id, updated)
      setContent('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not post comment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-cream-100 border border-cream-300 rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-cream-300 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs bg-cream-200 text-stone-500 rounded px-1.5 py-0.5">{ticket.horizon}</span>
                <span className="font-mono text-xs bg-cream-200 text-stone-500 rounded-full px-2 py-0.5">{ticket.category}</span>
                <span className="font-mono text-xs text-stone-400">{statusLabel[ticket.status]}</span>
              </div>
              <h2 className="font-serif text-xl text-ink leading-snug">{ticket.title}</h2>
            </div>
            <button onClick={onClose} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors shrink-0 mt-1">✕</button>
          </div>

          {ticket.description && (
            <p className="text-sm text-stone-600 mt-3 leading-relaxed">{ticket.description}</p>
          )}

          <div className="flex items-center gap-1.5 mt-3">
            <span className={`w-1.5 h-1.5 rounded-full ${priorityColour[ticket.priority]}`} />
            <span className="font-mono text-xs text-stone-400 capitalize">{ticket.priority} priority</span>
          </div>
        </div>

        {/* Comment thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {comments.length === 0 && !canInteract && (
            <p className="text-stone-400 text-sm text-center py-6">No comments yet.</p>
          )}
          {comments.length === 0 && canInteract && (
            <p className="text-stone-400 text-sm text-center py-4">No comments yet — be the first.</p>
          )}
          {comments.map(c => (
            <div key={c.id} className={`flex gap-3 ${c.role === 'admin' ? 'flex-row-reverse' : ''}`}>
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-medium ${
                c.role === 'admin' ? 'bg-ink text-cream-100' : 'bg-cream-300 text-ink'
              }`}>
                {c.author[0].toUpperCase()}
              </div>
              <div className={`flex-1 max-w-[85%] ${c.role === 'admin' ? 'items-end' : ''} flex flex-col`}>
                <div className={`rounded-xl px-3 py-2 text-sm ${
                  c.role === 'admin'
                    ? 'bg-ink text-cream-100'
                    : 'bg-cream-200 border border-cream-300 text-ink'
                }`}>
                  {c.content}
                </div>
                <p className="font-mono text-xs text-stone-400 mt-1 px-1">
                  {c.author} · {formatDate(c.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Comment form */}
        {canInteract && (
          <div className="px-6 pb-6 pt-3 border-t border-cream-300 shrink-0">
            {error && <p className="font-mono text-xs text-red-500 mb-2">{error}</p>}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                ref={textareaRef}
                rows={2}
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
                placeholder="Write a comment… (Enter to send)"
                className="flex-1 bg-cream-200 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors resize-none"
              />
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="btn-primary self-end disabled:opacity-40"
              >
                {submitting ? '…' : 'Send'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
