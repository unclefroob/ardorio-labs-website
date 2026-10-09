export const BASE = '/admin/sales'

/** Prototype page key -> route segment. Detail pages carry an `:id` after the segment. */
const SEGMENT: Record<string, string> = {
  dashboard: '',
  companies: 'companies', company: 'companies',
  contacts: 'contacts', contact: 'contacts',
  deals: 'deals', deal: 'deals',
  sequences: 'sequences', sequence: 'sequences',
  templates: 'templates', inbox: 'inbox', tasks: 'tasks', activities: 'activities',
  prospecting: 'prospecting', lists: 'lists', reports: 'reports', recs: 'recs', goals: 'goals',
  copilot: 'copilot', notifications: 'notifications', myday: 'myday', settings: 'settings',
  users: 'users', integrations: 'integrations', pipelines: 'pipelines', clock: 'clock',
}

const DETAIL: Record<string, string> = { company: 'companies', contact: 'contacts', deal: 'deals', sequence: 'sequences' }
const LIST_PAGE: Record<string, string> = { companies: 'company', contacts: 'contact', deals: 'deal', sequences: 'sequence' }

export type RouteQuery = Record<string, unknown>

export interface RouteParams { id?: string; q?: RouteQuery }

export const PAGE_KEYS = Object.keys(SEGMENT)

export function routeToPath(page: string, p: RouteParams = {}): string {
  const seg = SEGMENT[page] ?? ''
  let path = seg ? `${BASE}/${seg}` : BASE
  if (p.id && DETAIL[page]) path += `/${encodeURIComponent(p.id)}`
  if (p.q && Object.keys(p.q).length) path += `?q=${encodeURIComponent(JSON.stringify(p.q))}`
  return path
}

export interface ParsedRoute { page: string; id?: string; q?: RouteQuery; known: boolean }

function parseQuery(search: string): RouteQuery | undefined {
  const raw = new URLSearchParams(search).get('q')
  if (!raw) return undefined
  try {
    const v: unknown = JSON.parse(raw)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as RouteQuery) : undefined
  } catch {
    return undefined
  }
}

export function pathToRoute(pathname: string, search: string): ParsedRoute {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/^\/+|\/+$/g, '') : ''
  const [seg = '', rawId] = rest.split('/')
  const q = parseQuery(search)
  if (seg === '') return { page: 'dashboard', q, known: true }
  const id = rawId ? decodeURIComponent(rawId) : undefined
  const detail = LIST_PAGE[seg]
  if (detail && id) return { page: detail, id, q, known: true }
  if (Object.values(SEGMENT).includes(seg)) {
    const page = Object.keys(SEGMENT).find(k => SEGMENT[k] === seg && !DETAIL[k]) ?? seg
    return { page, q, known: true }
  }
  return { page: seg, q, known: false }
}

/** Sidebar highlight for detail pages. */
export function navParent(page: string): string {
  const seg = DETAIL[page]
  return seg ? (Object.keys(SEGMENT).find(k => SEGMENT[k] === seg && !DETAIL[k]) ?? page) : page
}
