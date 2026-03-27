import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DashboardListener, DashboardResponse } from '@shared/usage'

import { App } from '../App'
import { mockDashboardResponse } from '../mockDashboard'

describe('App', () => {
  let listener: DashboardListener | null = null

  beforeEach(() => {
    listener = null
    window.scrollTo = vi.fn()

    window.codexPulse = {
      getCachedDashboard: vi.fn().mockResolvedValue(mockDashboardResponse),
      loadDashboard: vi.fn().mockResolvedValue(mockDashboardResponse),
      refreshDashboard: vi.fn().mockResolvedValue({
        ...mockDashboardResponse,
        isRefreshing: false,
        stale: false,
      }),
      clearCacheAndReload: vi.fn().mockResolvedValue({
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

    expect(await screen.findByRole('button', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByText('24% left')).toBeInTheDocument()
    expect(screen.getByText('Refreshes automatically every 10 minutes.')).toBeInTheDocument()
    expect(screen.getByText('Estimated saved')).toBeInTheDocument()
    expect(screen.getAllByText('$6.62').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('913K').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('$4.56').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('gpt-5.4').length).toBeGreaterThan(0)
  })

  it('asks the backend for a fresh snapshot when refresh is pressed', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    expect(listener).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(window.codexPulse.refreshDashboard).toHaveBeenCalledTimes(1)
  })

  it('disables refresh while a refresh request is in flight', async () => {
    let resolveRefresh!: (value: DashboardResponse) => void
    window.codexPulse.refreshDashboard = vi.fn(
      () =>
        new Promise<DashboardResponse>((resolve) => {
          resolveRefresh = resolve
        }),
    )

    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    const refreshButton = screen.getByRole('button', { name: 'Refresh' })

    await user.click(refreshButton)

    expect(refreshButton).toBeDisabled()

    resolveRefresh({
      ...mockDashboardResponse,
      isRefreshing: false,
      stale: false,
    })

    expect(await screen.findByRole('button', { name: 'Refresh' })).not.toBeDisabled()
  })

  it('clears the persisted cache and reloads when requested', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    await user.click(screen.getByRole('button', { name: 'Clear Cache & Reload' }))

    expect(window.codexPulse.clearCacheAndReload).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Refreshes automatically every 10 minutes.')).toBeInTheDocument()
  })

  it('switches the dashboard period when a filter is selected', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    await user.click(screen.getByRole('button', { name: 'This month' }))

    expect(await screen.findByText('This month cache reuse')).toBeInTheDocument()
    expect(screen.getByText('Month rhythm')).toBeInTheDocument()
    expect(screen.getByText('Mar 24-26')).toBeInTheDocument()
  })

  it('aggregates the year rhythm into month bars', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    await user.click(screen.getByRole('button', { name: 'This year' }))

    expect(await screen.findByText('Year rhythm')).toBeInTheDocument()
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Feb')).toBeInTheDocument()
    expect(screen.getByText('Mar')).toBeInTheDocument()
  })

  it('uses the heavy lifting split only in the model panel', async () => {
    window.codexPulse.loadDashboard = vi.fn().mockResolvedValue({
      snapshot: {
        ...mockDashboardResponse.snapshot,
        dateGroups: [
          {
            ...mockDashboardResponse.snapshot!.dateGroups.at(-1)!,
            models: [
              {
                name: 'gpt-5.4',
                inputTokens: 900_000,
                cachedInputTokens: 720_000,
                outputTokens: 11_000,
                reasoningOutputTokens: 2_000,
                totalTokens: 913_000,
                isFallback: false,
                tokenShare: 1,
              },
            ],
            heavyLiftingModels: [
              {
                name: 'gpt-5.4-xhigh',
                inputTokens: 540_000,
                cachedInputTokens: 432_000,
                outputTokens: 6_000,
                reasoningOutputTokens: 1_000,
                totalTokens: 547_000,
                isFallback: false,
                tokenShare: 547_000 / 913_000,
              },
              {
                name: 'gpt-5.4-high',
                inputTokens: 360_000,
                cachedInputTokens: 288_000,
                outputTokens: 5_000,
                reasoningOutputTokens: 1_000,
                totalTokens: 366_000,
                isFallback: false,
                tokenShare: 366_000 / 913_000,
              },
            ],
          },
        ],
      },
      isRefreshing: false,
      stale: false,
    })

    render(<App />)

    expect(await screen.findByText('gpt-5.4-xhigh')).toBeInTheDocument()
    expect(screen.getByText('gpt-5.4-high')).toBeInTheDocument()
    expect(screen.getAllByText('gpt-5.4').length).toBeGreaterThan(0)
  })

  it('shows a muted weekly limit state when no rate-limit data is available', async () => {
    window.codexPulse.loadDashboard = vi.fn().mockResolvedValue({
      ...mockDashboardResponse,
      snapshot: {
        ...mockDashboardResponse.snapshot!,
        codexWeeklyLimit: null,
      },
    })

    render(<App />)

    expect(await screen.findByText('Codex weekly limit will appear after a fresh rate-limit event lands.')).toBeInTheDocument()
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

    expect(await screen.findByRole('button', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByText(/Last update: Mar 26, 2:34 PM/)).toBeInTheDocument()
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
