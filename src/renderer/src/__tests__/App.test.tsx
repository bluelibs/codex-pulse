import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DashboardListener } from '@shared/usage'

import { App } from '../App'
import { mockDashboardResponse } from '../mockDashboard'

describe('App', () => {
  let listener: DashboardListener | null = null

  beforeEach(() => {
    listener = null

    window.codexPulse = {
      getCachedDashboard: vi.fn().mockResolvedValue(mockDashboardResponse),
      loadDashboard: vi.fn().mockResolvedValue(mockDashboardResponse),
      refreshDashboard: vi.fn().mockResolvedValue({
        ...mockDashboardResponse,
        isRefreshing: false,
        stale: false,
      }),
      onDashboardUpdated: vi.fn((nextListener: DashboardListener) => {
        listener = nextListener
        return () => {
          listener = null
        }
      }),
    }
  })

  it('renders the snapshot returned by the preload bridge', async () => {
    render(<App />)

    expect(await screen.findByText('Today and this week, without the terminal detour.')).toBeInTheDocument()
    expect(screen.getAllByText('913K').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('$4.56')).toBeInTheDocument()
    expect(screen.getAllByText('gpt-5.4').length).toBeGreaterThan(0)
  })

  it('asks the backend for a fresh snapshot when refresh is pressed', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByText('Today and this week, without the terminal detour.')
    expect(listener).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(window.codexPulse.refreshDashboard).toHaveBeenCalledTimes(1)
  })

  it('uses mock data in a plain browser when the preload bridge is unavailable', async () => {
    Object.defineProperty(window, 'codexPulse', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Test Browser',
    })

    render(<App />)

    expect(await screen.findByText('Today and this week, without the terminal detour.')).toBeInTheDocument()
    expect(screen.getByText('Fresh snapshot')).toBeInTheDocument()
  })

  it('shows a helpful error in Electron when the preload bridge is unavailable', async () => {
    Object.defineProperty(window, 'codexPulse', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Electron/38.0.0',
    })

    render(<App />)

    expect(await screen.findByText('Pulling your usage telemetry into focus.')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'The Electron preload bridge did not load, so the dashboard cannot talk to the main process.',
      ),
    ).toBeInTheDocument()
  })
})
