import type { UnitModule } from './types'
import { Companies } from '../pages/companies/Companies'
import { Company } from '../pages/companies/Company'
import { Contacts } from '../pages/companies/Contacts'
import { Contact } from '../pages/companies/Contact'
import { NewCompany } from '../modals/entities/NewCompany'
import { EditCompany } from '../modals/entities/EditCompany'
import { NewContact } from '../modals/entities/NewContact'
import { EditContact } from '../modals/entities/EditContact'
import { NewDeal } from '../modals/entities/NewDeal'
import { StageCheck } from '../modals/entities/StageCheck'
import { Won } from '../modals/entities/Won'
import { Lost } from '../modals/entities/Lost'
import { NewTask } from '../modals/entities/NewTask'
import { CallOutcome } from '../modals/entities/CallOutcome'
import { ProvisionRosterio } from '../modals/entities/ProvisionRosterio'
import { TaskDrawer } from '../modals/entities/TaskDrawer'

export const u1: UnitModule = {
  pages: { companies: Companies, company: Company, contacts: Contacts, contact: Contact },
  modals: {
    newCompany: NewCompany, editCompany: EditCompany, newContact: NewContact, editContact: EditContact,
    newDeal: NewDeal, stageCheck: StageCheck, won: Won, lost: Lost, newTask: NewTask,
    callOutcome: CallOutcome, logCall: CallOutcome, provisionRosterio: ProvisionRosterio,
  },
  drawers: { task: TaskDrawer },
}
