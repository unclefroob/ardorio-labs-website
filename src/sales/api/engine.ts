import { salesFetch } from './http'
import type { EngineRunResponse } from './contract'

/**
 * Ask the server to run its sequence engine now rather than at the next scheduled pass. Advisory only:
 * the server runs on its own timer, so a failure here costs latency, never correctness.
 */
export const nudge = () => salesFetch<EngineRunResponse>('/engine/run', { method: 'POST', body: {} })
