/**
 * Trello: O1 content intake review. Lists customer-uploaded artefacts,
 * lets ops trigger O2 wiki authoring jobs from a selection.
 */

export default function AdminAssistantContent() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <p className="text-xs uppercase tracking-wider text-neutral-500">Assistant</p>
      <h1 className="text-3xl font-serif">Content artefacts</h1>
      <p className="text-neutral-600 mt-2">
        Customer-uploaded emails, listings, IG captions. Select → draft wiki page (O2).
      </p>
    </div>
  )
}
