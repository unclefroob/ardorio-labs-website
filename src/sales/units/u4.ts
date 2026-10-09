import type { UnitModule } from './types'
import { Dashboard } from '../pages/home/Dashboard'
import { MyDay } from '../pages/home/MyDay'
import { Notifications } from '../pages/home/Notifications'
import { Copilot } from '../pages/reports/Copilot'
import { Recs } from '../pages/reports/Recs'
import { Reports } from '../pages/reports/Reports'
import { Goals } from '../pages/reports/Goals'
import { Settings } from '../pages/admin/Settings'
import { Users } from '../pages/admin/Users'
import { Integrations } from '../pages/admin/Integrations'
import { Pipelines } from '../pages/admin/Pipelines'
import { CrossIntro } from '../modals/reports/CrossIntro'
import { GoalModal } from '../modals/reports/GoalModal'
import { CopilotDrawer } from '../modals/reports/CopilotDrawer'
import { UserEdit } from '../modals/admin/UserEdit'
import { TeamEdit } from '../modals/admin/TeamEdit'
import { Migrate } from '../modals/admin/Migrate'
import { UserDrawer } from '../modals/admin/UserDrawer'

export const u4: UnitModule = {
  pages: {
    dashboard: Dashboard, myday: MyDay, notifications: Notifications,
    copilot: Copilot, recs: Recs, reports: Reports, goals: Goals,
    settings: Settings, users: Users, integrations: Integrations, pipelines: Pipelines,
  },
  modals: { crossIntro: CrossIntro, goal: GoalModal, userEdit: UserEdit, teamEdit: TeamEdit, migrate: Migrate },
  drawers: { copilot: CopilotDrawer, user: UserDrawer },
}
