import { afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// jsdom has no ResizeObserver, which Recharts needs
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)

// The first chart test loads the large Recharts bundle, which can take over a second on a slow machine
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.add('dark')
})