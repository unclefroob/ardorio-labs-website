import type { UnitModule } from './types'
import { Deals } from '../pages/deals/Deals'
import { Deal } from '../pages/deals/Deal'
import { Customers } from '../pages/customers/Customers'
import { RosterioAccount } from '../pages/rosterio/RosterioAccount'
import { LogMeeting } from '../modals/comms/LogMeeting'
import { MeetingBrief } from '../modals/comms/MeetingBrief'
import { CancelMeeting, RescheduleMeeting } from '../modals/comms/MeetingChange'
import { VoidActivity } from '../modals/entities/VoidActivity'
import { CheckSignals } from '../modals/comms/CheckSignals'
import { Compose } from '../modals/comms/Compose'
import { Enrol } from '../modals/comms/Enrol'
import { Enrich } from '../modals/comms/Enrich'
import { FindMobile } from '../modals/comms/FindMobile'
import { FindPeople } from '../modals/comms/FindPeople'
import { SimReply } from '../modals/comms/SimReply'
import { LinkedIn } from '../modals/comms/LinkedIn'
import { AddToList } from '../modals/comms/AddToList'
import { PickContacts } from '../modals/comms/PickContacts'
import { Reassign } from '../modals/comms/Reassign'
import { ChangeBusinesses } from '../modals/entities/ChangeBusinesses'
import { CompanyResearch } from '../modals/entities/CompanyResearch'
import { AddSuppression } from '../modals/comms/AddSuppression'
import { SendEmailTask } from '../modals/comms/SendEmailTask'

export const u2: UnitModule = {
  pages: { deals: Deals, deal: Deal, customers: Customers, rosterioCustomers: Customers, rosterioAccount: RosterioAccount },
  modals: {
    logMeeting: LogMeeting, meetingBrief: MeetingBrief, cancelMeeting: CancelMeeting, rescheduleMeeting: RescheduleMeeting, voidActivity: VoidActivity, checkSignals: CheckSignals, compose: Compose, enrol: Enrol, enrich: Enrich, findMobile: FindMobile, findPeople: FindPeople,
    simReply: SimReply, linkedin: LinkedIn, addToList: AddToList, pickContacts: PickContacts,
    reassign: Reassign, changeBusinesses: ChangeBusinesses, companyResearch: CompanyResearch, addSuppression: AddSuppression, sendEmailTask: SendEmailTask,
  },
  drawers: {},
}
