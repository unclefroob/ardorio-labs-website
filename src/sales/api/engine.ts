import { salesFetch } from './http'
import type { LeaseReleaseRequest, LeaseReleaseResponse, LeaseRequest, LeaseResponse } from './contract'

export const acquireLease = (req: LeaseRequest) =>
  salesFetch<LeaseResponse>('/engine/lease', { method: 'POST', body: req })

export const releaseLease = (req: LeaseReleaseRequest, keepalive = false) =>
  salesFetch<LeaseReleaseResponse>('/engine/lease/release', { method: 'POST', body: req, keepalive })
