import { createMember, updateMember } from '../../api/members'
import { SalesHttpError } from '../../api/http'
import type { Role } from '../../api/contract'
import { UI } from '../../ui/store'
import { F } from '../F'
import { getOffsetMinutes, now as clockNow, setOffsetMinutes } from '../clock'
import { nudgeEngine } from '../engineNudge'
import { uid } from '../ids'
import { audit, notify } from '../internals'
import { Q } from '../Q'
import { msFromWall } from '../tz'
import { commit } from '../commit'
import { idx, S } from '../store'
import { refreshMembers, setTheme as setSessionTheme, setUsers, setWorkspace } from '../session'
import type {
  BusinessId, Goal, Mailbox, OrgSettings, Pipeline, SalesUser, Team, WizaSettings, Business,
} from '../types'

// ── goals / teams / views / notifications ───────────────────────────────────────────────────
export type GoalInput = Partial<Goal> & Pick<Goal, 'businessId' | 'ownerType' | 'ownerId' | 'metric' | 'target' | 'period'>

export function saveGoal(g: GoalInput): void {
  let x = g.id ? idx.goals.get(g.id) : undefined
  if (!x) {
    x = { id: uid('gl'), createdBy: S.session.userId, start: F.weekStart().slice(0, 10), ...g }
    S.goals.push(x)
    idx.goals.set(x.id, x)
  } else Object.assign(x, g)
  audit('Sales goal saved', `${x.metric} ${x.target}/${x.period}`)
  commit()
}

export function deleteGoal(id: string): void {
  const i = S.goals.findIndex(g => g.id === id)
  if (i >= 0) S.goals.splice(i, 1)
  commit()
}

export type TeamInput = Partial<Team> & Pick<Team, 'name' | 'businessId' | 'managerId'>

export function saveTeam(t: TeamInput): void {
  let x = t.id ? idx.teams.get(t.id) : undefined
  if (!x) {
    x = { id: uid('t'), members: [], ...t }
    S.teams.push(x)
    idx.teams.set(x.id, x)
  } else Object.assign(x, t)
  if (!x.members.includes(x.managerId)) x.members.push(x.managerId)
  audit('Team saved', x.name)
  commit()
}

export function deleteTeam(id: string): void {
  const i = S.teams.findIndex(t => t.id === id)
  if (i >= 0) S.teams.splice(i, 1)
  commit()
}

export function saveView(page: string, name: string, q: Record<string, unknown>): void {
  S.savedViews.push({ id: uid('sv'), page, name, q, ownerId: S.session.userId })
  commit()
}

export function deleteView(id: string): void {
  const i = S.savedViews.findIndex(v => v.id === id)
  if (i >= 0) S.savedViews.splice(i, 1)
  commit()
}

export function readNotif(id: string): void {
  const n = S.notifications.find(x => x.id === id)
  if (n) n.read = true
  commit()
}

export function readAll(): void {
  for (const n of Q.notifs()) n.read = true
  commit()
}

/** Demo tool: raises a generic test notification for the current user. */
export function sampleNotif(): void {
  notify([S.session.userId], { type: 'AI recommendation', title: 'Test notification', body: 'This is a test notification.', link: { page: 'recs' } })
  commit()
}

// ── members (server owned; written through R7/R8) ───────────────────────────────────────────
export interface UserForm {
  /** Existing member id. */
  id?: string
  /** Login to add as a member when `id` is absent. */
  userId?: string
  m: Partial<Record<BusinessId, Role>>
  super?: boolean
  active?: boolean
  title?: string
  color?: string
  meetingLink?: string
}

function describe(e: unknown): string {
  return e instanceof SalesHttpError ? e.message : "Couldn't reach the server"
}

export async function saveUser(u: UserForm): Promise<SalesUser | undefined> {
  const existing = u.id ? idx.users.get(u.id) : undefined
  try {
    let saved: SalesUser
    if (existing) {
      const roles: Partial<Record<BusinessId, Role | null>> = { ...u.m }
      for (const b of Object.keys(existing.m) as BusinessId[]) if (!u.m[b]) roles[b] = null
      saved = await updateMember(existing.id, { roles, super: u.super, active: u.active, title: u.title, color: u.color, meetingLink: u.meetingLink })
      const before = JSON.stringify(existing.m)
      audit(JSON.stringify(saved.m) !== before ? 'Role changed' : 'User edited', saved.name)
    } else {
      if (!u.userId) return undefined
      saved = await createMember({ userId: u.userId, roles: u.m, super: u.super, title: u.title, color: u.color, meetingLink: u.meetingLink })
      audit('User created', saved.name)
    }
    try {
      await refreshMembers()
    } catch {
      UI.toast('Saved, but the user list could not refresh. Reload to see the latest.', 'warn')
    }
    commit()
    return saved
  } catch (e) {
    UI.toast(`Couldn't save: ${describe(e)}`, 'bad')
    return undefined
  }
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  const u = idx.users.get(id)
  try {
    const saved = await updateMember(id, { active })
    setUsers(S.users.map(x => (x.id === id ? saved : x)))
    audit(active ? 'User activated' : 'User deactivated', u?.name ?? id)
    commit()
  } catch (e) {
    UI.toast(`Couldn't save: ${describe(e)}`, 'bad')
  }
}

