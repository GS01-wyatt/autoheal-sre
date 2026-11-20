import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Services from './pages/Services'
import LiveMetrics from './pages/LiveMetrics'
import Incidents from './pages/Incidents'
import AutoHealing from './pages/AutoHealing'
import Logs from './pages/Logs'
import { EmptyState } from './components/ui'
import { SearchX } from 'lucide-react'

function NotFound() {
  return (
    <EmptyState
      icon={<SearchX className="h-5 w-5" />}
      title="Page not found"
      text="That page does not exist."
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="services" element={<Services />} />
        <Route path="metrics" element={<LiveMetrics />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="healing" element={<AutoHealing />} />
        <Route path="logs" element={<Logs />} />
        <Route
          path="*"
          element={
            <div className="space-y-4">
              <NotFound />
              <p className="text-center text-sm"><Link className="text-indigo-500 underline" to="/">Back to Overview</Link></p>
            </div>
          }
        />
      </Route>
    </Routes>
  )
}