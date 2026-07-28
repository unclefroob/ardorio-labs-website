/**
 * Ops-facing wiki editor. Same data as the customer-facing wiki in buxton-app,
 * but with O2 AI-assisted authoring tools and the ability to edit any page.
 *
 * Trello: W2 editor + O2 AI-assisted drafting.
 */

export default function AdminAssistantWiki() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <p className="text-xs uppercase tracking-wider text-neutral-500">Assistant</p>
      <h1 className="text-3xl font-serif">AI Brain — Ops Editor</h1>
      <p className="text-neutral-600 mt-2">
        Author or revise tone, suburb profiles, objections, scripts, and content buckets.
        Use “Draft from artefacts” to invoke O2.
      </p>
    </div>
  )
}
