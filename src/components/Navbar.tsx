import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import Logo from './Logo'

// Grouped under "Products" on desktop so the bar stays readable as the
// product line grows; listed flat in the mobile menu.
const productLinks = [
  { label: 'Ardorio AI', to: '/ardorio-ai', blurb: 'An AI layer for your business' },
  { label: 'Rosterio', to: '/rosterio', blurb: 'Workforce management with your compliance rules built in' },
  { label: 'AI-Native CRMs', to: '/ai-native-crm', blurb: 'A custom CRM you own' },
]

const siteLinks = [
  { label: 'Services', to: '/services' },
  { label: 'Work', to: '/work' },
  { label: 'Newsroom', to: '/newsroom' },
  { label: 'Contact', to: '/contact' },
]

const navLinks = [...productLinks, ...siteLinks]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Prevent scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled ? 'bg-cream-100/95 backdrop-blur-sm' : 'bg-transparent'
        }`}
      >
        <div className="divider absolute bottom-0 left-0 right-0" />
        <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-1.5 font-mono text-sm font-medium tracking-tight text-ink hover:text-stone-700 transition-colors"
          >
            <Logo size={18} />
            ardorio
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-8">
            <div
              className="relative"
              onMouseEnter={() => setProductsOpen(true)}
              onMouseLeave={() => setProductsOpen(false)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setProductsOpen(false)
              }}
            >
              <button
                type="button"
                onClick={() => setProductsOpen((v) => !v)}
                onKeyDown={(e) => e.key === 'Escape' && setProductsOpen(false)}
                aria-expanded={productsOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1 text-sm transition-colors ${
                  productLinks.some((l) => l.to === location.pathname)
                    ? 'text-ink font-medium'
                    : 'text-stone-600 hover:text-ink'
                }`}
              >
                Products
                <ChevronDown
                  size={14}
                  className={`transition-transform ${productsOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence>
                {productsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-1/2 -translate-x-1/2 top-full pt-3"
                  >
                    <div className="w-72 bg-cream-100 border border-cream-300 rounded-xl p-2 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                      {productLinks.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          onClick={() => setProductsOpen(false)}
                          className="block rounded-lg px-3 py-2.5 hover:bg-cream-200 transition-colors"
                        >
                          <span className="block text-sm text-ink font-medium">{link.label}</span>
                          <span className="block text-xs text-stone-500 mt-0.5">{link.blurb}</span>
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {siteLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm transition-colors ${
                  location.pathname === link.to
                    ? 'text-ink font-medium'
                    : 'text-stone-600 hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link to="/contact" className="btn-primary">
              Get in touch
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden text-sm text-stone-600 hover:text-ink transition-colors font-mono"
            aria-label="Toggle menu"
          >
            {open ? 'close' : 'menu'}
          </button>
        </nav>
      </header>

      {/* Mobile fullscreen menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-cream-100 flex flex-col"
          >
            <div className="h-14" /> {/* Navbar height spacer */}
            <div className="flex-1 flex flex-col justify-center px-8 pb-16 gap-2">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link
                    to={link.to}
                    className="block py-3 text-3xl sm:text-4xl font-serif text-ink border-b border-cream-300 hover:text-stone-700 transition-colors"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="mt-8"
              >
                <Link to="/contact" className="btn-primary text-base px-6 py-3">
                  Get in touch
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
