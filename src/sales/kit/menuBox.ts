import type { CSSProperties } from 'react'

/**
 * Where an open menu sits on screen: below its trigger, or above it when there is less room below, and kept inside the
 * window. It is drawn fixed over the page so a scrolling or clipped parent (a pipeline column, a table) cannot cut it off.
 */
export function menuBox(r: { top: number; bottom: number; left: number; right: number }, h: number, w: number, vw: number, vh: number, align?: 'right' | 'left'): CSSProperties {
  const gap = 4
  const below = vh - r.bottom - gap - 8
  const above = r.top - gap - 8
  const up = below < h && above > below
  const maxHeight = Math.max(120, Math.floor(up ? above : below))
  const top = up ? Math.max(8, r.top - gap - Math.min(h, maxHeight)) : r.bottom + gap
  const left = Math.min(Math.max(8, align === 'right' ? r.right - w : r.left), Math.max(8, vw - w - 8))
  return { position: 'fixed', top, left, right: 'auto', maxHeight }
}
