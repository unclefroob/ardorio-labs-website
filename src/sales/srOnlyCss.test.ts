import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A visually hidden table (every chart has one) must not be absolutely positioned: with no positioned ancestor it is placed against the
// page, and one far down a long dashboard stretches the document, which shows a second scrollbar beside the app's own scroller.
describe('.sr-only', () => {
  it('is fixed, so it never adds to the page height', () => {
    const css = readFileSync('src/sales/sales.css', 'utf8')
    const rule = css.split('\n').find(l => l.startsWith('.sos .sr-only{'))
    expect(rule).toBeDefined()
    expect(rule).toContain('position:fixed')
    expect(rule).not.toContain('position:absolute')
  })
})
