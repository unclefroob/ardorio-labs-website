import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Logo from '../../components/Logo'
import {
  CATEGORIES,
  createNews,
  deleteNews,
  getNews,
  updateNews,
  uploadNewsImage,
  type NewsCategory,
  type NewsItem,
} from '../../data/newsroom'
import { renderMarkdown } from '../../lib/markdown'

type FormState = {
  slug: string
  date: string
  category: NewsCategory
  title: string
  excerpt: string
  body: string
  image: string
  published: boolean
}

const emptyForm: FormState = {
  slug: '',
  date: new Date().toISOString().slice(0, 10),
  category: 'Company',
  title: '',
  excerpt: '',
  body: '',
  image: '',
  published: true,
}

export default function AdminNewsroomEdit() {
  const { slug } = useParams<{ slug: string }>()
  const isNew = !slug || slug === 'new'
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [original, setOriginal] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (isNew) return
    getNews(slug!)
      .then(item => {
        setOriginal(item)
        setForm({
          slug: item.slug,
          date: item.date,
          category: item.category,
          title: item.title,
          excerpt: item.excerpt,
          body: item.body,
          image: item.image ?? '',
          published: item.published !== false,
        })
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [isNew, slug])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const { url } = await uploadNewsImage(file)
      setForm(f => ({ ...f, image: url }))
      flash('Image uploaded.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!form.title.trim() || !form.excerpt.trim() || !form.body.trim()) {
      setError('Title, excerpt, and body are required.')
      return
    }
    setError('')
    setSaving(true)
    try {
      if (isNew) {
        const created = await createNews(form)
        flash('Created.')
        navigate(`/admin/newsroom/${created.slug}`, { replace: true })
      } else {
        const updated = await updateNews(original?.slug ?? slug!, form)
        setOriginal(updated)
        setForm(f => ({ ...f, slug: updated.slug }))
        // If slug changed, update the URL
        if (updated.slug !== slug) {
          navigate(`/admin/newsroom/${updated.slug}`, { replace: true })
        }
        flash('Saved.')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!original) return
    if (!confirm(`Delete "${original.title}"? This cannot be undone.`)) return
    try {
      await deleteNews(original.slug)
      navigate('/admin/newsroom')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function handleLogout() { logout(); navigate('/admin/login') }

  if (loading) return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <p className="font-mono text-xs text-stone-400 animate-pulse">Loading…</p>
    </div>
  )

  const inputCls = 'w-full bg-cream-200 border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors'

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="font-mono text-sm font-medium text-ink">ardorio</span>
            <span className="font-mono text-xs text-stone-400 ml-1">/ admin /</span>
            <Link to="/admin/newsroom" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">newsroom</Link>
            <span className="font-mono text-xs text-stone-400">/ {isNew ? 'new' : form.slug || slug}</span>
          </div>
          <button onClick={handleLogout} className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-ink mb-1">
              {isNew ? 'New article' : 'Edit article'}
            </h1>
            <p className="text-stone-500 text-sm">
              {isNew ? 'Draft a new newsroom post.' : 'Update an existing newsroom post.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="font-mono text-xs text-stone-500">{msg}</span>}
            {!isNew && original && (
              <Link to={`/newsroom/${original.slug}`} target="_blank" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors">
                View public ↗
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="font-mono text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: form */}
          <div className="space-y-4">
            <div>
              <label className="label block mb-1.5">Title</label>
              <input
                className={inputCls}
                placeholder="Article title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Category</label>
                <select
                  className={inputCls}
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as NewsCategory }))}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label block mb-1.5">
                Slug {isNew && <span className="text-stone-400 normal-case font-sans">(optional — derived from title)</span>}
              </label>
              <input
                className={inputCls}
                placeholder="article-slug"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              />
            </div>

            <div>
              <label className="label block mb-1.5">
                Image URL <span className="text-stone-400 normal-case font-sans">(optional — hero image, also used for social sharing)</span>
              </label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="https://… or upload a file"
                  value={form.image}
                  onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                />
                <label className={`shrink-0 inline-flex items-center px-4 rounded-xl border border-cream-300 bg-cream-200 text-sm text-stone-700 hover:border-stone-400 transition-colors cursor-pointer whitespace-nowrap ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploading ? 'Uploading…' : 'Upload'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
                {form.image.trim() && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, image: '' }))}
                    className="shrink-0 font-mono text-xs text-stone-400 hover:text-red-500 transition-colors px-1"
                  >
                    Clear
                  </button>
                )}
              </div>
              {form.image.trim() && (
                <img
                  src={form.image}
                  alt=""
                  className="mt-2 rounded-lg border border-cream-300 max-h-40 w-auto"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  onLoad={e => { (e.currentTarget as HTMLImageElement).style.display = '' }}
                />
              )}
            </div>

            <div>
              <label className="label block mb-1.5">Excerpt</label>
              <textarea
                rows={3}
                className={inputCls}
                placeholder="Short summary shown on the newsroom list and meta description."
                value={form.excerpt}
                onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label">Body (markdown)</label>
                <button
                  type="button"
                  onClick={() => setPreview(p => !p)}
                  className="font-mono text-xs text-stone-400 hover:text-ink transition-colors"
                >
                  {preview ? 'Edit' : 'Preview'}
                </button>
              </div>
              {preview ? (
                <div
                  className="prose-newsroom min-h-[20rem] bg-cream-200 border border-cream-300 rounded-xl px-4 py-3 text-sm text-stone-700 leading-relaxed space-y-3"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body) }}
                />
              ) : (
                <textarea
                  rows={18}
                  className={`${inputCls} font-mono text-xs leading-relaxed`}
                  placeholder="Write in markdown. Headings, **bold**, _italic_, [links](https://...), - bullets, etc."
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                />
              )}
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.published}
                onChange={e => setForm(f => ({ ...f, published: e.target.checked }))}
              />
              <span className="text-sm text-stone-600">Published (visible on public newsroom)</span>
            </label>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-3">
                <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : isNew ? 'Create article' : 'Save changes'}
                </button>
                <Link to="/admin/newsroom" className="font-mono text-xs text-stone-400 hover:text-ink transition-colors self-center">
                  Cancel
                </Link>
              </div>
              {!isNew && (
                <button
                  onClick={remove}
                  className="font-mono text-xs text-red-500 border border-red-300 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="hidden lg:block">
            <p className="label mb-3">Live preview</p>
            <div className="bg-cream-200 border border-cream-300 rounded-2xl p-6 sticky top-6">
              {form.image.trim() && (
                <img
                  src={form.image}
                  alt=""
                  className="rounded-xl mb-5 mx-auto block w-auto max-w-full max-h-72 object-contain bg-cream-100 border border-cream-300"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  onLoad={e => { (e.currentTarget as HTMLImageElement).style.display = '' }}
                />
              )}
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-mono tracking-wide bg-cream-300 text-stone-600">
                  {form.category}
                </span>
                <span className="label">{form.date}</span>
              </div>
              <h2 className="font-serif text-2xl text-ink leading-snug mb-3">
                {form.title || 'Untitled article'}
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed border-l-2 border-cream-300 pl-4 mb-5">
                {form.excerpt || 'Excerpt will appear here.'}
              </p>
              <div
                className="prose-newsroom text-sm text-stone-700 leading-relaxed space-y-3"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body || '_Body preview…_') }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
