import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AutoHealing from './AutoHealing'
import { healing, incident, info, mockApi, reply } from '../test/mockApi'

const renderPage = () => render(<MemoryRouter><AutoHealing /></MemoryRouter>)

describe('Auto-Healing page', () => {
  it('shows the recovery policy and per-service state', async () => {
    mockApi({
      'GET /api/healing/status': [
        healing(),
        healing({ service_id: 2, name: 'Shop', recovery_target: null, total_restarts: 0, last_outcome: null }),
      ],
      'GET /api/info': info,
      'GET /api/incidents': [incident(), incident({ id: 9, status: 'escalated', resolved_at: null })],
    })
    renderPage()
    expect(await screen.findByText('Demo App')).toBeTruthy()
    expect(screen.getByText('3 in a row')).toBeTruthy() // policy
    expect(screen.getByText('6 per hour')).toBeTruthy()
    expect(screen.getByText('None (manual only)')).toBeTruthy() // Shop has no target
    expect(screen.getAllByText('Healthy').length).toBe(2)
    expect(await screen.findByText('Escalated to a human')).toBeTruthy()
  })

  it('shows cooldown and retry progress during an incident', async () => {
    mockApi({
      'GET /api/healing/status': [healing({ active_incident_id: 4, incident_status: 'open', attempts_used: 2, cooldown_remaining_ms: 7200 })],
      'GET /api/info': info,
      'GET /api/incidents': [],
    })
    renderPage()
    expect(await screen.findByText('Cooling down 8s')).toBeTruthy()
    expect(screen.getByText('2/3')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Attempts used for Demo App' }).getAttribute('aria-valuenow')).toBe('2')
  })

  it('flags escalated services clearly', async () => {
    mockApi({
      'GET /api/healing/status': [healing({ active_incident_id: 4, incident_status: 'escalated', attempts_used: 3 })],
      'GET /api/info': info,
      'GET /api/incidents': [],
    })
    renderPage()
    expect(await screen.findByText('Escalated: needs a human')).toBeTruthy()
  })

  it('hides the simulation panel outside demo mode', async () => {
    mockApi({ 'GET /api/healing/status': [healing()], 'GET /api/info': info, 'GET /api/incidents': [] })
    renderPage()
    await screen.findByText('Demo App')
    expect(screen.queryByText(/Failure simulation/)).toBeNull()
  })

  it('in demo mode, simulation buttons call the backend', async () => {
    const calls = mockApi({
      'GET /api/healing/status': [healing()],
      'GET /api/info': { ...info, demo_mode: true },
      'GET /api/incidents': [],
      'POST /api/simulate/demo-app': reply(200, { target: 'demo-app', mode: 'fail', detail: 'demo-app set to fail' }),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Make it fail/ }))
    expect(await screen.findByText('demo-app set to fail')).toBeTruthy()
    expect(calls.find((c) => c.key === 'POST /api/simulate/demo-app')?.body).toEqual({ mode: 'fail' })
  })

  it('shows the error when a simulation fails', async () => {
    mockApi({
      'GET /api/healing/status': [healing()],
      'GET /api/info': { ...info, demo_mode: true },
      'GET /api/incidents': [],
      'POST /api/simulate/demo-app': reply(502, { error: 'demo-app not reachable (ECONNREFUSED)' }),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Crash the process/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not reachable/)
  })
})