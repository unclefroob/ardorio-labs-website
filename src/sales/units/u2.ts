import type { UnitModule } from './types'
import { Deals } from '../pages/deals/Deals'
import { Deal } from '../pages/deals/Deal'
import { LogMeeting } from '../modals/comms/LogMeeting'
import { MeetingBrief } from '../modals/comms/MeetingBrief'
import { CheckSignals } from '../modals/comms/CheckSignals'
import { Compose } from '../modals/comms/Compose'
import { Enrol } from '../modals/comms/Enrol'
import { Enrich } from '../modals/comms/Enrich'
import { FindPeople } from '../modals/comms/FindPeople'
import { SimReply } from '../modals/comms/SimReply'
import { LinkedIn } from '../modals/comms/LinkedIn'
import { AddToList } from '../modals/comms/AddToList'
import { PickContacts } from '../modals/comms/PickContacts'
import { Reassign } from '../modals/comms/Reassign'
import { AddSuppression } from '../modals/comms/AddSuppression'
import { SendEmailTask } from '../modals/comms/SendEmailTask'

export const u2: UnitModule = {
  pages: { deals: Deals, deal: Deal },
  modals: {
    logMeeting: LogMeeting, meetingBrief: MeetingBrief, checkSignals: CheckSignals, compose: Compose, enrol: Enrol, enrich: Enrich, findPeople: FindPeople,
    simReply: SimReply, linkedin: LinkedIn, addToList: AddToList, pickContacts: PickContacts,
    reassign: Reassign, addSuppression: AddSuppression, sendEmailTask: SendEmailTask,
  },
  drawers: {},
}
