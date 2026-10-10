import { nudge } from '../api/engine'
import { flushAll } from './sync'

const WINDOW_MS = 1000

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let again = false

async function run(): Promise<void> {
  timer = null
  running = true
  try {
    // The server must see the enrolment / task writes that made it worth running, so save them first.
    if (await flushAll()) await nudge()
  } catch {
    // Advisory: the server also runs on its own timer, so a failed nudge only costs latency.
  } finally {
    running = false
    if (again) {
      again = false
      nudgeEngine()
    }
  }
}

/**
 * Ask the server engine to run soon after a local change that gives it work (enrol, resume, mark as sent,
 * clock change). Calls inside a one second window coalesce into a single flush-then-nudge. Never throws.
 */
export function nudgeEngine(): void {
  if (running) {
    again = true
    return
  }
  if (timer) return
  timer = setTimeout(() => void run(), WINDOW_MS)
}
