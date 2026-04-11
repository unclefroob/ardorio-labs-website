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

function App() {
  return (
    <HelmetProvider>
    <BrowserRouter>
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
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
    </HelmetProvider>
  )
}

export default App
