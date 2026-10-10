import { useCallback, useEffect, useState } from 'react'
import { getMembers } from '../../sales/api/members'
import { getMe } from '../../sales/api/me'
import { BUSINESS_IDS } from '../../sales/api/contract'
import type { BusinessId, MeDTO, Role, SalesUserDTO } from '../../sales/api/contract'

export const BUSINESS_NAMES: Record<BusinessId, string> = { ard: 'Ardorio', ros: 'Rosterio', pth: 'PathIQ', adv: 'Advanta' }

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'viewer', label: 'Viewer: read only' },
  { value: 'sales', label: 'Sales: create and edit' },
  { value: 'manager', label: 'Manager: plus team data' },
  { value: 'admin', label: 'Admin: plus settings and access' },
]

export interface SalesAccessState {
  /** `hidden` when the signed-in login is not a SalesOS admin, so the page looks exactly as it did before. */
  status: 'loading' | 'hidden' | 'ready'
  me: MeDTO | null
  members: Map<string, SalesUserDTO>
  upsert: (m: SalesUserDTO) => void
}

export function useSalesAccess(): SalesAccessState {
  const [status, setStatus] = useState<SalesAccessState['status']>('loading')
  const [me, setMe] = useState<MeDTO | null>(null)
  const [members, setMembers] = useState<Map<string, SalesUserDTO>>(new Map())

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const who = await getMe()
        const isAdmin = who.super || BUSINESS_IDS.some(b => who.permissions[b].admin)
        if (!who.active || !isAdmin) { if (live) setStatus('hidden'); return }
        const list = await getMembers()
        if (!live) return
        setMe(who)
        setMembers(new Map(list.users.map(u => [u.id, u])))
        setStatus('ready')
      } catch {
        if (live) setStatus('hidden')
      }
    })()
    return () => { live = false }
  }, [])

  const upsert = useCallback((m: SalesUserDTO) => setMembers(prev => new Map(prev).set(m.id, m)), [])
  return { status, me, members, upsert }
}

export function accessSummary(m: SalesUserDTO | undefined): string {
  if (!m || !m.active) return m && !m.active ? 'Sales access: switched off' : 'Sales access: none'
  if (m.super) return 'Sales access: super admin'
  const parts = BUSINESS_IDS.filter(b => m.m[b]).map(b => `${BUSINESS_NAMES[b]} ${m.m[b]}`)
  return parts.length ? `Sales access: ${parts.join(', ')}` : 'Sales access: none'
}
