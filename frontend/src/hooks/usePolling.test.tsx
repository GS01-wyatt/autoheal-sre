import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { usePolling } from './usePolling'

function Probe({ id, delays }: { id: number; delays: Record<number, number> }) {
  const { data, error, loading } = usePolling(
    () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => (id === 99 ? reject(new Error('boom')) : resolve(`data-${id}`)), delays[id] ?? 0),
      ),
    60_000,
    id,
  )
  return <p>{loading ? 'loading' : error ? `error:${error.message}` : data}</p>
}

describe('usePolling', () => {
  it('loads data', async () => {
    render(<Probe id={1} delays={{}} />)
    expect(screen.getByText('loading')).toBeTruthy()
    expect(await screen.findByText('data-1')).toBeTruthy()
  })

  it('does not show the old key data while the new key loads', async () => {
    const { rerender } = render(<Probe id={1} delays={{ 2: 150 }} />)
    await screen.findByText('data-1')
    rerender(<Probe id={2} delays={{ 2: 150 }} />)
    expect(screen.queryByText('data-1')).toBeNull() // no stale data from the other service
    expect(screen.getByText('loading')).toBeTruthy()
    expect(await screen.findByText('data-2')).toBeTruthy()
  })

  it('ignores a slow answer that arrives after the key changed', async () => {
    const delays = { 1: 200, 2: 10 }
    const { rerender } = render(<Probe id={1} delays={delays} />)
    rerender(<Probe id={2} delays={delays} />)
    expect(await screen.findByText('data-2')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 300)) // the slow answer for id 1 lands now
    expect(screen.getByText('data-2')).toBeTruthy()
    expect(screen.queryByText('data-1')).toBeNull()
  })

  it('reports errors for the current key', async () => {
    render(<Probe id={99} delays={{}} />)
    expect(await screen.findByText('error:boom')).toBeTruthy()
  })
})