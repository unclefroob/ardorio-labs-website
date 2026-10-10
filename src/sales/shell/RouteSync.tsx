import { useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { pathToRoute } from '../routes'
import { bindNavigate, syncRoute } from '../ui/store'

/** Keeps the UI store's route and navigate function in step with react-router. Renders nothing. */
export function RouteSync() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  useLayoutEffect(() => {
    bindNavigate((to, opts) => {
      if (typeof to === 'number') navigate(to)
      else navigate(to, { replace: opts?.replace })
    })
    return () => bindNavigate(null)
  }, [navigate])

  useLayoutEffect(() => {
    const r = pathToRoute(pathname, search)
    syncRoute({ page: r.page, id: r.id, q: r.q })
  }, [pathname, search])

  return null
}
