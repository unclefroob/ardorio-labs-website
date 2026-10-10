import { Q } from '../../data/Q'
import { Drawer } from '../../kit'
import { ChatBody, ctxOf } from '../../pages/reports/CopilotChat'
import type { Route } from '../../ui/store'

export function CopilotDrawer({ ctx }: { ctx?: Route }) {
  const c = ctxOf(ctx)
  const ws = Q.wsBiz()
  return (
    <Drawer title="AI Copilot" sub={c?.label ? `Context: ${c.label}` : `Workspace: ${ws ? Q.biz(ws)?.name : 'All businesses'}`}>
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <ChatBody ctx={c} />
      </div>
    </Drawer>
  )
}
