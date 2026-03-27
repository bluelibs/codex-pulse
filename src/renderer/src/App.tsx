import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import type {
  CodexPulseApi,
  DashboardResponse,
  DashboardSnapshot,
  ModelBreakdown,
  ModelTotals,
  PeriodTotals,
  TokenTotals,
  TrendPoint,
} from "@shared/usage";

import { HeroDial } from "./components/HeroDial";
import { MetricCard } from "./components/MetricCard";
import { MixPanel } from "./components/MixPanel";
import { ModelPanel } from "./components/ModelPanel";
import { TrendPanel } from "./components/TrendPanel";
import { CodexLimitBar } from "./components/CodexLimitBar";
import { formatInteger, formatMonthDayTime, formatPercent } from "./formatters";
import { mockDashboardResponse } from "./mockDashboard";

type PeriodFilterKey = "week" | "today" | "month" | "lastMonth" | "year";

type PeriodFilter = {
  key: PeriodFilterKey;
  label: string;
};

const PERIOD_FILTERS: PeriodFilter[] = [
  { key: "week", label: "This week" },
  { key: "today", label: "Today" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "year", label: "This year" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey: string, dayDelta: number) {
  return toDateKey(
    new Date(parseDateKey(dateKey).getTime() + dayDelta * DAY_MS),
  );
}

function shiftMonthKey(dateKey: string, monthDelta: number) {
  const [year, month] = dateKey.split("-").map(Number);
  return toDateKey(new Date(Date.UTC(year, month - 1 + monthDelta, 1)));
}

function startOfIsoWeek(dateKey: string) {
  const weekday = parseDateKey(dateKey).getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return shiftDateKey(dateKey, offset);
}

function startOfMonth(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  return toDateKey(new Date(Date.UTC(year, month - 1, 1)));
}

function startOfYear(dateKey: string) {
  const [year] = dateKey.split("-").map(Number);
  return toDateKey(new Date(Date.UTC(year, 0, 1)));
}

function endOfMonth(dateKey: string) {
  return shiftDateKey(shiftMonthKey(dateKey, 1), -1);
}

function getPeriodLabel(filter: PeriodFilterKey) {
  return (
    PERIOD_FILTERS.find((candidate) => candidate.key === filter)?.label ??
    "This week"
  );
}

function getRhythmTitle(filter: PeriodFilterKey) {
  switch (filter) {
    case "today":
      return "Daily rhythm";
    case "week":
      return "Week rhythm";
    case "month":
      return "Month rhythm";
    case "lastMonth":
      return "Last month rhythm";
    case "year":
      return "Year rhythm";
  }
}

function getHeroHeadline(filter: PeriodFilterKey) {
  switch (filter) {
    case "today":
      return "Today, without the terminal detour.";
    case "week":
      return "Today and this week, without the terminal detour.";
    case "month":
      return "Today and this month, without the terminal detour.";
    case "lastMonth":
      return "Today and last month, without the terminal detour.";
    case "year":
      return "Today and this year, without the terminal detour.";
  }
}

function emptyTokenTotals(): TokenTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
  };
}

function sumTokenTotals(periods: PeriodTotals[]) {
  const totals = emptyTokenTotals();

  for (const period of periods) {
    totals.inputTokens += period.inputTokens;
    totals.cachedInputTokens += period.cachedInputTokens;
    totals.outputTokens += period.outputTokens;
    totals.reasoningOutputTokens += period.reasoningOutputTokens;
    totals.totalTokens += period.totalTokens;
    totals.costUSD += period.costUSD;
  }

  return totals;
}

function sumModels(
  groups: DashboardSnapshot["dateGroups"],
  source: "models" | "heavyLiftingModels" = "models",
) {
  const merged = new Map<string, ModelTotals>();

  for (const group of groups) {
    for (const model of group[source]) {
      const current = merged.get(model.name) ?? {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        isFallback: false,
      };

      current.inputTokens += model.inputTokens;
      current.cachedInputTokens += model.cachedInputTokens;
      current.outputTokens += model.outputTokens;
      current.reasoningOutputTokens += model.reasoningOutputTokens;
      current.totalTokens += model.totalTokens;
      current.isFallback ||= model.isFallback;
      merged.set(model.name, current);
    }
  }

  return merged;
}

