/**
 * Ardorio ops view of the Assistant customer. Health, last activity, subscription
 * state, links to the deeper Wiki / Onboarding / Content / Usage views.
 *
 * Trello: cross-cutting (F4 cost view + onboarding status + tone calibration progress).
 */

import { Link } from 'react-router-dom'

const SECTIONS = [
  { to: '/admin/assistant/wiki', label: 'AI Brain wiki', desc: 'Author + edit Assistant tone, suburb, objection, and script pages (W2 + O2).' },
  { to: '/admin/assistant/onboarding', label: 'Onboarding', desc: 'O1 intake review, O3 calibration test pass, O5 completion checklist.' },
  { to: '/admin/assistant/content', label: 'Content artefacts', desc: 'Customer-uploaded emails, listings, IG examples awaiting wiki ingestion.' },
  { to: '/admin/assistant/usage', label: 'Usage & cost (internal)', desc: 'F4 cost dashboard, cache hit rate, per-user spend, runaway-use alerts.' },
]

export default function AdminAssistantOverview() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-6 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-neutral-500">Client</p>
        <h1 className="text-3xl font-serif">Assistant</h1>
        <p className="text-neutral-600 mt-1">
          Real estate firm. AI assistant deployed at buxton.ardorio.co.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {SECTIONS.map(s => (
          <Link
            key={s.to}
            to={s.to}
            className="block border rounded-md p-5 hover:bg-neutral-50 transition-colors"
          >
            <h3 className="font-medium">{s.label}</h3>
            <p className="text-sm text-neutral-600 mt-1">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
