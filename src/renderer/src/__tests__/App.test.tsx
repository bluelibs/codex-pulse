import { act, render, screen, waitFor, within } from '@testing-library/react'
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
    expect(screen.getByText('Estimated saved')).toBeInTheDocument()
    expect(screen.getAllByText('$6.62').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('913K').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('$4.56').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('gpt-5.4-xhigh').length).toBeGreaterThan(0)
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
    })
  })

  it('keeps refresh loading visible for at least one second even when the response is immediate', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    const refreshButton = screen.getByRole('button', { name: 'Refresh' })

    await user.click(refreshButton)

    expect(window.codexPulse.refreshDashboard).toHaveBeenCalledTimes(1)
    expect(refreshButton).toBeDisabled()
    expect(refreshButton.className).toContain('refresh-button-loading')

    await new Promise((resolve) => {
      window.setTimeout(resolve, 950)
    })

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
      },
      { timeout: 1500 },
    )
  })

  it('keeps the manual refresh spinner active when a dashboard update arrives before the minimum duration', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    const refreshButton = screen.getByRole('button', { name: 'Refresh' })

    await user.click(refreshButton)

    expect(refreshButton).toBeDisabled()
    expect(refreshButton.className).toContain('refresh-button-loading')
    expect(listener).not.toBeNull()

    await act(async () => {
      listener?.({
        ...mockDashboardResponse,
        isRefreshing: false,
        stale: false,
      })
    })

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refresh' }).className).toContain('refresh-button-loading')

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
      },
      { timeout: 1500 },
    )
  })

  it('shows refresh guidance on hover and hides it on mouse leave', async () => {
    render(<App />)
    const user = userEvent.setup()

    const refreshButton = await screen.findByRole('button', { name: 'Refresh' })

    await user.hover(refreshButton)

    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getByText('Live cadence')).toBeInTheDocument()
    expect(within(tooltip).getByText('Click to manually refresh.')).toBeInTheDocument()
    expect(refreshButton).toHaveAttribute('aria-describedby', tooltip.id)

    await user.unhover(refreshButton)

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
    expect(refreshButton).not.toHaveAttribute('aria-describedby')
  })

  it('shows refresh guidance on keyboard focus and hides it on blur', async () => {
    render(<App />)
    const user = userEvent.setup()

    const refreshButton = await screen.findByRole('button', { name: 'Refresh' })
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(refreshButton).toHaveFocus()
    expect(within(tooltip).getByText('Refreshes automatically every 10 minutes.')).toBeInTheDocument()
    expect(within(tooltip).getByText(/Last update:/)).toBeInTheDocument()
    expect(refreshButton).toHaveAttribute('aria-describedby', tooltip.id)

    await user.tab()

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  it('clears the persisted cache and reloads when requested', async () => {
    render(<App />)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'This week' })
    await user.click(screen.getByRole('button', { name: 'Clear Cache & Reload' }))

    expect(window.codexPulse.clearCacheAndReload).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeInTheDocument()
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

  it('uses the top heavy-lifting split for the primary model label', async () => {
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
                costUSD: 1.23,
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
                costUSD: 0.74,
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
                costUSD: 0.49,
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

    const modelPanel = (await screen.findByRole('heading', { name: 'Who did the heavy lifting' })).closest('section')

    expect(modelPanel).not.toBeNull()
    expect(within(modelPanel!).getByText('gpt-5.4-xhigh')).toBeInTheDocument()
    expect(within(modelPanel!).getByText('gpt-5.4-high')).toBeInTheDocument()
    expect(within(modelPanel!).getByText('$0.74')).toBeInTheDocument()
    expect(within(modelPanel!).getByText('$0.49')).toBeInTheDocument()

    const primaryModelCard = screen.getByText('Primary model').closest('article')

    expect(primaryModelCard).not.toBeNull()
    expect(within(primaryModelCard!).getByText('gpt-5.4-xhigh')).toBeInTheDocument()
    expect(within(primaryModelCard!).queryByText(/^gpt-5\.4$/)).not.toBeInTheDocument()
  })

  it('keeps a plain heavy-lifting model label when no reasoning-effort split exists', async () => {
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
                costUSD: 1.23,
                isFallback: false,
                tokenShare: 1,
              },
            ],
            heavyLiftingModels: [
              {
                name: 'gpt-5.4',
                inputTokens: 900_000,
                cachedInputTokens: 720_000,
                outputTokens: 11_000,
                reasoningOutputTokens: 2_000,
                totalTokens: 913_000,
                costUSD: 1.23,
                isFallback: false,
                tokenShare: 1,
              },
            ],
          },
        ],
      },
      isRefreshing: false,
      stale: false,
    })

    render(<App />)

    const modelPanel = (await screen.findByRole('heading', { name: 'Who did the heavy lifting' })).closest('section')

    expect(modelPanel).not.toBeNull()
    expect(await within(modelPanel!).findByText('gpt-5.4')).toBeInTheDocument()
    expect(within(modelPanel!).queryByText('gpt-5.4-high')).not.toBeInTheDocument()
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

  it('renders the codex weekly limit above the period controls', async () => {
    render(<App />)

    const limitBanner = await screen.findByLabelText('Codex weekly limit')
    const periodControls = screen.getByRole('group', { name: 'Dashboard periods' })

    expect(limitBanner.compareDocumentPosition(periodControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    expect(screen.queryByText(/Last update: Mar 26, 2:34 PM/)).not.toBeInTheDocument()
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
