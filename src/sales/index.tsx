import './fonts.css'
import './sales.css'
import { useEffect, type CSSProperties } from 'react'
import { Q } from './data/Q'
import { loadBootstrap } from './data/bootstrap'
import { S, setLoadState, useLoadState, useStore } from './data/store'
import { flushAll, startSync } from './data/sync'
import { Act } from './data/Act'
import { Boundary } from './shell/Boundary'
import { Shell } from './shell/Shell'
import { LoadFailed, LoadingShell, NoAccess } from './shell/states'

const DEFAULT_ACCENT = '#4F46E5'

function Body() {
  const load = useLoadState()
  if (load.status === 'loading') return <LoadingShell />
  if (load.status === 'noaccess') return <NoAccess message={load.message} />
  if (load.status === 'error') return <LoadFailed message={load.message} />
  return <Shell />
}

export default function SalesApp() {
  useStore()
  const ready = useLoadState().status === 'ready'

  useEffect(() => {
    void loadBootstrap()
    return () => setLoadState({ status: 'loading' })
  }, [])

  useEffect(() => {
    if (!ready) return
    const stopSync = startSync()
    // Recommendations are generated in the browser; once per load is enough to keep them from going stale.
    if (Q.anyEdit()) Act.refreshRecs()
    return () => {
      stopSync()
      void flushAll()
    }
  }, [ready])

  const accent = ready ? Q.biz(S.session.ws)?.accent : undefined
  return (
    <div className="sos" data-theme={ready ? S.session.theme || 'light' : 'light'} style={{ '--acc': accent ?? DEFAULT_ACCENT } as CSSProperties}>
      <Boundary level="root">
        <Body />
      </Boundary>
    </div>
  )
}