function buildSelectedWindow(
  snapshot: DashboardSnapshot,
  filter: PeriodFilterKey,
) {
  const todayKey = snapshot.today.rangeEnd;
  const ranges: Record<PeriodFilterKey, { start: string; end: string }> = {
    today: { start: todayKey, end: todayKey },
    week: { start: startOfIsoWeek(todayKey), end: todayKey },
    month: { start: startOfMonth(todayKey), end: todayKey },
    lastMonth: {
      start: startOfMonth(shiftMonthKey(todayKey, -1)),
      end: endOfMonth(shiftMonthKey(todayKey, -1)),
    },
    year: { start: startOfYear(todayKey), end: todayKey },
  };

  const selectedRange = ranges[filter];
  const selectedGroups = snapshot.dateGroups
    .filter(
      (group) =>
        group.id >= selectedRange.start && group.id <= selectedRange.end,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  const totals = sumTokenTotals(selectedGroups.map((group) => group.period));
  const models = sumModels(selectedGroups);
  const heavyLiftingModels = sumModels(selectedGroups, "heavyLiftingModels");
  const denominator = totals.totalTokens || 1;
  const selectedModels: ModelBreakdown[] = [...models.entries()]
    .map(([name, model]) => ({
      name,
      ...model,
      tokenShare: model.totalTokens / denominator,
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);
  const selectedHeavyLiftingModels: ModelBreakdown[] = [...heavyLiftingModels.entries()]
    .map(([name, model]) => ({
      name,
      ...model,
      tokenShare: model.totalTokens / denominator,
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);

  const selectedPeriod: PeriodTotals = {
    label: getPeriodLabel(filter),
    rangeStart: selectedRange.start,
    rangeEnd: selectedRange.end,
    ...totals,
  };

  const trend: TrendPoint[] = selectedGroups.map((group) => ({
    id: group.id,
    label: group.label,
    inputTokens: group.period.inputTokens,
    cachedInputTokens: group.period.cachedInputTokens,
    outputTokens: group.period.outputTokens,
    reasoningOutputTokens: group.period.reasoningOutputTokens,
    totalTokens: group.period.totalTokens,
    costUSD: group.period.costUSD,
  }));

  const strongestDay =
    selectedGroups.length === 0
      ? null
      : selectedGroups.reduce(
          (current, group) =>
            group.period.totalTokens > current.period.totalTokens
              ? group
              : current,
          selectedGroups[0],
        );

  return {
    selectedPeriod,
    selectedGroups,
    selectedModels,
    selectedHeavyLiftingModels,
    trend,
    strongestDay,
    cacheRatio:
      selectedPeriod.inputTokens === 0
        ? 0
        : selectedPeriod.cachedInputTokens / selectedPeriod.inputTokens,
    selectedFilterLabel: getPeriodLabel(filter).toLowerCase(),
    rhythmTitle: getRhythmTitle(filter),
  };
}

const initialState: DashboardResponse = {
  snapshot: null,
  isRefreshing: true,
  stale: false,
};

const missingBridgeResponse: DashboardResponse = {
  snapshot: null,
  isRefreshing: false,
  stale: true,
  error:
    "The Electron preload bridge did not load, so the dashboard cannot talk to the main process.",
};

const missingRefreshResponse: DashboardResponse = {
  snapshot: null,
  isRefreshing: false,
  stale: true,
  error:
    "Refresh is unavailable because the Electron preload bridge is missing.",
};

function getCodexPulseApi(): CodexPulseApi | undefined {
  return (window as Window & { codexPulse?: CodexPulseApi }).codexPulse;
}

function isElectronRenderer() {
  return window.navigator.userAgent.includes("Electron");
}

export function App() {
  const [response, setResponse] = useState<DashboardResponse>(initialState);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [clearCachePending, setClearCachePending] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<PeriodFilterKey>("week");
  const deferredSnapshot = useDeferredValue(response.snapshot);

  const applyResponse = useEffectEvent((nextResponse: DashboardResponse) => {
    startTransition(() => {
      setResponse(nextResponse);
      setManualRefreshPending(false);
      setClearCachePending(false);
    });
  });

  const runAutoRefresh = useEffectEvent(async () => {
    const api = getCodexPulseApi();

    if (!api) {
      return;
    }

    const refreshed = await api.refreshDashboard();
    applyResponse(refreshed);
  });

  useEffect(() => {
    const api = getCodexPulseApi();

    if (!api) {
      if (!isElectronRenderer()) {
        setResponse(mockDashboardResponse);
        return;
      }

      setResponse(missingBridgeResponse);
      return;
    }

    const unsubscribe = api.onDashboardUpdated(applyResponse);

    void api.loadDashboard().then((nextResponse) => {
      applyResponse(nextResponse);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!deferredSnapshot) {
      return;
    }

    const intervalId = window.setInterval(
      () => {
        void runAutoRefresh();
      },
      10 * 60 * 1000,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [deferredSnapshot, runAutoRefresh]);

  async function handleRefresh() {
    const api = getCodexPulseApi();

    if (!api) {
      if (!isElectronRenderer()) {
        applyResponse(mockDashboardResponse);
        return;
      }

      applyResponse(missingRefreshResponse);
      return;
    }

    setManualRefreshPending(true);
    startTransition(() => {
      setResponse((current) => ({
        ...current,
        isRefreshing: true,
      }));
    });

    const refreshed = await api.refreshDashboard();
    applyResponse(refreshed);
  }

  async function handleClearCacheAndReload() {
    window.scrollTo({ top: 0, behavior: "smooth" });

    const api = getCodexPulseApi();

    if (!api) {
      if (!isElectronRenderer()) {
        setClearCachePending(false);
        applyResponse(mockDashboardResponse);
        return;
      }

      applyResponse(missingRefreshResponse);
      return;
    }

    setManualRefreshPending(false);
    setClearCachePending(true);
    startTransition(() => {
      setResponse({
        snapshot: null,
        isRefreshing: true,
        stale: false,
      });
    });

    const refreshed = await api.clearCacheAndReload();
    applyResponse(refreshed);
  }

  if (!deferredSnapshot) {
    return (
      <main className="app-shell app-shell-loading">
        <section className="loading-stage" aria-busy="true" aria-live="polite">
          <div className="loading-mark" aria-hidden="true">
            <span className="loading-mark-core" />
          </div>

          <div className="hero-copy-block">
            <p className="eyebrow">Codex Pulse</p>
            {clearCachePending ? (
              <span className="hero-kicker">Rebuilding usage cache</span>
            ) : null}
            <h1>Pulling your usage telemetry into focus.</h1>
            <p className="hero-copy">
              {response.error ??
                (clearCachePending
                  ? "Clearing the persisted snapshot, rescanning your recent sessions, and rebuilding the dashboard from source."
                  : "Warming the cache, scanning recent activity, and composing your launch snapshot.")}
            </p>

            <div className="hero-ribbon">
              <span className="status-pill status-pill-loading">
                <span className="status-dot" aria-hidden="true" />
                {response.isRefreshing ? "Loading now" : "Waiting for response"}
              </span>
            </div>
          </div>

          <div
            className="loading-card"
            aria-label="Loading dashboard preview"
            role="status"
          >
            <div className="loading-card-head">
              <span className="loading-card-label">Preparing dashboard</span>
              <span className="loading-card-step">
                {clearCachePending
                  ? "Rebuilding from source"
                  : response.isRefreshing
                    ? "Fetching latest usage"
                    : "Standing by"}
              </span>
            </div>

            <div className="loading-meter" aria-hidden="true">
              <span />
            </div>

            <p className="loading-copy">
              {clearCachePending
                ? "A fresh pass is in motion. Older cached rows are gone, and the next snapshot will be rebuilt from your real activity files."
                : response.isRefreshing
                  ? "One quick pass over recent sessions, then the dashboard will snap into place."
                  : "The snapshot is taking a beat to arrive, but the shell is already awake."}
            </p>

            {response.error ? (
              <button
                className="refresh-button refresh-button-soft"
                onClick={handleRefresh}
                type="button"
              >
                {manualRefreshPending ? "Refreshing..." : "Try again"}
              </button>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  const selectedView = buildSelectedWindow(deferredSnapshot, selectedFilter);
  const comparisonPeriod =
    selectedFilter === "today" ? deferredSnapshot.week : deferredSnapshot.today;
  const leadModel = selectedView.selectedModels[0];

  return (
    <main className="app-shell">
      <div className="app-grain" />
      <div className="orb orb-left" />
      <div className="orb orb-right" />
      <div className="orb orb-bottom" />

      <header className="hero">
        <div className="hero-topbar reveal reveal-delay-1">
          <div
            className="period-filters"
            role="group"
            aria-label="Dashboard periods"
          >
            {PERIOD_FILTERS.map((filter) => (
              <button
                key={filter.key}
                aria-pressed={selectedFilter === filter.key}
                className={
                  selectedFilter === filter.key
                    ? "period-filter period-filter-active"
                    : "period-filter"
                }
                onClick={() => {
                  setSelectedFilter(filter.key);
                }}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          <button
            className="refresh-button"
            disabled={manualRefreshPending}
            onClick={handleRefresh}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="hero-limit-row reveal reveal-delay-2">
          <CodexLimitBar limit={deferredSnapshot.codexWeeklyLimit} />
        </div>

        <div className="hero-copy-block reveal reveal-delay-2">
          <div className="hero-note-grid">
            <article className="hero-note">
              <span>Peak day</span>
              <strong>
                {selectedView.strongestDay?.label ?? "No activity yet"}
              </strong>
              <p>
                {selectedView.strongestDay
                  ? `${formatInteger(selectedView.strongestDay.period.totalTokens)} tokens moved`
                  : "Once usage lands, the rhythm shows up here"}
              </p>
            </article>
            <article className="hero-note">
              <span>{getPeriodLabel(selectedFilter)} cache reuse</span>
              <strong>{formatPercent(selectedView.cacheRatio)}</strong>
              <p>Prompt leftovers are finally earning rent</p>
            </article>
            <article className="hero-note">
              <span>Primary model</span>
              <strong>{leadModel?.name ?? "Unknown"}</strong>
              <p>
                {leadModel
                  ? `${formatPercent(leadModel.tokenShare)} of token volume`
                  : "Waiting for a model footprint"}
              </p>
            </article>
          </div>

          <div className="hero-meta">
            <span className="hero-meta-kicker">Live cadence</span>
            <strong>Refreshes automatically every 10 minutes.</strong>
            <span className="hero-meta-detail">
              Last update: {formatMonthDayTime(deferredSnapshot.generatedAt)}
            </span>
          </div>
        </div>

        <div className="hero-actions reveal reveal-delay-2">
          <HeroDial
            today={deferredSnapshot.today}
            focusPeriod={selectedView.selectedPeriod}
            leadingModel={leadModel}
            filterLabel={
              selectedFilter === "today"
                ? "Today"
                : getPeriodLabel(selectedFilter)
            }
          />
        </div>
      </header>

      <section className="metric-grid reveal reveal-delay-3">
        <MetricCard period={selectedView.selectedPeriod} tone="ink" />
        <MetricCard period={comparisonPeriod} tone="paper" />
      </section>

      <section className="panel-grid reveal reveal-delay-4">
        <TrendPanel
          periodLabel={getPeriodLabel(selectedFilter)}
          title={selectedView.rhythmTitle}
          trend={selectedView.trend}
        />
        <MixPanel
          period={selectedView.selectedPeriod}
          periodLabel={getPeriodLabel(selectedFilter)}
        />
      </section>

      <div className="model-panel-wrap reveal reveal-delay-5">
        <ModelPanel models={selectedView.selectedHeavyLiftingModels} />
      </div>

      <div className="footer-actions reveal reveal-delay-5">
        <button
          className="refresh-button refresh-button-ghost"
          onClick={handleClearCacheAndReload}
          type="button"
        >
          {clearCachePending ? "Rebuilding cache..." : "Clear Cache & Reload"}
        </button>
      </div>
    </main>
  );
}
