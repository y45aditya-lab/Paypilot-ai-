import { useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Checkout from './pages/Checkout.jsx'
import Dashboard from './pages/Dashboard.jsx'

function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="min-h-screen md:flex">
      <Navbar currentPage={page} onNavigate={setPage} />
      {page === 'checkout' ? <Checkout /> : <Dashboard />}
    </div>
  )
}

export default App
