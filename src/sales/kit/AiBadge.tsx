import { badgeText, aiNotConfigured, providerName, type AiTag } from '../ai/client'
import type { AiProvider } from '../api/contract'
import { Chip } from './basic'

/** Marks AI-shaped content with how it was produced. Renders nothing for a refusal or a missing tag. */
export function AiBadge({ tag }: { tag: AiTag | null | undefined }) {
  if (!tag) return null
  const text = badgeText(tag)
  if (!text) return null
  return (
    <Chip tone={tag.source === 'llm' ? 'ai' : ''} icon="spark" title={tag.source === 'llm' ? 'Written by an AI model' : 'Not written by an AI model'}>
      {text}
    </Chip>
  )
}

/** Shown ahead of any call when the server has no key for the provider this feature runs on. */
export function AiNotConfigured({ provider = 'anthropic' }: { provider?: AiProvider }) {
  if (!aiNotConfigured(provider)) return null
  if (provider === 'anthropic') {
    return (
      <Chip icon="spark" title="The server has no AI key configured. Templates are used instead.">
        AI not configured
      </Chip>
    )
  }
  return (
    <Chip icon="spark" title={`The server has no ${providerName(provider)} key configured. Templates are used instead.`}>
      {providerName(provider)} not configured
    </Chip>
  )
}
