import { Q } from '../../../data/Q'
import type { BusinessId } from '../../../data/types'

export const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Narrows a form string to a business the viewer belongs to. */
export function asBiz(v: string | null | undefined): BusinessId | undefined {
  return Q.myBiz().find(b => b === v)
}

export function includesCI(hay: string | null | undefined, needle: string): boolean {
  return (hay ?? '').toLowerCase().includes(needle.toLowerCase())
}
