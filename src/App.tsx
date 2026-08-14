import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import ArdorioAI from './pages/ArdorioAI'
import AINativeCRM from './pages/AINativeCRM'
import Services from './pages/Services'
import ServiceDetail from './pages/ServiceDetail'
import Work from './pages/Work'
import Contact from './pages/Contact'
import PathIQCaseStudy from './pages/work/PathIQ'
import RosterioCaseStudy from './pages/work/Rosterio'
import Newsroom from './pages/Newsroom'
import NewsroomArticle from './pages/NewsroomArticle'
import ClientDashboard from './pages/ClientDashboard'
import AdminLogin from './pages/admin/AdminLogin'
import AdminIndex from './pages/admin/AdminIndex'
import AdminClient from './pages/admin/AdminClient'
import AdminClientNew from './pages/admin/AdminClientNew'
import AdminUsers from './pages/admin/AdminUsers'
import AdminStaff from './pages/admin/AdminStaff'
import AdminInvoices from './pages/admin/AdminInvoices'
import AdminInvoiceEdit from './pages/admin/AdminInvoiceEdit'
import PublicInvoice from './pages/PublicInvoice'
import AdminNewsroom from './pages/admin/AdminNewsroom'
import AdminNewsroomEdit from './pages/admin/AdminNewsroomEdit'
import AcceptInvite from './pages/admin/AcceptInvite'
import AdminAssistantOverview from './pages/admin/assistant/Overview'
import AdminAssistantWiki from './pages/admin/assistant/Wiki'
import AdminAssistantOnboarding from './pages/admin/assistant/Onboarding'
import AdminAssistantContent from './pages/admin/assistant/Content'
import AdminAssistantUsage from './pages/admin/assistant/Usage'
import ProtectedRoute from './components/admin/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { ClientAuthProvider } from './context/ClientAuthContext'
import ClientLogin from './pages/ClientLogin'
import ClientPortal from './pages/ClientPortal'

// index.html ships build-time SEO defaults so non-JS crawlers (social scrapers,
// which never run our JavaScript) still get a valid title, description and share
// preview. Once React + react-helmet-async (in React 19's native metadata mode)
// hoist the per-route tags, both sets live in <head> and duplicate each other.
// We snapshot the build-time defaults at import time — before React mounts, so
// the snapshot contains only the static index.html nodes and never a
// React-managed one — then drop each default once a per-route replacement of the
// same kind exists. JS-rendering search crawlers then index one correct set.
const MANAGED_HEAD_SELECTORS = [
  'title',
  'link[rel="canonical"]',
  'meta[name="description"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[property="og:type"]',
  'meta[property="og:site_name"]',
  'meta[property="og:locale"]',
]

const DEFAULT_SEO_NODES: Element[] =
  typeof document !== 'undefined'
    ? Array.from(document.head.querySelectorAll(MANAGED_HEAD_SELECTORS.join(',')))
    : []

function identitySelector(node: Element): string {
  if (node.tagName === 'TITLE') return 'title'
  if (node.tagName === 'LINK') return 'link[rel="canonical"]'
  const name = node.getAttribute('name')
  if (name) return `meta[name="${name}"]`
  return `meta[property="${node.getAttribute('property')}"]`
}

function SeoHeadCleanup() {
  const { pathname } = useLocation()
  useEffect(() => {
    for (const node of DEFAULT_SEO_NODES) {
      if (!node.isConnected) continue
      // Only drop a build-time default once Helmet has hoisted a replacement of
      // the same kind (>1 match). On routes with no <SEO> (e.g. admin), the
      // default has no replacement and is left in place.
      if (document.head.querySelectorAll(identitySelector(node)).length > 1) {
        node.remove()
      }
    }
  }, [pathname])
  return null
}

function App() {
  return (
    <HelmetProvider>
    <AuthProvider>
    <ClientAuthProvider>
    <BrowserRouter>
      <SeoHeadCleanup />
      <Routes>
        {/* Admin routes — no Navbar/Footer */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/accept-invite" element={<AcceptInvite />} />
        <Route path="/admin" element={<ProtectedRoute><AdminIndex /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/staff" element={<ProtectedRoute><AdminStaff /></ProtectedRoute>} />
        <Route path="/admin/newsroom" element={<ProtectedRoute><AdminNewsroom /></ProtectedRoute>} />
        <Route path="/admin/newsroom/new" element={<ProtectedRoute><AdminNewsroomEdit /></ProtectedRoute>} />
        <Route path="/admin/newsroom/:slug" element={<ProtectedRoute><AdminNewsroomEdit /></ProtectedRoute>} />
        <Route path="/admin/assistant" element={<ProtectedRoute><AdminAssistantOverview /></ProtectedRoute>} />
        <Route path="/admin/assistant/wiki" element={<ProtectedRoute><AdminAssistantWiki /></ProtectedRoute>} />
        <Route path="/admin/assistant/onboarding" element={<ProtectedRoute><AdminAssistantOnboarding /></ProtectedRoute>} />
        <Route path="/admin/assistant/content" element={<ProtectedRoute><AdminAssistantContent /></ProtectedRoute>} />
        <Route path="/admin/assistant/usage" element={<ProtectedRoute><AdminAssistantUsage /></ProtectedRoute>} />
        {/* Declared above /admin/:slug for clarity. React Router v6 ranks the
            static "invoices" segment above the dynamic :slug regardless of
            order, the same way /admin/new already does. */}
        <Route path="/admin/invoices" element={<ProtectedRoute><AdminInvoices /></ProtectedRoute>} />
        <Route path="/admin/invoices/new" element={<ProtectedRoute><AdminInvoiceEdit /></ProtectedRoute>} />
        <Route path="/admin/invoices/:id" element={<ProtectedRoute><AdminInvoiceEdit /></ProtectedRoute>} />
        <Route path="/admin/new" element={<ProtectedRoute><AdminClientNew /></ProtectedRoute>} />
        <Route path="/admin/:slug" element={<ProtectedRoute><AdminClient /></ProtectedRoute>} />

        {/* Hosted invoice — unauthenticated, token-gated, and deliberately
            outside both the admin tree and the marketing Navbar/Footer shell.
            Two segments, so it never collides with the /:slug catch-all. */}
        <Route path="/invoice/:token" element={<PublicInvoice />} />

        {/* Client portal — no Navbar/Footer */}
        <Route path="/login" element={<ClientLogin />} />
        <Route path="/portal" element={<ClientPortal />} />

        {/* Public routes */}
        <Route path="/*" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/ardorio-ai" element={<ArdorioAI />} />
                <Route path="/ai-native-crm" element={<AINativeCRM />} />
                <Route path="/services" element={<Services />} />
                <Route path="/services/:slug" element={<ServiceDetail />} />
                <Route path="/work" element={<Work />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/work/pathiq" element={<PathIQCaseStudy />} />
                <Route path="/work/rosterio" element={<RosterioCaseStudy />} />
                <Route path="/newsroom" element={<Newsroom />} />
                <Route path="/newsroom/:slug" element={<NewsroomArticle />} />
                <Route path="/:slug" element={<ClientDashboard />} />
              </Routes>
            </main>
            <Footer />
          </div>
        } />
      </Routes>
    </BrowserRouter>
    </ClientAuthProvider>
    </AuthProvider>
    </HelmetProvider>
  )
}

export default App
