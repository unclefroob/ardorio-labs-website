import { salesFetch } from './http'
import type { DemoWipeRequest, DemoWipeResponse } from './contract'

/** R11 only. Loading demo data is a client-side batch job owned by the admin unit. */
export const wipeDemo = (req: DemoWipeRequest = {}) =>
  salesFetch<DemoWipeResponse>('/demo/wipe', { method: 'POST', body: req })
