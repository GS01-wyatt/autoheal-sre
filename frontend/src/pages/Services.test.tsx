import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Services, { validateNewService } from './Services'
import { info, metric, mockApi, reply, service } from '../test/mockApi'

const renderPage = () => render(<MemoryRouter><Services /></MemoryRouter>)
const ok = { name: 'Site', url: 'https://example.com', intervalS: '30', timeoutS: '5' }

describe('validateNewService', () => {
  it('accepts a good form and rejects bad ones', () => {
    expect(validateNewService(ok)).toBeNull()
    expect(validateNewService({ ...ok, name: '  ' })).toMatch(/Name/)
    expect(validateNewService({ ...ok, url: 'example.com' })).toMatch(/valid URL/)
    expect(validateNewService({ ...ok, url: 'ftp://example.com' })).toMatch(/http/)
    expect(validateNewService({ ...ok, intervalS: '0' })).toMatch(/interval/)
    expect(validateNewService({ ...ok, timeoutS: '999' })).toMatch(/Timeout/)
  })
})

describe('Services page', () => {
  it('shows an empty state', async () => {
    mockApi({ 'GET /api/services': [], 'GET /api/metrics': [], 'GET /api/info': info })
    renderPage()
    expect(await screen.findByText('No services yet')).toBeTruthy()
  })

  it('does not call the backend when the form is invalid', async () => {
    const calls = mockApi({ 'GET /api/services': [], 'GET /api/metrics': [], 'GET /api/info': info })
    renderPage()
    await screen.findByText('No services yet')
    await userEvent.type(screen.getByPlaceholderText('My website'), 'Site')
    await userEvent.type(screen.getByPlaceholderText('https://example.com/health'), 'not-a-url')
    await userEvent.click(screen.getByRole('button', { name: /add service/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/valid URL/)
    expect(calls.some((c) => c.key === 'POST /api/services')).toBe(false)
  })

  it('creates a service with values converted to milliseconds', async () => {
    const calls = mockApi({
      'GET /api/services': [], 'GET /api/metrics': [], 'GET /api/info': info,
      'POST /api/services': reply(201, service()),
    })
    renderPage()
    await screen.findByText('No services yet')
    await userEvent.type(screen.getByPlaceholderText('My website'), 'Site')
    await userEvent.type(screen.getByPlaceholderText('https://example.com/health'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: /add service/i }))
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/services')).toBe(true))
    const post = calls.find((c) => c.key === 'POST /api/services')!
    expect(post.body).toEqual({ name: 'Site', url: 'https://example.com', interval_ms: 30000, timeout_ms: 5000 })
  })

  it('shows the backend error message (duplicate name)', async () => {
    mockApi({
      'GET /api/services': [], 'GET /api/metrics': [], 'GET /api/info': info,
      'POST /api/services': reply(409, { error: 'A service with this name already exists' }),
    })
    renderPage()
    await screen.findByText('No services yet')
    await userEvent.type(screen.getByPlaceholderText('My website'), 'Site')
    await userEvent.type(screen.getByPlaceholderText('https://example.com/health'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: /add service/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/already exists/)
  })

  it('lists services, filters by search, and deletes only after confirmation', async () => {
    const calls = mockApi({
      'GET /api/services': [service(), service({ id: 2, name: 'Shop', url: 'https://shop.test' })],
      'GET /api/metrics': [metric(), metric({ service_id: 2, name: 'Shop', last_status: 'down' })],
      'GET /api/info': info,
      'DELETE /api/services/1': reply(204),
    })
    renderPage()
    expect(await screen.findByText('Shop')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Search services'), 'goog')
    expect(screen.queryByText('Shop')).toBeNull()

    await userEvent.click(screen.getByLabelText('Delete Google'))
    expect(calls.some((c) => c.key === 'DELETE /api/services/1')).toBe(false) // not yet
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /api/services/1')).toBe(true))
  })

  it('only offers allowlisted auto-heal targets and saves the choice', async () => {
    const calls = mockApi({
      'GET /api/services': [service()], 'GET /api/metrics': [metric()], 'GET /api/info': info,
      'PUT /api/services/1/recovery-target': service({ recovery_target: 'demo-app' }),
    })
    renderPage()
    const select = (await screen.findByLabelText('Auto-heal target for Google')) as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBe(2)) // "None" + demo-app
    await userEvent.selectOptions(select, 'demo-app')
    await waitFor(() => expect(calls.find((c) => c.key === 'PUT /api/services/1/recovery-target')?.body).toEqual({ target: 'demo-app' }))
  })
})