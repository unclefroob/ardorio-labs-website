import { useSyncExternalStore } from 'react'
import type { AiProvider, BootstrapResponse, BusinessId, MeDTO } from '../api/contract'
import { BUSINESS_IDS } from '../api/contract'
import { getMe } from '../api/me'
import { getMembers } from '../api/members'
import { notifyStore, S, subscribe, getVersion } from './store'

const WS_KEY = 'salesos.ws'
const THEME_KEY = 'salesos.theme'

let me: MeDTO | null = null
let aiEnabled = true
let aiProviders: Record<AiProvider, boolean> = { anthropic: true, xai: true }
let membersVersion = ''

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* private mode or blocked storage: the preference just does not persist */
  }
}

export function getMyProfile(): MeDTO | null {
  return me
}
export function useMyProfile(): MeDTO | null {
  useSyncExternalStore(subscribe, getVersion)
  return me
}
export function isAiEnabled(): boolean {
  return aiEnabled
}
/** Whether the server has a key for this provider. Assumed true until bootstrap says otherwise. */
export function isProviderEnabled(p: AiProvider): boolean {
  return aiProviders[p]
}
export function getMembersVersion(): string {
  return membersVersion
}

function isBusinessId(v: string | null): v is BusinessId {
  return v !== null && (BUSINESS_IDS as readonly string[]).includes(v)
}

export function readableBusinesses(m: MeDTO): BusinessId[] {
  return BUSINESS_IDS.filter(b => m.permissions[b].read)
}

/** Workspace and theme are per viewer (browser), never shared; the server has no notion of them. */
export function initSession(b: BootstrapResponse): void {
  me = b.me
  aiEnabled = b.ai.enabled
  aiProviders = b.ai.providers
  membersVersion = b.membersVersion
  const readable = readableBusinesses(b.me)
  const saved = read(WS_KEY)
  const ws = isBusinessId(saved) && readable.includes(saved) ? saved : 'all'
  const theme = read(THEME_KEY) === 'dark' ? 'dark' : 'light'
  S.session = { userId: b.me.userId, ws, theme }
}

export function setWorkspace(ws: 'all' | BusinessId): void {
  S.session.ws = ws
  write(WS_KEY, ws)
  notifyStore()
}

export function setTheme(theme: 'light' | 'dark'): void {
  S.session.theme = theme
  write(THEME_KEY, theme)
  notifyStore()
}

export async function refreshMembers(): Promise<void> {
  const [m, mine] = await Promise.all([getMembers(), getMe()])
  S.users.splice(0, S.users.length, ...m.users)
  me = mine
  membersVersion = m.membersVersion
  notifyStore()
}

/** Replace the user list after a member write (R7/R8) so the Users page updates without a poll. */
export function setUsers(users: BootstrapResponse['users']): void {
  S.users.splice(0, S.users.length, ...users)
  notifyStore()
}
