import { publish } from './store'
import { scheduleFlush } from './sync'

/** Publish a local mutation to the UI and queue it for saving. Act functions call this once, last. */
export function commit(): void {
  publish()
  scheduleFlush()
}
