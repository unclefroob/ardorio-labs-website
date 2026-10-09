import { Q } from '../../../data/Q'
import { S } from '../../../data/store'
import type { Contact, ListRec } from '../../../data/types'

export interface DynFilter { industry: string[]; state: string; title: string }

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function readFilter(f: Record<string, unknown> | undefined): DynFilter {
  return { industry: strList(f?.industry), state: str(f?.state), title: str(f?.title) }
}

export function titleRegex(src: string): RegExp | null {
  if (!src) return null
  try {
    return new RegExp(src, 'i')
  } catch {
    return null
  }
}

export function listMembers(l: Pick<ListRec, 'type' | 'businessId' | 'contactIds' | 'filter'>): Contact[] {
  if (l.type === 'static') return l.contactIds.map(Q.contact).filter((c): c is Contact => !!c && !c.archived)
  const f = readFilter(l.filter)
  const rx = titleRegex(f.title)
  return S.contacts.filter(c => {
    if (c.archived || !Q.crel(c.id, l.businessId)) return false
    const co = Q.company(c.companyId)
    return (!f.industry.length || f.industry.includes(co?.industry ?? '')) && (!f.state || co?.state === f.state) && (!rx || rx.test(c.title))
  })
}
