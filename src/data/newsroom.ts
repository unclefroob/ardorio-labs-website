import { apiFetch } from '../lib/apiClient'

export type NewsCategory = 'Partnership' | 'New Work' | 'Company'

export interface NewsItem {
  slug: string
  date: string           // ISO date, e.g. "2026-03-18"
  category: NewsCategory
  title: string
  excerpt: string
  body: string           // markdown
  published?: boolean
  createdAt?: string
  updatedAt?: string
}

export const CATEGORIES: NewsCategory[] = ['Partnership', 'New Work', 'Company']

export function listNews(opts: { all?: boolean } = {}): Promise<NewsItem[]> {
  return apiFetch<NewsItem[]>(opts.all ? '/news?all=1' : '/news')
}

export function getNews(slug: string): Promise<NewsItem> {
  return apiFetch<NewsItem>(`/news/${slug}`)
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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
