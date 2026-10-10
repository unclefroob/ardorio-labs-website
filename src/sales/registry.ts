import { AskText } from './kit/AskText'
import { ConfirmModal } from './shell/ConfirmModal'
import { u1 } from './units/u1'
import { u2 } from './units/u2'
import { u3 } from './units/u3'
import { u4 } from './units/u4'
import type { Registered, UnitModule } from './units/types'

const units: UnitModule[] = [u1, u2, u3, u4]

function merge(pick: (u: UnitModule) => Record<string, Registered>, base: Record<string, Registered> = {}): Record<string, Registered> {
  const out = { ...base }
  for (const u of units) Object.assign(out, pick(u))
  return out
}

export const PAGES = merge(u => u.pages)
export const MODALS = merge(u => u.modals, { confirm: ConfirmModal, askText: AskText })
export const DRAWERS = merge(u => u.drawers)
