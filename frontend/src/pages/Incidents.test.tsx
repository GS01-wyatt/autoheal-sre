import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Incidents from './Incidents'
import { incident, logRow, mockApi } from '../test/mockApi'

const renderPage = () => render(<MemoryRouter><Incidents /></MemoryRouter>)

describe('Incidents page', () => {
  it('shows an empty state with an explanation', async () => {
    mockApi({ 'GET /api/incidents': [] })
    renderPage()
    expect(await screen.findByText('No incidents yet')).toBeTruthy()
  })

  it('lists incidents with status, severity and duration', async () => {
    mockApi({
      'GET /api/incidents': [
        incident(),
        incident({ id: 8, service_name: 'Shop', status: 'escalated', severity: 'critical', resolved_at: null, recovery_attempts: 3 }),
      ],
    })
    renderPage()
    expect(await screen.findByText('Shop')).toBeTruthy()
    expect(screen.getByText('escalated')).toBeTruthy()
    expect(screen.getByText('critical')).toBeTruthy()
    expect(screen.getByText('ongoing')).toBeTruthy() // unresolved incident
    expect(screen.getByText('10s')).toBeTruthy() // resolved after 10s
  })

  it('opens the recovery attempts and timeline of an incident', async () => {
    mockApi({
      'GET /api/incidents': [incident()],
      'GET /api/incidents/7': {
        ...incident(),
        attempts: [{ id: 1, incident_id: 7, service_id: 1, attempt_no: 1, action: 'restart:demo-app', outcome: 'success', detail: 'Verified healthy (HTTP 200, 3ms)', started_at: new Date().toISOString(), finished_at: new Date().toISOString() }],
        timeline: [logRow({ id: 1, level: 'warn', message: 'Incident opened after 3 consecutive failures' }), logRow({ id: 2, message: 'Recovered on attempt 1' })],
      },
    })
    renderPage()
    await userEvent.click(await screen.findByLabelText('View incident 7'))
    const detail = (await screen.findByText('Incident #7')).closest('section')!
    expect(await within(detail).findByText('Attempt 1 · restart:demo-app')).toBeTruthy()
    expect(within(detail).getByText('Incident opened after 3 consecutive failures')).toBeTruthy()
    expect(within(detail).getByText('Recovered on attempt 1')).toBeTruthy()
  })

  it('filters by status through the backend', async () => {
    const calls = mockApi({ 'GET /api/incidents': [incident()] })
    renderPage()
    await screen.findByText('Demo App')
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'escalated')
    await waitFor(() => expect(calls.some((c) => c.url.includes('status=escalated'))).toBe(true))
  })

  it('shows an error state when the backend fails', async () => {
    mockApi({})
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toMatch(/not mocked/)
  })
})