import { useState } from 'react'
import { ArrowRight, Mail, MessageSquare } from 'lucide-react'

type FormState = 'idle' | 'sending' | 'success' | 'error'

interface FormData {
  name: string
  email: string
  company: string
  message: string
  type: string
}

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'

const inquiryTypes = [
  { value: 'enterprise', label: 'Enterprise consulting' },
  { value: 'ai', label: 'AI consulting' },
  { value: 'startup', label: 'Startup partnership' },
  { value: 'other', label: 'Something else' },
]

export default function Contact() {
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    message: '',
    type: '',
  })
  const [state, setState] = useState<FormState>('idle')
  const [errors, setErrors] = useState<Partial<FormData>>({})

  const validate = (): boolean => {
    const next: Partial<FormData> = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (!form.email.trim()) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email'
    if (!form.message.trim()) next.message = 'Message is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setState('sending')

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        setState('success')
        setForm({ name: '', email: '', company: '', message: '', type: '' })
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  return (
    <div className="pt-24">
      {/* Header */}
      <section className="py-20 hero-glow">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-brand-light text-sm font-semibold uppercase tracking-widest mb-4">Contact</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            Let's talk
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Tell us what you're working on. We respond within 24 hours.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Left info */}
          <div className="lg:col-span-2">
            <div className="flex flex-col gap-6">
              <div className="glass rounded-2xl p-7">
                <div className="w-10 h-10 bg-brand/15 rounded-xl flex items-center justify-center mb-4">
                  <Mail size={18} className="text-brand-light" />
                </div>
                <h3 className="text-white font-semibold mb-2">Email us</h3>
                <a
                  href="mailto:hello@ardorio.co"
                  className="text-white/50 text-sm hover:text-white transition-colors"
                >
                  hello@ardorio.co
                </a>
              </div>

              <div className="glass rounded-2xl p-7">
                <div className="w-10 h-10 bg-brand/15 rounded-xl flex items-center justify-center mb-4">
                  <MessageSquare size={18} className="text-brand-light" />
                </div>
                <h3 className="text-white font-semibold mb-2">What to expect</h3>
                <ul className="flex flex-col gap-2 text-sm text-white/50">
                  <li>Response within 24 hours</li>
                  <li>No-pressure intro call</li>
                  <li>Clear scope and pricing upfront</li>
                </ul>
              </div>

              <div className="glass rounded-2xl p-7">
                <h3 className="text-white font-semibold mb-3">Good fit for</h3>
                <ul className="flex flex-col gap-2 text-sm text-white/50">
                  <li>→ Enterprise tech modernisation</li>
                  <li>→ AI strategy and deployment</li>
                  <li>→ Startup product launch</li>
                  <li>→ Engineering team augmentation</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3">
            {state === 'success' ? (
              <div className="glass rounded-2xl p-12 text-center h-full flex flex-col items-center justify-center">
                <div className="w-14 h-14 bg-green-500/15 rounded-full flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Message sent</h3>
                <p className="text-white/50 text-sm mb-8">
                  Thanks for reaching out. We'll get back to you within 24 hours.
                </p>
                <button
                  onClick={() => setState('idle')}
                  className="text-brand-light text-sm hover:text-white transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 lg:p-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  {/* Name */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5" htmlFor="name">
                      Name <span className="text-brand-light">*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      className={`w-full px-4 py-2.5 bg-white/5 border rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand transition-colors ${
                        errors.name ? 'border-red-500/50' : 'border-white/10'
                      }`}
                    />
                    {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5" htmlFor="email">
                      Email <span className="text-brand-light">*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@company.com"
                      className={`w-full px-4 py-2.5 bg-white/5 border rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand transition-colors ${
                        errors.email ? 'border-red-500/50' : 'border-white/10'
                      }`}
                    />
                    {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  {/* Company */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5" htmlFor="company">
                      Company
                    </label>
                    <input
                      id="company"
                      name="company"
                      type="text"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Acme Corp"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand transition-colors"
                    />
                  </div>

                  {/* Inquiry type */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5" htmlFor="type">
                      Inquiry type
                    </label>
                    <select
                      id="type"
                      name="type"
                      value={form.type}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand transition-colors appearance-none"
                    >
                      <option value="" className="bg-navy-900">Select one...</option>
                      {inquiryTypes.map((t) => (
                        <option key={t.value} value={t.value} className="bg-navy-900">
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Message */}
                <div className="mb-7">
                  <label className="block text-sm text-white/60 mb-1.5" htmlFor="message">
                    Message <span className="text-brand-light">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us what you're working on..."
                    className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand transition-colors resize-none ${
                      errors.message ? 'border-red-500/50' : 'border-white/10'
                    }`}
                  />
                  {errors.message && <p className="text-red-400 text-xs mt-1">{errors.message}</p>}
                </div>

                {state === 'error' && (
                  <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    Something went wrong. Please try emailing us at{' '}
                    <a href="mailto:hello@ardorio.co" className="underline">
                      hello@ardorio.co
                    </a>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={state === 'sending'}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand hover:bg-brand-light disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {state === 'sending' ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      Send message <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
