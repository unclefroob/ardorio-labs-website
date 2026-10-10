import { salesFetch } from './http'
import type { MeDTO } from './contract'

export const getMe = () => salesFetch<MeDTO>('/me')
