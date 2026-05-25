import { useState } from 'react'
import type { Note } from '../../types/dashboard'

interface Props {
  notes: Note[]
  onAdd: (content: string) => Promise<void>
}

export default function ProjectNotes({ notes, onAdd }: Props) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)
    setError('')
    try {
      await onAdd(content)
      setContent('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save note')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <p className="label mb-6">Notes</p>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Add note form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            rows={4}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Add a note or question for the team…"
            className="w-full bg-cream-200 border border-cream-300 rounded-xl px-4 py-3 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors resize-none"
          />
          {error && <p className="font-mono text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="btn-primary disabled:opacity-40"
          >
            {loading ? 'Saving…' : 'Add note'}
          </button>
        </form>

        {/* Note history */}
        <div className="space-y-3">
          {notes.length === 0 && (
            <p className="text-stone-400 text-sm">No notes yet.</p>
          )}
          {[...notes].reverse().map(note => (
            <div key={note.id} className="bg-cream-200 border border-cream-300 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-medium text-ink">{note.author}</span>
                <span className="font-mono text-xs text-stone-400">{formatDate(note.createdAt)}</span>
              </div>
              <p className="text-sm text-stone-600 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
