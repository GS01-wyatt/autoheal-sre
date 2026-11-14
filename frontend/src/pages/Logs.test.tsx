import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Logs from './Logs'
import { logRow, mockApi, service } from '../test/mockApi'

const renderPage = () => render(<MemoryRouter><Logs /></MemoryRouter>)

describe('Logs page', () => {
  it('shows log rows with level, source and service name', async () => {
    mockApi({
      'GET /api/logs': [logRow({ message: 'Incident opened after 3 consecutive failures', level: 'warn' }), logRow({ id: 2, message: 'Recovered on attempt 1' })],
      'GET /api/services': [service()],
    })
    renderPage()
    expect(await screen.findByText('Incident opened after 3 consecutive failures')).toBeTruthy()
    expect(within(screen.getAllByRole('listitem')[0]).getByText('warn')).toBeTruthy() // level badge of the first row
    expect((await screen.findAllByText(/Google/)).length).toBeGreaterThan(0)
  })

  it('sends search text (debounced) and level to the backend', async () => {
    const calls = mockApi({ 'GET /api/logs': [logRow()], 'GET /api/services': [service()] })
    renderPage()
    await screen.findByText('Recovered on attempt 1')
    await userEvent.type(screen.getByLabelText('Search logs'), 'boom')
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=boom'))).toBe(true))
    await userEvent.selectOptions(screen.getByLabelText('Filter by level'), 'error')
    await waitFor(() => expect(calls.some((c) => c.url.includes('level=error') && c.url.includes('q=boom'))).toBe(true))
  })

  it('filters by service', async () => {
    const calls = mockApi({ 'GET /api/logs': [logRow()], 'GET /api/services': [service()] })
    renderPage()
    await screen.findByText('Recovered on attempt 1')
    await userEvent.selectOptions(await screen.findByLabelText('Filter by service'), '1')
    await waitFor(() => expect(calls.some((c) => c.url.includes('service_id=1'))).toBe(true))
  })

  it('explains an empty log, and a filtered empty log differently', async () => {
    mockApi({ 'GET /api/logs': [], 'GET /api/services': [] })
    renderPage()
    expect(await screen.findByText('No log events yet')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Search logs'), 'zzz')
    expect(await screen.findByText('No logs match these filters')).toBeTruthy()
  })

  it('shows an error state when the backend is down', async () => {
    mockApi({ 'GET /api/services': [] })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toMatch(/not mocked/)
  })
})