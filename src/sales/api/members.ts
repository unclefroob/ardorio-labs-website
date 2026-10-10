import { salesFetch } from './http'
import type {
  CandidatesResponse, CreateMemberRequest, MembersResponse, SalesUserDTO, UpdateMemberRequest,
} from './contract'

export const getMembers = () => salesFetch<MembersResponse>('/members')
export const getCandidates = () => salesFetch<CandidatesResponse>('/members/candidates')
export const createMember = (req: CreateMemberRequest) =>
  salesFetch<SalesUserDTO>('/members', { method: 'POST', body: req })
export const updateMember = (userId: string, req: UpdateMemberRequest) =>
  salesFetch<SalesUserDTO>(`/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: req })
