import { createElement, useEffect, useRef, type ComponentType } from 'react'
import { useLocation } from 'react-router-dom'
import { Q } from '../data/Q'
import { S, useStore } from '../data/store'
import { PAGES } from '../registry'
import { pathToRoute } from '../routes'
import { useUi, type Route } from '../ui/store'
import { Boundary } from './Boundary'
import { ADMIN_PAGES } from './nav'
import { Denied, NotFound } from './states'

function focusHeading(): void {
  const main = document.getElementById('main')
  const el = main?.querySelector<HTMLElement>('h1') ?? main
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

export function PageView() {
  useStore()
  const ui = useUi()
  const { pathname, search } = useLocation()
  const parsed = pathToRoute(pathname, search)
  const Page = parsed.known ? PAGES[parsed.page] : undefined
  const synced = ui.route.page === parsed.page && ui.route.id === parsed.id
  const key = parsed.page + '/' + (parsed.id ?? '') + '/' + S.session.ws
  const focused = useRef<string | null>(null)

  useEffect(() => {
    if (!synced) return
    if (focused.current !== null && focused.current !== key) focusHeading()
    focused.current = key
  }, [synced, key])

  if (!synced) return null
  if (!Page) return <NotFound />
  if (ADMIN_PAGES.includes(parsed.page) && !Q.anyAdmin()) return <Denied />
  return (
    <Boundary level="page" resetKey={key}>
      {createElement(Page as ComponentType<{ route: Route }>, { key, route: ui.route })}
    </Boundary>
  )
}
