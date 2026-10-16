import type { Sales } from './load'
import type { RouteQuery } from '../routes'

/**
 * The Inbox as the app mounts it: its route comes from the UI store, and navigation (UI.nav / UI.replace) goes through the same
 * path parsing the browser router uses, so selecting a conversation really changes the route the page renders from.
 */
export async function routedInbox(m: Sales, start: { id?: string; q?: RouteQuery } = {}) {
  const { pathToRoute } = await import('../routes')
  const nav: string[] = []
  m.ui.bindNavigate(to => {
    if (typeof to !== 'string') return
    nav.push(to)
    const u = new URL(to, 'https://app.test')
    const r = pathToRoute(u.pathname, u.search)
    m.ui.syncRoute({ page: r.page, id: r.id, q: r.q })
  })
  m.ui.syncRoute({ page: 'inbox', ...start })
  const { Inbox } = await import('../pages/inbox/Inbox')
  function Page() {
    const ui = m.ui.useUi()
    return <Inbox route={ui.route} />
  }
  return { Page, nav }
}
