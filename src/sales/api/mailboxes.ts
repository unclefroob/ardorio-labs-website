import { salesFetch } from './http'

/** Real Gmail connections. Whether the server can do them at all; never carries a key or a token. */
export interface MailStatus { configured: boolean; reason?: string }
export const mailStatusApi = (signal?: AbortSignal) => salesFetch<MailStatus>('/mailboxes/google/status', { signal })

/** The Google consent address for one mailbox. The browser is sent there, and Google sends it back to /sales/integrations. */
export const connectMailboxApi = (id: string) => salesFetch<{ url: string }>(`/mailboxes/${encodeURIComponent(id)}/connect`, { method: 'POST' })
export const disconnectMailboxApi = (id: string) => salesFetch<{ ok: true }>(`/mailboxes/${encodeURIComponent(id)}/disconnect`, { method: 'POST' })
export const syncMailboxApi = (id: string) => salesFetch<{ ran: boolean; reason: string | null; stored: number; fetched: number }>(`/mailboxes/${encodeURIComponent(id)}/sync`, { method: 'POST' })
