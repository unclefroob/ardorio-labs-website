import type { SalesUser } from './types'

/** Who the server engine acts as (`createdBy` / `updatedBy` / `by` of 'system'). Not a member: never added to the user list. */
export const SYSTEM_USER_ID = 'system'

export const SYSTEM_USER: SalesUser = {
  id: SYSTEM_USER_ID, name: 'SalesOS engine', title: 'Automation', email: '', super: false, m: {}, active: false, color: '#8E8897',
  meetingLink: '', createdAt: '', username: 'system',
}