// ── pipelines / mailboxes / settings ────────────────────────────────────────────────────────
export function savePipeline(b: BusinessId, p: Partial<Pipeline>): void {
  const pl = Q.pipeline(b)
  Object.assign(pl, p)
  audit('Pipeline configured', pl.name)
  commit()
}

export function removeStage(b: BusinessId, stageId: string, toId: string): void {
  const pl = Q.pipeline(b)
  const to = pl.stages.find(s => s.id === toId)
  if (!to) return
  const now = F.nowIso()
  for (const d of S.deals) {
    if (d.stageId === stageId) {
      d.stageId = toId
      d.probability = to.prob
      d.stageHistory.push({ stageId: toId, ts: now })
    }
  }
  pl.stages = pl.stages.filter(s => s.id !== stageId)
  audit('Pipeline stage removed', `${pl.name} — deals migrated to ${to.name}`)
  commit()
}

export function setMailbox(id: string, p: Partial<Mailbox>): void {
  const m = idx.mailboxes.get(id)
  if (!m) return
  Object.assign(m, p)
  const now = F.nowIso()
  if (p.status === 'connected') m.lastSync = now
  audit(`Mailbox ${p.status || 'updated'}`, m.address)
  if (p.status === 'connected') {
    for (const e of S.enrolments) {
      if (e.status === 'failed' && e.mailboxId === id) {
        e.status = 'active'
        e.nextDue = now
        e.reason = ''
      }
    }
    nudgeEngine()
  }
  commit()
}

export function setWiza(p: Partial<WizaSettings>): void {
  Object.assign(S.wiza, p)
  audit('Wiza integration updated', JSON.stringify(p))
  commit()
}

export function setOrg(p: Partial<OrgSettings>): void {
  Object.assign(S.org, p)
  audit('Organisation settings updated', Object.keys(p).join(', '))
  commit()
}

export function setBiz(id: BusinessId, p: Partial<Business>): void {
  const b = idx.businesses.get(id)
  if (!b) return
  Object.assign(b, p)
  audit('Business settings updated', b.name)
  commit()
}

export function setDemo(p: Partial<typeof S.demo>): void {
  Object.assign(S.demo, p)
  commit()
}

// ── viewer preferences (per browser, never synced) ──────────────────────────────────────────
export function setSession(p: { ws?: 'all' | BusinessId; theme?: 'light' | 'dark' }): void {
  if (p.ws) setWorkspace(p.ws)
  if (p.theme) setSessionTheme(p.theme)
}

export function setTheme(t: 'light' | 'dark'): void {
  setSessionTheme(t)
}

// ── demo clock (admin only; the offset is a synced settings record) ─────────────────────────
function describeOffset(min: number): string {
  if (min === 0) return 'real time'
  const abs = Math.abs(min)
  const body = abs >= 1440 && abs % 1440 === 0 ? `${abs / 1440} day(s)` : abs >= 60 && abs % 60 === 0 ? `${abs / 60} hour(s)` : `${abs} minute(s)`
  return `${min < 0 ? '-' : '+'}${body}`
}

export function advance(hours: number): void {
  if (!Q.anyAdmin()) return
  setOffsetMinutes(getOffsetMinutes() + Math.round(hours * 60))
  audit('Demo clock advanced', `${hours >= 24 ? `+${hours / 24} day(s)` : `+${hours} hour(s)`} → ${F.dt(F.nowIso())}`)
  nudgeEngine()
  commit()
}

/** Set the simulated time. Zoneless input is organisation wall time; an explicit Z or offset is an instant. */
export function setClock(iso: string): void {
  if (!Q.anyAdmin()) return
  // A zoneless string (what a datetime-local input gives) is a wall time in the organisation's zone, never the browser's.
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
  const target = zoned ? new Date(iso).getTime() : msFromWall(iso)
  if (Number.isNaN(target)) return
  const real = clockNow() - getOffsetMinutes() * 60000
  setOffsetMinutes(Math.round((target - real) / 60000))
  audit('Demo clock set', `${F.dt(F.nowIso())} (${describeOffset(getOffsetMinutes())})`)
  nudgeEngine()
  commit()
}

export function resetClock(): void {
  if (!Q.anyAdmin()) return
  setOffsetMinutes(0)
  audit('Demo clock reset', 'real time')
  nudgeEngine()
  commit()
}

export function runSequences(): void {
  nudgeEngine()
  commit()
}
