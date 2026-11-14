import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { health, info, mockApi, reply } from './test/mockApi'

const base = { 'GET /api/metrics': [], 'GET /api/incidents': [], 'GET /api/services': [] }

describe('App shell', () => {
  it('toggles and remembers the theme', async () => {
    mockApi({ ...base, 'GET /api/health': health, 'GET /api/info': info })
    render(<MemoryRouter><App /></MemoryRouter>)
    await userEvent.click(await screen.findByLabelText('Switch to light theme'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('autoheal-theme')).toBe('light')
    await userEvent.click(screen.getByLabelText('Switch to dark theme'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('labels demo mode and shows backend online', async () => {
    mockApi({ ...base, 'GET /api/health': health, 'GET /api/info': { ...info, demo_mode: true } })
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(await screen.findByText('Demo mode')).toBeTruthy()
    expect(await screen.findByText('Backend online')).toBeTruthy()
  })

  it('shows backend offline when the health check fails', async () => {
    mockApi({ ...base, 'GET /api/health': reply(503, { status: 'degraded' }), 'GET /api/info': info })
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(await screen.findByText('Backend offline')).toBeTruthy()
  })

  it('shows a friendly page for unknown routes', async () => {
    mockApi({ ...base, 'GET /api/health': health, 'GET /api/info': info })
    render(<MemoryRouter initialEntries={['/nope']}><App /></MemoryRouter>)
    expect(await screen.findByText('Page not found')).toBeTruthy()
  })
})