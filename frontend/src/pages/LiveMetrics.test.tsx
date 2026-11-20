import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LiveMetrics from './LiveMetrics'
import { check, mockApi, service } from '../test/mockApi'

const renderPage = () => render(<MemoryRouter><LiveMetrics /></MemoryRouter>)
const now = Date.now()
const at = (secAgo: number) => new Date(now - secAgo * 1000).toISOString()

describe('Live Metrics page', () => {
  it('shows counts, success rate, latency percentiles and recent failures', async () => {
    // API order: newest first
    mockApi({
      'GET /api/services': [service()],
      'GET /api/services/1/checks': [
        check({ status: 'down', http_status: 500, error: 'HTTP 500', response_time_ms: 3, checked_at: at(2) }),
        check({ response_time_ms: 300, checked_at: at(4) }),
        check({ response_time_ms: 200, checked_at: at(6) }),
        check({ response_time_ms: 100, checked_at: at(8) }),
      ],
    })
    renderPage()
    expect(await screen.findByText('Successful checks')).toBeTruthy()
    expect(await screen.findByText('success rate 75.00%')).toBeTruthy()
    expect(screen.getByText('of 4 in this window')).toBeTruthy()
    expect(screen.getByText('200ms')).toBeTruthy() // median of 100/200/300
    expect(screen.getByText('slowest 300ms')).toBeTruthy()
    expect(await screen.findByText('HTTP 500')).toBeTruthy() // recent failures list, shown once
  })

  it('explains connection failures that have no HTTP status', async () => {
    mockApi({
      'GET /api/services': [service()],
      'GET /api/services/1/checks': [check({ status: 'down', http_status: null, error: 'ECONNREFUSED', response_time_ms: 2 }), check()],
    })
    renderPage()
    expect(await screen.findByText('No response')).toBeTruthy()
    expect(screen.getByText('ECONNREFUSED')).toBeTruthy()
  })

  it('says so when there are no failures', async () => {
    mockApi({ 'GET /api/services': [service()], 'GET /api/services/1/checks': [check(), check()] })
    renderPage()
    expect(await screen.findByText('No failures in this window')).toBeTruthy()
  })

  it('changes the window and the service through the backend', async () => {
    const calls = mockApi({
      'GET /api/services': [service(), service({ id: 2, name: 'Shop' })],
      'GET /api/services/1/checks': [check()],
      'GET /api/services/2/checks': [check({ service_id: 2 })],
    })
    renderPage()
    await screen.findByText('Successful checks')
    expect(calls.some((c) => c.url.includes('/services/1/checks?limit=200'))).toBe(true)
    await userEvent.selectOptions(screen.getByLabelText('Window'), '500')
    await waitFor(() => expect(calls.some((c) => c.url.includes('/services/1/checks?limit=500'))).toBe(true))
    await userEvent.selectOptions(screen.getByLabelText('Service'), '2')
    await waitFor(() => expect(calls.some((c) => c.url.includes('/services/2/checks'))).toBe(true))
  })

  it('shows an empty state without services', async () => {
    mockApi({ 'GET /api/services': [] })
    renderPage()
    expect(await screen.findByText('No services yet')).toBeTruthy()
  })

  it('shows an error state when the backend is down', async () => {
    mockApi({})
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toMatch(/not mocked/)
  })

  it('shows an error when checks fail to load', async () => {
    mockApi({ 'GET /api/services': [service()] })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toMatch(/not mocked/)
  })
})