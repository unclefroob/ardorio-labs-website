import { useEffect } from 'react'
import { bumpClock } from '../data/clock'
import { UI, useUi } from '../ui/store'
import { SyncBanner, ConflictBar } from './Banners'
import { Hosts } from './Hosts'
import { PageView } from './PageView'
import { RouteSync } from './RouteSync'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Shell() {
  const ui = useUi()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        UI.palette(!UI.get().palette)
      } else if (e.key === 'Escape' && UI.get().side && !UI.get().modals.length && !UI.get().palette) {
        UI.side(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const t = setInterval(bumpClock, 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="app">
      <RouteSync />
      <Sidebar />
      {ui.side && <button type="button" className="drawer-bg" style={{ zIndex: 54, border: 0 }} onClick={() => UI.side(false)} tabIndex={-1} aria-label="Close menu" />}
      <div className="mainwrap">
        <Topbar />
        <SyncBanner />
        <ConflictBar />
        <main className="main" id="main">
          <PageView />
        </main>
      </div>
      <Hosts />
    </div>
  )
}
