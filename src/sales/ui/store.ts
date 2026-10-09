import { useSyncExternalStore } from 'react'
import { Q } from '../data/Q'
import { routeToPath, type RouteParams, type RouteQuery } from '../routes'

export interface Route {
  page: string
  id?: string
  q?: RouteQuery
  [extra: string]: unknown
}
export type ModalProps = Record<string, unknown>
export interface ModalEntry { id: number; name: string; props: ModalProps }
export interface DrawerEntry { name: string; props: ModalProps }
export type ToastTone = 'ok' | 'bad' | 'warn' | undefined
export interface ToastEntry { id: number; msg: string; tone?: ToastTone; action?: { label: string; fn: () => void } }

export interface UiState {
  route: Route
  modals: ModalEntry[]
  toasts: ToastEntry[]
  drawer: DrawerEntry | null
  palette: boolean
  side: boolean
}

const UIS: UiState = { route: { page: 'dashboard' }, modals: [], toasts: [], drawer: null, palette: false, side: false }
const subs = new Set<() => void>()
let version = 0
let rid = 0
let navigateFn: ((to: string | number, opts?: { replace?: boolean }) => void) | null = null
let depth = 0

function emit(): void {
  version++
  subs.forEach(f => f())
}

export function bindNavigate(fn: ((to: string | number, opts?: { replace?: boolean }) => void) | null): void {
  navigateFn = fn
}

/** Called by RouteSync whenever the browser location changes. Extras (tabs, filters) reset on page change. */
export function syncRoute(next: { page: string; id?: string; q?: RouteQuery }): void {
  const cur = UIS.route
  const same = cur.page === next.page && cur.id === next.id
  UIS.route = same ? { ...cur, q: next.q ?? cur.q } : { ...next }
  if (!same) {
    depth++
    UIS.side = false
    UIS.drawer = null
    UIS.modals = []
  }
  emit()
}

function go(to: string, replace?: boolean): void {
  if (navigateFn) navigateFn(to, { replace })
}

export const UI = {
  get: (): UiState => UIS,
  sub(f: () => void): () => void {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
  nav(page: string, p: RouteParams = {}): void {
    go(routeToPath(page, p))
    const el = document.querySelector('.sos .main')
    if (el) el.scrollTop = 0
  },
  back(): void {
    if (depth > 1 && navigateFn) navigateFn(-1)
    else UI.nav('dashboard')
  },
  setRoute(p: Partial<Route>): void {
    Object.assign(UIS.route, p)
    emit()
  },
  open(name: string, props: ModalProps = {}): void {
    UIS.modals.push({ id: ++rid, name, props })
    emit()
  },
  modal(name: string, props: ModalProps = {}): void {
    UI.open(name, props)
  },
  close(): void {
    UIS.modals.pop()
    emit()
  },
  closeAll(): void {
    UIS.modals = []
    emit()
  },
  drawer(name: string | null, props: ModalProps = {}): void {
    UIS.drawer = name ? { name, props } : null
    emit()
  },
  toast(msg: string, tone?: ToastTone, action?: ToastEntry['action']): void {
    const t: ToastEntry = { id: ++rid, msg, tone, action }
    UIS.toasts.push(t)
    emit()
    setTimeout(() => {
      UIS.toasts = UIS.toasts.filter(x => x.id !== t.id)
      emit()
    }, action ? 6500 : 3800)
  },
  confirm(o: ConfirmProps): void {
    UI.open('confirm', { ...o })
  },
  ask(cb: (v: string) => void, title: string, def?: string): void {
    UI.open('askText', { title, def, cb })
  },
  palette(v: boolean): void {
    UIS.palette = v
    emit()
  },
  side(v: boolean): void {
    UIS.side = v
    emit()
  },
  guard(b: string, what?: string): boolean {
    if (Q.canEdit(b)) return true
    UI.toast(`${what ?? 'This action'} needs edit access to ${Q.biz(b)?.name ?? 'this business'}. Your role: ${Q.role(b) ?? 'no access'}.`, 'bad')
    return false
  },
}

export interface ConfirmProps {
  title: string
  body: string
  confirm?: string
  danger?: boolean
  onConfirm: () => void
}

/** Re-render on any UI store change (route, modals, toasts). */
export function useUi(): UiState {
  useSyncExternalStore(UI.sub, () => version)
  return UIS
}
