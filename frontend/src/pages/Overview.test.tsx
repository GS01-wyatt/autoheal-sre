import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Overview from './Overview'
import { health, info, metric, mockApi } from '../test/mockApi'

const checks = [{ id: 1, service_id: 1, status: 'up', http_status: 200, response_time_ms: 120, error: null, checked_at: new Date().toISOString() }]
const incident = { id: 7, service_id: 2, service_name: 'Shop API', severity: 'warning', status: 'open', opened_at: new Date().toISOString(), resolved_at: null, recovery_attempts: 0 }

const renderPage = () => render(<MemoryRouter><Overview /></MemoryRouter>)

describe('Overview', () => {
  it('shows real numbers from the backend', async () => {
    mockApi({
      'GET /api/metrics': [metric(), metric({ service_id: 2, name: 'Shop API', last_status: 'down', successful_checks: 5, failed_checks: 5, uptime_percent: 50, consecutive_failures: 5 })],
      'GET /api/incidents': [incident],
      'GET /api/services/1/checks': checks,
      'GET /api/health': health,
      'GET /api/info': info,
    })
    renderPage()
    expect(await screen.findByText('1 of 2 services are down')).toBeTruthy()
    expect(await screen.findByText('Shop API', { selector: 'p' })).toBeTruthy() // active incident card
    expect(screen.getByText('1/2')).toBeTruthy() // services up
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0)
  })

  it('says all systems operational when everything is up', async () => {
    mockApi({ 'GET /api/metrics': [metric()], 'GET /api/incidents': [], 'GET /api/services/1/checks': checks })
    renderPage()
    expect(await screen.findByText('All systems operational')).toBeTruthy()
    expect(await screen.findByText('No active incidents')).toBeTruthy()
  })

  it('shows an empty state when there are no services', async () => {
    mockApi({ 'GET /api/metrics': [], 'GET /api/incidents': [] })
    renderPage()
    expect(await screen.findByText('No services yet. Add one on the Services page.')).toBeTruthy()
  })

  it('shows an error with a working retry when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Cannot reach the backend/)

    mockApi({ 'GET /api/metrics': [metric()], 'GET /api/incidents': [], 'GET /api/services/1/checks': checks })
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('All systems operational')).toBeTruthy()
  })
})