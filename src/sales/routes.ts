export const BASE = '/sales'

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
  customers: 'customers', rosterioCustomers: 'customers', rosterioAccount: 'rosterio-accounts',
  invoices: 'invoices', invoice: 'invoices',
  users: 'users', integrations: 'integrations', pipelines: 'pipelines',
}

const DETAIL: Record<string, string> = { company: 'companies', contact: 'contacts', deal: 'deals', sequence: 'sequences', invoice: 'invoices', rosterioAccount: 'rosterio-accounts' }
const LIST_PAGE: Record<string, string> = { companies: 'company', contacts: 'contact', deals: 'deal', sequences: 'sequence', invoices: 'invoice', 'rosterio-accounts': 'rosterioAccount' }
/** Detail pages that highlight a differently named sidebar entry: a Rosterio account sits under Customers. */
const NAV_PARENT: Record<string, string> = { rosterioAccount: 'customers' }

export type RouteQuery = Record<string, unknown>

export interface RouteParams { id?: string; q?: RouteQuery }

export const PAGE_KEYS = Object.keys(SEGMENT)

export function routeToPath(page: string, p: RouteParams = {}): string {
  const seg = SEGMENT[page] ?? ''
  let path = seg ? `${BASE}/${seg}` : BASE
  if (p.id && (DETAIL[page] || page === 'inbox')) path += `/${encodeURIComponent(p.id)}`
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
  // The Inbox carries the open conversation in the path (/sales/inbox/<thread id>) so links from elsewhere open it.
  if (seg === 'inbox') return { page: 'inbox', ...(id ? { id } : {}), q, known: true }
  if (seg === 'rosterio-customers') return { page: 'customers', q: { ...q, product: 'ros' }, known: true }
  // The account page needs an account: without one, the old Rosterio customers list is the right place.
  if (seg === 'rosterio-accounts' && !id) return { page: 'customers', q: { ...q, product: 'ros' }, known: true }
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
  if (NAV_PARENT[page]) return NAV_PARENT[page]
  const seg = DETAIL[page]
  return seg ? (Object.keys(SEGMENT).find(k => SEGMENT[k] === seg && !DETAIL[k]) ?? page) : page
}
