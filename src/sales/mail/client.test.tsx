import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mailStatusApi = vi.fn()
vi.mock('../api/mailboxes', () => ({ mailStatusApi: (...a: unknown[]) => mailStatusApi(...a) }))
vi.mock('../data/store', () => ({ S: { session: { userId: 'u-me' } } }))

let unmount: () => void = () => undefined
beforeEach(() => { vi.resetModules(); mailStatusApi.mockReset(); vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(() => { act(() => unmount()); vi.useRealTimers(); vi.unstubAllGlobals() })

/** Mount something that reads the mail state, and return a way to read what it last saw. */
async function ask() {
  const c = await import('./client')
  let seen = ''
  const Probe = () => { seen = c.useMailState().s; return null }
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () => { root.render(<Probe />) })
  unmount = () => root.unmount()
  return { c, now: () => seen }
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('is real Gmail set up?', () => {
  it('a failed check is "error", never "off": a blip must not turn live mail into simulated mail', async () => {
    mailStatusApi.mockRejectedValue(new Error('offline'))
    const { c, now } = await ask()
    await tick(0)
    expect(now()).toBe('error')
    expect(c.mailDecided('error')).toBe(false)
    expect(c.mailDecided('loading')).toBe(false)
    expect(c.mailDecided('live')).toBe(true)
    expect(c.mailDecided('off')).toBe(true)
  })

  it('asks again by itself after a failure, and the answer replaces the error', async () => {
    mailStatusApi.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ configured: true })
    const { now } = await ask()
    await tick(0)
    expect(now()).toBe('error')
    await tick(2500)
    expect(mailStatusApi).toHaveBeenCalledTimes(2)
    expect(now()).toBe('live')
  })
})
