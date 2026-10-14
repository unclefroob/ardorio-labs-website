import { describe, expect, it } from 'vitest'
import { menuBox } from './menuBox'

const trigger = (top: number, left = 100) => ({ top, bottom: top + 24, left, right: left + 60 })

describe('menuBox', () => {
  it('opens below the trigger when it fits', () => {
    expect(menuBox(trigger(100), 200, 220, 1200, 800)).toMatchObject({ position: 'fixed', top: 128, left: 100 })
  })

  it('opens above the trigger near the bottom of the window, as on a pipeline card low in its column', () => {
    const b = menuBox(trigger(700), 200, 220, 1200, 800)
    expect(b.top).toBe(700 - 4 - 200)
  })

  it('stays below with a scroll limit when there is more room below than above', () => {
    const b = menuBox(trigger(300), 600, 220, 1200, 800)
    expect(b.top).toBe(328)
    expect(b.maxHeight).toBe(800 - 324 - 4 - 8)
  })

  it('aligns right edges when asked and never runs off either side', () => {
    expect(menuBox(trigger(100, 1100), 100, 220, 1200, 800, 'right').left).toBe(1160 - 220)
    expect(menuBox(trigger(100, 1100), 100, 220, 1200, 800).left).toBe(1200 - 220 - 8)
    expect(menuBox(trigger(100, 0), 100, 220, 1200, 800, 'right').left).toBe(8)
  })
})
