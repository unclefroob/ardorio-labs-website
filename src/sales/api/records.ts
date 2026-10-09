import { salesFetch } from './http'
import type { BatchRequest, BatchResponse, BootstrapResponse, ChangesResponse } from './contract'

export const getBootstrap = () => salesFetch<BootstrapResponse>('/bootstrap')

export const getChanges = (cursor: string, signal?: AbortSignal) =>
  salesFetch<ChangesResponse>(`/records/changes?cursor=${encodeURIComponent(cursor)}`, { signal })

export const postBatch = (req: BatchRequest) =>
  salesFetch<BatchResponse>('/records/batch', { method: 'POST', body: req })
