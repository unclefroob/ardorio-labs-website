import {
  Search,
  ClipboardCheck,
  Blocks,
  Users,
  GraduationCap,
  ShieldCheck,
  Sprout,
  PenTool,
  Zap,
  FlaskConical,
  Rocket,
  BookOpen,
  Network,
  Bot,
  FileStack,
  Gauge,
  Sparkles,
  Workflow,
  Cpu,
  type LucideIcon,
} from 'lucide-react'

export interface ServiceStep {
  title: string
  body: string
  icon: LucideIcon
}

export interface ServiceCapability {
  name: string
  description: string
  icon: LucideIcon
}

export interface ServiceLevel {
  tag: string // "Beginner", "Intermediate", "Advanced"
  name: string
  audience: string
  outcomes: string[]
  icon: LucideIcon
}

export interface ServiceBridge {
  label: string
  title: string
  body: string
  toSlug: string
  toLabel: string
}

export interface ServiceTool {
  name: string
  provider: string
  description: string
}

export interface Service {
  slug: string
  title: string
  tagline: string // short summary for the listing card
  bestFit: string
  description: string
  offerings: string[]
  steps: ServiceStep[]
  levels?: ServiceLevel[]
  tools?: ServiceTool[]
  bridge?: ServiceBridge
  capabilities?: ServiceCapability[]
  seoTitle?: string // overrides the default "<title> | Services" meta title
  seoDescription?: string // overrides tagline as the meta description
}

