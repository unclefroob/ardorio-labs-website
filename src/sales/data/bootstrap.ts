import type { BootstrapResponse, CollectionName } from '../api/contract'
import { SETTINGS_IDS } from '../api/contract'
import { SalesHttpError, SalesNetworkError } from '../api/http'
import { getBootstrap } from '../api/records'
import { setOffsetMinutes, setServerNow } from './clock'
import { stable, wire } from './diff'
import { initSession } from './session'
import {
  applySettings, ARRAY_COLLECTIONS, clearAllMeta, metaMap, normalise, publish, S, setLoadState,
  type ArrayCollection,
} from './store'
import { setCursor } from './sync'

/** Fill the store from R1. Production starts empty; nothing here is seed data. */
export function hydrate(b: BootstrapResponse): void {
  clearAllMeta()
  setServerNow(b.serverNow)
  setOffsetMinutes(0)
  initSession(b)
  S.users.splice(0, S.users.length, ...b.users)
  for (const c of ARRAY_COLLECTIONS) {
    const name: Exclude<CollectionName, 'users'> = c
    const recs = b.collections[name] ?? []
    const snaps = recs.map(r => normalise(c, r.id, r.data))
    // The synced copy must not share objects with the live rows, or edits would also change the copy they are diffed against.
    replaceRows(c, snaps.map(wire))
    const mm = metaMap(c)
    recs.forEach((r, i) => mm.set(r.id, { rev: r.rev, snap: snaps[i], snapStr: stable(snaps[i]), base: null, demo: r.demo }))
  }
  const stored = new Map(b.collections.settings.map(r => [r.id, r]))
  for (const id of SETTINGS_IDS) {
    const r = stored.get(id)
    const data = normalise('settings', id, r ? r.data : b.settingsDefaults[id])
    applySettings(id, wire(data))
    metaMap('settings').set(id, { rev: r ? r.rev : 0, snap: data, snapStr: stable(data), base: null, demo: r ? r.demo : false })
  }
  setCursor(b.cursor)
  publish()
}

function replaceRows(c: ArrayCollection, rows: Array<{ id: string }>): void {
  const target: Array<{ id: string }> = S[c]
  target.splice(0, target.length, ...rows)
}

export async function loadBootstrap(): Promise<boolean> {
  setLoadState({ status: 'loading' })
  try {
    hydrate(await getBootstrap())
    setLoadState({ status: 'ready' })
    return true
  } catch (e) {
    if (e instanceof SalesHttpError) {
      if (e.status === 403) {
        const why = e.code === 'MEMBER_INACTIVE' ? 'Your SalesOS access has been deactivated.' : "You haven't been added to SalesOS yet."
        setLoadState({ status: 'noaccess', message: `${why} Ask an administrator to add you.` })
        return false
      }
      setLoadState({ status: 'error', message: e.message })
      return false
    }
    setLoadState({
      status: 'error',
      message: e instanceof SalesNetworkError ? "Can't reach the server. Check your connection and try again." : 'Something went wrong loading SalesOS.',
    })
    return false
  }
}
