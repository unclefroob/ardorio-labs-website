import { apiFetch, apiUpload } from '../lib/apiClient'

export type NewsCategory = 'Partnership' | 'New Work' | 'Company'

export interface NewsItem {
  slug: string
  date: string           // ISO date, e.g. "2026-03-18"
  category: NewsCategory
  title: string
  excerpt: string
  body: string           // markdown
  image?: string         // optional hero image URL
  published?: boolean
  createdAt?: string
  updatedAt?: string
}

export const CATEGORIES: NewsCategory[] = ['Partnership', 'New Work', 'Company']

// Dev-only seed. Used ONLY when running `npm run dev` and the local API is
// unreachable, so the newsroom is viewable without booting the backend. Gated
// on import.meta.env.DEV, so it is stripped from production builds and can
// never mask a real API outage in production.
const DEV_SEED: NewsItem[] = [
  {
    slug: 'ardorio-ai-training-and-consulting',
    date: '2026-07-01',
    category: 'Company',
    title: 'Ardorio now offers AI training and consulting',
    image: '/newsroom/placeholder.svg',
    excerpt:
      'We go into a business, find where AI creates real leverage, and build the product that captures it. Training is where it starts.',
    body: `We've formalised a service we'd been doing informally for a while: helping established teams actually adopt AI in day-to-day work.\n\nIt starts with hands-on training and a hard look at operations, then moves to building the tools that close the gaps we find. We build what we recommend.`,
  },
  {
    slug: 'pathiq-goes-live',
    date: '2026-06-20',
    category: 'New Work',
    title: 'PathIQ goes live for Australian students',
    excerpt:
      'The AI-powered career-discovery platform we built end to end is now live, letting students test-drive careers through realistic simulations.',
    body: `PathIQ is live at pathiq.com.au.\n\nWe built the product from the ground up: the student app, the AI evaluation engine on Claude, and the internal CRM the team runs the platform and its sales on.`,
  },
  {
    slug: 'ardorio-partners-with-ritchies',
    date: '2026-06-15',
    category: 'Partnership',
    title: 'Ardorio partners with Ritchies IGA to build the Ritchies Digital Platform',
    excerpt:
      "We've signed a partnership with Ritchies supermarkets to build the Ritchies Digital Platform, bringing their internal applications together with hands-on AI consulting.",
    body: `We're partnering with Ritchies IGA to build the Ritchies Digital Platform.\n\nThe work brings together the internal applications that run their stores with practical AI training for their teams.`,
  },
]

export function listNews(opts: { all?: boolean } = {}): Promise<NewsItem[]> {
  const req = apiFetch<NewsItem[]>(opts.all ? '/news?all=1' : '/news')
  return import.meta.env.DEV ? req.catch(() => DEV_SEED) : req
}

export function getNews(slug: string): Promise<NewsItem> {
  const req = apiFetch<NewsItem>(`/news/${slug}`)
  if (!import.meta.env.DEV) return req
  return req.catch(() => {
    const seeded = DEV_SEED.find((n) => n.slug === slug)
    if (seeded) return seeded
    throw new Error('Not found')
  })
}

export function createNews(input: Partial<NewsItem>): Promise<NewsItem> {
  return apiFetch<NewsItem>('/news', { method: 'POST', body: JSON.stringify(input) })
}

export function updateNews(slug: string, input: Partial<NewsItem>): Promise<NewsItem> {
  return apiFetch<NewsItem>(`/news/${slug}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteNews(slug: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/news/${slug}`, { method: 'DELETE' })
}

/** Uploads an image to GCS via the API and returns its public URL. */
export function uploadNewsImage(file: File): Promise<{ url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return apiUpload<{ url: string }>('/news/upload', fd)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
