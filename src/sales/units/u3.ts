import type { UnitModule } from './types'
import { Sequences } from '../pages/sequences/Sequences'
import { Sequence } from '../pages/sequences/Sequence'
import { Templates } from '../pages/sequences/Templates'
import { Inbox } from '../pages/inbox/Inbox'
import { Tasks } from '../pages/inbox/Tasks'
import { Activities } from '../pages/inbox/Activities'
import { Prospecting } from '../pages/inbox/Prospecting'
import { Lists } from '../pages/inbox/Lists'
import { NewSeq } from '../modals/seq/NewSeq'
import { ListEdit } from '../modals/lists/ListEdit'

export const u3: UnitModule = {
  pages: {
    sequences: Sequences, sequence: Sequence, templates: Templates,
    inbox: Inbox, tasks: Tasks, activities: Activities, prospecting: Prospecting, lists: Lists,
  },
  modals: { newSeq: NewSeq, listEdit: ListEdit },
  drawers: {},
}
