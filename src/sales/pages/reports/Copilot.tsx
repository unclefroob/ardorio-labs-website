import { Q } from '../../data/Q'
import { PageHead } from '../../shared/PageHead'
import { ChatBody } from './CopilotChat'

export function Copilot() {
  const ws = Q.wsBiz()
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageHead title="AI Copilot" sub={`Answers use CRM records you can access · scoped to ${ws ? Q.biz(ws)?.name : 'your accessible businesses'} · never sends or changes records without your confirmation`} />
      <div className="card card-b" style={{ height: 'calc(100vh - 200px)', minHeight: 420 }}>
        <ChatBody />
      </div>
    </div>
  )
}
