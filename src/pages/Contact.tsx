import { useState } from 'react'
import { motion } from 'framer-motion'
import SEO from '../components/SEO'

type FormState = 'idle' | 'sending' | 'success' | 'error'

interface FormData {
  name: string
  email: string
  company: string
  phone: string
  message: string
  type: string
}

const CONTACT_ENDPOINT = '/.netlify/functions/contact'

const inquiryTypes = [
  { value: 'enterprise', label: 'Enterprise technology' },
  { value: 'ai', label: 'AI engineering' },
  { value: 'startup', label: 'Startup partnership' },
  { value: 'other', label: 'Something else' },
]

const inputClass =
  'w-full px-0 py-3 bg-transparent border-b border-cream-300 text-ink text-sm placeholder-stone-400 focus:outline-none focus:border-stone-800 transition-colors'

export default function Contact() {
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
    type: '',
  })
  const [state, setState] = useState<FormState>('idle')
  const [errors, setErrors] = useState<Partial<FormData>>({})

  const validate = (): boolean => {
    const next: Partial<FormData> = {}
    if (!form.name.trim()) next.name = 'Required'
    if (!form.email.trim()) next.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email'
    if (!form.message.trim()) next.message = 'Required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setState('sending')
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setState('success')
        setForm({ name: '', email: '', company: '', phone: '', message: '', type: '' })
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
    <div className="pt-14">
      <SEO
        title="Contact — Start a Conversation"
        description="Talk to Ardorio about enterprise technology, AI engineering, or a startup product partnership in Australia. We respond within 24 hours."
        canonical="/contact"
      />
      <div className="divider" />

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Left */}
          <div className="lg:col-span-4">
            <p className="label mb-6">Contact</p>
            <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight mb-8">
              Let's talk.
            </h1>
            <div className="space-y-6 text-sm text-stone-600">
              <div>
                <p className="label mb-1.5">Email</p>
                <a href="mailto:hello@ardorio.co" className="text-ink hover:underline underline-offset-4">
                  hello@ardorio.co
                </a>
              </div>
              <div>
                <p className="label mb-1.5">Response time</p>
                <p>Within 24 hours</p>
              </div>
              <div>
                <p className="label mb-1.5">Legal entity</p>
                <p>Ardorio Pty Ltd</p>
                <p className="mt-1 text-stone-500">ABN 67 676 147 658</p>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-8">
            {state === 'success' ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-8"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-6">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="font-serif text-3xl text-ink mb-3">Message sent.</h2>
                <p className="text-stone-600 mb-8">We'll get back to you within 24 hours.</p>
                <button
                  onClick={() => setState('idle')}
                  className="btn-ghost"
                >
                  Send another
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8 pt-2">
                {/* Row 1 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className="label block mb-2" htmlFor="name">
                      Name <span className="text-red-400 normal-case not-italic" style={{ fontSize: '10px' }}>*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      className={inputClass}
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1 font-mono">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="label block mb-2" htmlFor="email">
                      Email <span className="text-red-400 normal-case not-italic" style={{ fontSize: '10px' }}>*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@company.com"
                      className={inputClass}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1 font-mono">{errors.email}</p>}
                  </div>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className="label block mb-2" htmlFor="company">Company</label>
                    <input
                      id="company"
                      name="company"
                      type="text"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Your company"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="label block mb-2" htmlFor="phone">Phone</label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="Your phone number"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Row 3 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className="label block mb-2" htmlFor="type">Inquiry type</label>
                    <select
                      id="type"
                      name="type"
                      value={form.type}
                      onChange={handleChange}
                      className={`${inputClass} appearance-none cursor-pointer`}
                    >
                      <option value="">Select...</option>
                      {inquiryTypes.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="label block mb-2" htmlFor="message">
                    Message <span className="text-red-400 normal-case not-italic" style={{ fontSize: '10px' }}>*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    value={form.message}
                    onChange={handleChange}
                    placeholder="What are you working on?"
                    className={`${inputClass} resize-none`}
                  />
                  {errors.message && <p className="text-red-500 text-xs mt-1 font-mono">{errors.message}</p>}
                </div>

                {state === 'error' && (
                  <p className="text-red-500 text-sm font-mono">
                    Something went wrong. Email us directly at{' '}
                    <a href="mailto:hello@ardorio.co" className="underline">
                      hello@ardorio.co
                    </a>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={state === 'sending'}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
                    'Send message'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
