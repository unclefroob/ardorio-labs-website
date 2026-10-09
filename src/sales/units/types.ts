import type { ComponentType } from 'react'

// Components are registered by name and rendered through one cast in the hosts, so each unit's
// props stay its own. `never` accepts any component without widening to any.
export type Registered = ComponentType<never>

export interface UnitModule {
  pages: Record<string, Registered>
  modals: Record<string, Registered>
  drawers: Record<string, Registered>
}