export const services: Service[] = [
  {
    slug: 'applied-ai',
    title: 'Custom builds you own',
    tagline:
      'We build custom, AI-native systems that do your team\'s manual work, from internal tools and automations to full AI-native CRMs, in place of the SaaS you rent.',
    bestFit: 'Businesses tired of renting generic SaaS that never quite fits how they work',
    description:
      "Most organisations don't have an AI problem, they have a stack of rented SaaS that doesn't fit how they work and a lot of manual work filling the gaps. We build custom, AI-native systems that do that work instead, and that you own outright rather than rent by the seat. Our AI-native CRMs are the flagship, but the same approach covers internal tools, workflow automation, and the integrations that hold it together. We build what we recommend, so you get a working system in production, not a strategy deck that sits on a shelf.",
    offerings: [
      'AI-native CRMs',
      'Custom internal tools and full-stack products',
      'Workflow automation and integration',
      'Custom AI features (RAG, agents, LLM integration)',
      'Legacy and SaaS replacement',
      'Governance, guardrails and responsible use',
    ],
    steps: [
      {
        title: 'Find the gaps',
        icon: Search,
        body: 'We come in for a small, focused engagement and work alongside your team to find the process optimisations worth pursuing. And if you already know what you need, we can skip ahead and go straight to the plan.',
      },
      {
        title: 'Agree the plan',
        icon: ClipboardCheck,
        body: "We turn what we find into a plan with measurable outcomes. You decide whether to go ahead, and the plan is vendor-neutral, so it stays commercially viable with anyone, not just us.",
      },
      {
        title: 'Build and integrate',
        icon: Blocks,
        body: 'We build the product and handle the integrations. Start low-cost upfront on a monthly model, or we build the IP for you at a fixed price.',
      },
      {
        title: 'Enable your team',
        icon: Users,
        body: "We train and enable your team to run it day to day. This is our AI Training & Enablement work built into the handover, so the capability stays in-house after we're gone.",
      },
    ],
    capabilities: [
      {
        name: 'LLM-Wiki',
        icon: BookOpen,
        description: 'A searchable, cited knowledge base your team can ask in plain language.',
      },
      {
        name: 'Algorithmic search',
        icon: Search,
        description: 'Semantic and vector search that surfaces the right answer across your data, not just keyword matches.',
      },
      {
        name: 'RAG pipelines',
        icon: Network,
        description: 'Answers grounded in your own documents and systems, with citations back to the source.',
      },
      {
        name: 'AI agents',
        icon: Bot,
        description: 'Agents that take multi-step actions across your tools, inside clear guardrails.',
      },
      {
        name: 'Document ingestion',
        icon: FileStack,
        description: 'Turn PDFs, emails and messy files into structured, queryable data.',
      },
      {
        name: 'Evaluation engines',
        icon: Gauge,
        description: 'Score open-ended work consistently against your own rubric.',
      },
    ],
  },
  {
    slug: 'training',
    title: 'AI Training & Enablement',
    tagline:
      'We train your team to get through their real work faster with AI, from their first prompt to building with it, across ChatGPT, Microsoft Copilot and Claude, with the guardrails to use them safely.',
    bestFit: 'Teams who want to work faster with AI and aren\'t sure where to start',
    description:
      "Most teams don't need another AI talking point, they need to get through their real work faster. We train your people directly on the tools they already have, ChatGPT, Microsoft Copilot and Claude, from staff using AI for the first time through to the technical champions who'll build with it. Hands-on workshops, practical prompt engineering and workflow design, agents and context engineering for the people ready to go deeper, and the responsible-use guardrails that keep it safe. It's also how much of our build work starts, because once a team sees what's possible, the work worth automating becomes obvious.",
    offerings: [
      'AI literacy and hands-on training',
      'ChatGPT, Copilot and Claude enablement',
      'Prompt engineering and workflow design',
      'Building AI agents and custom assistants',
      'Context engineering and RAG foundations',
      'Responsible-use policy and guardrails',
      'Executive and board advisory',
    ],
    levels: [
      {
        tag: 'Beginner',
        name: 'Foundations',
        audience: 'Whole teams and staff new to AI',
        icon: Sparkles,
        outcomes: [
          'What tools like ChatGPT, Copilot and Claude do well',
          'Everyday prompting that saves real time',
          'Using AI safely with company information',
        ],
      },
      {
        tag: 'Intermediate',
        name: 'Applied',
        audience: 'Power users and team leads',
        icon: Workflow,
        outcomes: [
          'Prompt engineering for the workflows you run today',
          'Building custom assistants and shared prompt libraries',
          'Giving AI the right context from your documents and data',
        ],
      },
      {
        tag: 'Advanced',
        name: 'Builder',
        audience: 'Technical staff and internal champions',
        icon: Cpu,
        outcomes: [
          'Building AI agents that take multi-step actions',
          'Context engineering and retrieval (RAG) to keep answers grounded',
          'Wiring AI into your systems and APIs, then evaluating what you ship',
        ],
      },
    ],
    tools: [
      {
        name: 'ChatGPT',
        provider: 'OpenAI',
        description:
          'Writing, research and analysis, plus custom GPTs your team can share across everyday work.',
      },
      {
        name: 'Microsoft Copilot',
        provider: 'Microsoft',
        description:
          'Real value from Copilot across Microsoft 365, in Word, Excel, Outlook and Teams, and GitHub Copilot for developers.',
      },
      {
        name: 'Claude',
        provider: 'Anthropic',
        description:
          'Long-document work, coding and building agents that take real actions inside clear guardrails.',
      },
    ],
    bridge: {
      label: 'Where it leads',
      title: 'Training is where the build starts',
      body: "Once a team sees what AI can really do, the gaps worth fixing become obvious. By then we already understand your workflows, so we can build the custom tools, agents and integrations that turn those first wins into real leverage.",
      toSlug: 'applied-ai',
      toLabel: 'See how we build',
    },
    steps: [
      {
        title: 'Assess',
        icon: Search,
        body: 'We look at how your team works today and where AI could genuinely help, so the training targets real tasks rather than generic demos.',
      },
      {
        title: 'Train hands-on',
        icon: GraduationCap,
        body: 'We run practical workshops on the tools and workflows your team actually uses, with prompting and workflow design built around your work.',
      },
      {
        title: 'Set the guardrails',
        icon: ShieldCheck,
        body: 'We put responsible-use policy and guardrails in place so your people can move quickly without creating risk.',
      },
      {
        title: 'Embed it',
        icon: Sprout,
        body: 'We check back in and help the new habits stick. This is often where the gaps worth building surface.',
      },
    ],
    seoTitle: 'AI Training for Teams | ChatGPT, Copilot & Claude',
    seoDescription:
      'Hands-on AI training for teams, beginner to advanced. Learn ChatGPT, Microsoft Copilot and Claude, prompt engineering, building AI agents and context engineering (RAG), with responsible-use guardrails.',
  },
  {
    slug: 'mvp',
    title: 'Zero to MVP',
    tagline:
      'We build POCs and MVPs for founders fast, enough real product to test the idea, launch, and raise or sell against.',
    bestFit: 'Founders with strong domain insight and no time to build a team',
    description:
      'Founders come to us with sharp domain insight and no time to build a team. We build the POC or MVP fast, enough real product to put in front of users, test the idea, and raise or sell against. Product strategy, full-stack build, AI features, and the push to launch.',
    offerings: [
      'Rapid POC and MVP builds',
      'Product strategy and validation',
      'Full-stack development',
      'AI-powered product features',
      'UX and interface design',
      'Launch and go-to-market support',
    ],
    steps: [
      {
        title: 'Shape it',
        icon: PenTool,
        body: 'We sharpen the idea into a scope you can actually ship, focused on the riskiest assumptions first.',
      },
      {
        title: 'Build fast',
        icon: Zap,
        body: 'We build the POC or MVP quickly, full-stack and with the AI features that matter, enough real product to put in front of users.',
      },
      {
        title: 'Test and learn',
        icon: FlaskConical,
        body: 'We get it in front of real users, measure what happens, and iterate on what the evidence tells us.',
      },
      {
        title: 'Launch',
        icon: Rocket,
        body: "We push it to launch and set you up to keep going, whether that's raising, selling, or scaling.",
      },
    ],
  },
]

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug)
}
