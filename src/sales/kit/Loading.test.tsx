import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Btn, Skel } from './basic'

// One way to say "working on it": a busy button keeps its place, and placeholders are shaped like what is coming.

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('a loading button', () => {
  it('spins where its icon was, is disabled and marked busy, and cannot be pressed twice', async () => {
    const onClick = vi.fn()
    await act(async () => { root.render(<Btn icon="send" loading onClick={onClick}>Sending…</Btn>) })
    const b = host.querySelector('button')!
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(b.querySelector('.spin')).not.toBeNull()
    expect(b.className).toContain('busy')
    await act(async () => { b.click() })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('is an ordinary button when not loading', async () => {
    await act(async () => { root.render(<Btn icon="send">Send</Btn>) })
    const b = host.querySelector('button')!
    expect(b.disabled).toBe(false)
    expect(b.getAttribute('aria-busy')).toBeNull()
    expect(b.querySelector('.spin')).toBeNull()
  })
})

describe('placeholders', () => {
  it('a table-shaped one has the rows of the table that is coming, and says what is loading', async () => {
    await act(async () => { root.render(<Skel rows={6} table label="Loading invoices" />) })
    const s = host.querySelector('[role="status"]')!
    expect(s.getAttribute('aria-busy')).toBe('true')
    expect(s.getAttribute('aria-label')).toBe('Loading invoices')
    expect(s.querySelectorAll('.skel-tr')).toHaveLength(6)
  })
})
