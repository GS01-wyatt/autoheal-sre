import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no ResizeObserver, which Recharts needs
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.add('dark')
})