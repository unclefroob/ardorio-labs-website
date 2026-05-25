import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Services from './pages/Services'
import Work from './pages/Work'
import Contact from './pages/Contact'
import PathIQCaseStudy from './pages/work/PathIQ'
import ClevedonCaseStudy from './pages/work/Clevedon'
import RosterioCaseStudy from './pages/work/Rosterio'
import Newsroom from './pages/Newsroom'
import NewsroomArticle from './pages/NewsroomArticle'
import ClientDashboard from './pages/ClientDashboard'
import AdminLogin from './pages/admin/AdminLogin'
import AdminIndex from './pages/admin/AdminIndex'
import AdminClient from './pages/admin/AdminClient'
import AdminUsers from './pages/admin/AdminUsers'
import ProtectedRoute from './components/admin/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { ClientAuthProvider } from './context/ClientAuthContext'
import ClientLogin from './pages/ClientLogin'
import ClientPortal from './pages/ClientPortal'

function App() {
  return (
    <HelmetProvider>
    <AuthProvider>
    <ClientAuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Admin routes — no Navbar/Footer */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<ProtectedRoute><AdminIndex /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/new" element={<ProtectedRoute><AdminClient /></ProtectedRoute>} />
        <Route path="/admin/:slug" element={<ProtectedRoute><AdminClient /></ProtectedRoute>} />

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
                <Route path="/services" element={<Services />} />
                <Route path="/work" element={<Work />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/work/pathiq" element={<PathIQCaseStudy />} />
                <Route path="/work/clevedon" element={<ClevedonCaseStudy />} />
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
