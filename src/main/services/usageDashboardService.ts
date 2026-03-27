import { rm } from "node:fs/promises";

import type {
  CodexWeeklyLimit,
  DashboardListener,
  DashboardResponse,
  DashboardSnapshot,
  ModelTotals,
  TokenTotals,
} from "@shared/usage";

import type {
  CachedDayDocument,
  DashboardCacheDocument,
  DashboardCacheDocumentV3,
  LegacyDashboardCacheDocument,
} from "./cacheDocument";
import { readCacheDocument, writeCacheDocument } from "./cacheDocument";
import {
  expireCodexWeeklyLimit,
  extractCodexWeeklyLimit,
  selectCurrentCodexWeeklyLimit,
} from "./codexWeeklyLimit";
import {
  getDateKey,
  shiftMonthKey,
  startOfIsoWeek,
  startOfMonth,
  startOfYear,
} from "./dateRange";
import {
  buildCoarseSentinel,
  collectRelevantFiles,
  createPreciseFingerprint,
  resolveCodexPaths,
} from "./fingerprint";
import { rebuildMirror } from "./mirrorBuilder";
import {
  buildHeavyLiftingModelBreakdown,
  collectHeavyLiftingTokenWeights,
} from "./heavyLiftingModels";
import type { CcusageDailyReport, ReportRunner } from "./runCcusage";
import {
  emptyModelTotals,
  emptyTokenTotals,
  toModelBreakdown,
  toPeriodTotals,
} from "./tokenTotals";

type ServiceOptions = {
  cachePath: string;
  mirrorRoot: string;
  runner: ReportRunner;
  timezone?: string;
  now?: () => Date;
};

export const DASHBOARD_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function cloneTokenTotals(totals: TokenTotals): TokenTotals {
  return { ...totals };
}

function cloneModelTotals(totals: ModelTotals): ModelTotals {
  return { ...totals };
}

function parseIsoTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDayLabel(dateKey: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function getRetentionStartKey(todayKey: string) {
  const yearStartKey = startOfYear(todayKey);
  const lastMonthStartKey = startOfMonth(shiftMonthKey(todayKey, -1));
  return lastMonthStartKey < yearStartKey ? lastMonthStartKey : yearStartKey;
}

function normalizeDayDateKey(
  entryDate: string,
  fallbackDateKey: string,
  timezone: string,
) {
  if (isDateKey(entryDate)) {
    return entryDate;
  }

  const fallbackYear = fallbackDateKey.slice(0, 4);
  const parseCandidates = [entryDate];

  if (!/\b\d{4}\b/.test(entryDate)) {
    parseCandidates.push(`${entryDate} ${fallbackYear}`);
    parseCandidates.push(`${entryDate}, ${fallbackYear}`);
  }

  for (const candidate of parseCandidates) {
    const parsed = Date.parse(candidate);

    if (!Number.isNaN(parsed)) {
      return getDateKey(new Date(parsed), timezone);
    }
  }

  return fallbackDateKey;
}

function dayRecordFromReport(
  dateKey: string,
  entry: CcusageDailyReport["daily"][number],
  heavyLiftingModels: CachedDayDocument["heavyLiftingModels"],
  relevantFileCount: number,
  timezone: string,
): CachedDayDocument {
  return {
    dateKey,
    label: formatDayLabel(dateKey, timezone),
    totals: {
      inputTokens: entry.inputTokens,
      cachedInputTokens: entry.cachedInputTokens,
      outputTokens: entry.outputTokens,
      reasoningOutputTokens: entry.reasoningOutputTokens,
      totalTokens: entry.totalTokens,
      costUSD: entry.costUSD,
    },
    models: Object.fromEntries(
      Object.entries(entry.models).map(([name, totals]) => [
        name,
        cloneModelTotals(totals),
      ]),
    ),
    heavyLiftingModels,
    relevantFileCount,
  };
}

function sumDays(days: CachedDayDocument[]): TokenTotals {
  const totals = emptyTokenTotals();

  for (const day of days) {
    totals.inputTokens += day.totals.inputTokens;
    totals.cachedInputTokens += day.totals.cachedInputTokens;
    totals.outputTokens += day.totals.outputTokens;
    totals.reasoningOutputTokens += day.totals.reasoningOutputTokens;
    totals.totalTokens += day.totals.totalTokens;
    totals.costUSD += day.totals.costUSD;
  }

  return totals;
}

function mergeDayModels(days: CachedDayDocument[]) {
  const merged = new Map<string, ModelTotals>();

  for (const day of days) {
    for (const [name, totals] of Object.entries(day.models)) {
      const current = merged.get(name) ?? emptyModelTotals();
      current.inputTokens += totals.inputTokens;
      current.cachedInputTokens += totals.cachedInputTokens;
      current.outputTokens += totals.outputTokens;
      current.reasoningOutputTokens += totals.reasoningOutputTokens;
      current.totalTokens += totals.totalTokens;
      current.isFallback ||= totals.isFallback;
      merged.set(name, current);
    }
  }

  return Object.fromEntries(
    [...merged.entries()].map(([name, totals]) => [
      name,
      cloneModelTotals(totals),
    ]),
  );
}

function buildSnapshotFromDays({
  days,
  todayKey,
  weekStartKey,
  timezone,
  generatedAt,
  mirrorBuiltAt,
  codexWeeklyLimit,
}: {
  days: CachedDayDocument[];
  todayKey: string;
  weekStartKey: string;
  timezone: string;
  generatedAt: string;
  mirrorBuiltAt: string;
  codexWeeklyLimit: CodexWeeklyLimit | null;
}): DashboardSnapshot {
  const sortedDays = [...days].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey),
  );
  const weekDays = sortedDays.filter(
    (day) => day.dateKey >= weekStartKey && day.dateKey <= todayKey,
  );
  const todayDay = sortedDays.find((day) => day.dateKey === todayKey);
  const weekTotals = sumDays(weekDays);
  const mergedModels = mergeDayModels(weekDays);

  return {
    generatedAt,
    timezone,
    codexWeeklyLimit,
    today: toPeriodTotals(
      "Today",
      todayKey,
      todayKey,
      todayDay?.totals ?? emptyTokenTotals(),
    ),
    week: toPeriodTotals("Week to date", weekStartKey, todayKey, weekTotals),
    trend: weekDays.map((day) => ({
      id: day.dateKey,
      label: day.label,
      ...cloneTokenTotals(day.totals),
    })),
    dateGroups: sortedDays.map((day) => ({
      id: day.dateKey,
      label: day.label,
      period: toPeriodTotals(
        day.label,
        day.dateKey,
        day.dateKey,
        cloneTokenTotals(day.totals),
      ),
      models: toModelBreakdown(day.models, day.totals.totalTokens),
      heavyLiftingModels: day.heavyLiftingModels,
    })),
    models: toModelBreakdown(mergedModels, weekTotals.totalTokens),
    relevantFileCount: sortedDays.reduce(
      (total, day) => total + day.relevantFileCount,
      0,
    ),
    mirrorBuiltAt,
  };
}

function fileBelongsToDateKey(
  file: { mtimeMs: number },
  dateKey: string,
  timezone: string,
) {
  return getDateKey(new Date(file.mtimeMs), timezone) === dateKey;
}

function isTodayFresh(
  cache: DashboardCacheDocument,
  todayKey: string,
  nowMs: number,
) {
  return (
    cache.days[todayKey] != null &&
    nowMs - parseIsoTimestamp(cache.lastTodayRefreshAt) <
      DASHBOARD_REFRESH_INTERVAL_MS
  );
}

function hasCurrentWeekHistory(
  cache: DashboardCacheDocument,
  weekStartKey: string,
  todayKey: string,
) {
  if (cache.days[todayKey] == null) {
    return false;
  }

  if (weekStartKey === todayKey) {
    return true;
  }

  return Object.keys(cache.days).some(
    (dateKey) => dateKey >= weekStartKey && dateKey < todayKey,
  );
}

function normalizeCache(
  cache: DashboardCacheDocument,
  todayKey: string,
  weekStartKey: string,
  nowIso: string,
) {
  const retentionStartKey = getRetentionStartKey(todayKey);
  const codexWeeklyLimit = expireCodexWeeklyLimit(
    cache.codexWeeklyLimit,
    new Date(nowIso),
  );
  const days = Object.fromEntries(
    Object.values(cache.days)
      .filter(
        (day) => day.dateKey >= retentionStartKey && day.dateKey <= todayKey,
      )
      .map((day) => [day.dateKey, day]),
  );

  return {
    ...cache,
    weekStartKey,
    retentionStartKey,
    codexWeeklyLimit,
    days,
    snapshot: buildSnapshotFromDays({
      days: Object.values(days),
      todayKey,
      weekStartKey,
      timezone: cache.timezone,
      generatedAt: nowIso,
      mirrorBuiltAt: cache.mirrorBuiltAt,
      codexWeeklyLimit,
    }),
  } satisfies DashboardCacheDocument;
}

function migrateLegacyCache(
  cache: LegacyDashboardCacheDocument | DashboardCacheDocumentV3,
  timezone: string,
  todayKey: string,
  weekStartKey: string,
): DashboardCacheDocument {
  const retentionStartKey = getRetentionStartKey(todayKey);
  const days: Record<string, CachedDayDocument> = {};

  for (const group of cache.snapshot.dateGroups) {
    if (group.id < retentionStartKey || group.id > todayKey) {
      continue;
    }

    days[group.id] = {
      dateKey: group.id,
      label: isDateKey(group.label)
        ? formatDayLabel(group.id, timezone)
        : group.label,
      totals: cloneTokenTotals(group.period),
      models: Object.fromEntries(
        group.models.map((model) => [
          model.name,
          {
            inputTokens: model.inputTokens,
            cachedInputTokens: model.cachedInputTokens,
            outputTokens: model.outputTokens,
            reasoningOutputTokens: model.reasoningOutputTokens,
            totalTokens: model.totalTokens,
            isFallback: model.isFallback,
          },
        ]),
      ),
      heavyLiftingModels: group.heavyLiftingModels ?? group.models,
      relevantFileCount: 0,
    };
  }

  const migrated: DashboardCacheDocument = {
    version: 4,
    timezone,
    weekStartKey,
    retentionStartKey,
    lastTodayRefreshAt: cache.snapshot.generatedAt,
    todayFingerprint:
      "preciseFingerprint" in cache
        ? cache.preciseFingerprint
        : cache.todayFingerprint,
    coarseSentinel: cache.coarseSentinel,
    mirrorBuiltAt: cache.snapshot.mirrorBuiltAt,
    codexWeeklyLimit: null,
    snapshot: cache.snapshot,
    days,
  };

  return normalizeCache(
    migrated,
    todayKey,
    weekStartKey,
    cache.snapshot.generatedAt,
  );
}

export class UsageDashboardService {
  private readonly cachePath: string;
  private readonly mirrorRoot: string;
  private readonly runner: ReportRunner;
  private readonly timezone: string;
  private readonly now: () => Date;
  private readonly listeners = new Set<DashboardListener>();

  private cachePromise: Promise<DashboardCacheDocument | null> | null = null;
  private refreshPromise: Promise<DashboardResponse> | null = null;
  private cacheWritePromise: Promise<void> = Promise.resolve();

  constructor(options: ServiceOptions) {
    this.cachePath = options.cachePath;
    this.mirrorRoot = options.mirrorRoot;
    this.runner = options.runner;
    this.timezone =
      options.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC";
    this.now = options.now ?? (() => new Date());
  }

  subscribe(listener: DashboardListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async loadDashboard() {
    const cache = await this.loadCache();
    const now = this.now();
    const nowIso = now.toISOString();
    const todayKey = getDateKey(now, this.timezone);
    const weekStartKey = startOfIsoWeek(todayKey);

    if (cache?.snapshot) {
      const normalizedCache = normalizeCache(
        cache,
        todayKey,
        weekStartKey,
        nowIso,
      );
      this.cachePromise = Promise.resolve(normalizedCache);

      const fresh =
        isTodayFresh(normalizedCache, todayKey, now.getTime()) &&
        hasCurrentWeekHistory(normalizedCache, weekStartKey, todayKey);

      if (!fresh) {
        void this.startRefreshCycle({
          force: false,
          publishStart: true,
          startSnapshot: normalizedCache.snapshot,
          startStale: true,
        });
      }

      return {
        snapshot: normalizedCache.snapshot,
        isRefreshing: !fresh || this.refreshPromise != null,
        stale: !fresh,
      } satisfies DashboardResponse;
    }

    return this.startRefreshCycle({
      force: false,
      publishStart: true,
      startSnapshot: null,
      startStale: false,
    });
  }

  async getCachedDashboard() {
    const cache = await this.loadCache();
    const now = this.now();
    const todayKey = getDateKey(now, this.timezone);
    const weekStartKey = startOfIsoWeek(todayKey);

    if (!cache?.snapshot) {
      return {
        snapshot: null,
        isRefreshing: this.refreshPromise != null,
        stale: false,
      } satisfies DashboardResponse;
    }

    const normalizedCache = normalizeCache(
      cache,
      todayKey,
      weekStartKey,
      now.toISOString(),
    );
    const fresh =
      isTodayFresh(normalizedCache, todayKey, now.getTime()) &&
      hasCurrentWeekHistory(normalizedCache, weekStartKey, todayKey);

    return {
      snapshot: normalizedCache.snapshot,
      isRefreshing: this.refreshPromise != null,
      stale: !fresh,
    } satisfies DashboardResponse;
  }

  async refreshDashboard() {
    const cache = await this.loadCache();
    return this.startRefreshCycle({
      force: true,
      publishStart: true,
      startSnapshot: cache?.snapshot ?? null,
      startStale: cache?.snapshot != null,
    });
  }

  async clearCacheAndReload() {
    if (this.refreshPromise) {
      await this.refreshPromise.catch(() => undefined);
    }

    await Promise.all([
      rm(this.cachePath, { force: true }),
      rm(this.mirrorRoot, { force: true, recursive: true }),
    ]);

    this.cachePromise = Promise.resolve(null);
    this.cacheWritePromise = Promise.resolve();
    this.publishStartState(null, false);

    return this.startRefreshCycle({
      force: true,
      publishStart: false,
      startSnapshot: null,
      startStale: false,
    });
  }

  private async loadCache() {
    if (!this.cachePromise) {
      this.cachePromise = readCacheDocument(this.cachePath).then((cache) => {
        if (cache == null) {
          return null;
        }

        const now = this.now();
        const todayKey = getDateKey(now, this.timezone);
        const weekStartKey = startOfIsoWeek(todayKey);

        if (cache.version === 1) {
          return migrateLegacyCache(
            cache,
            this.timezone,
            todayKey,
            weekStartKey,
          );
        }

        if (cache.version === 3) {
          return null;
        }

        return normalizeCache(cache, todayKey, weekStartKey, now.toISOString());
      });
    }

    return this.cachePromise;
  }

  private persistCache(cache: DashboardCacheDocument) {
    this.cachePromise = Promise.resolve(cache);
    this.cacheWritePromise = this.cacheWritePromise
      .catch(() => undefined)
      .then(() => writeCacheDocument(this.cachePath, cache));
  }

  private publishStartState(
    snapshot: DashboardSnapshot | null,
    stale: boolean,
  ) {
    this.publish({
      snapshot,
      isRefreshing: true,
      stale,
    });
  }

  private startRefreshCycle({
    force = false,
    publishStart,
    startSnapshot,
    startStale,
  }: {
    force?: boolean;
    publishStart: boolean;
    startSnapshot: DashboardSnapshot | null;
    startStale: boolean;
  }) {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (publishStart) {
      this.publishStartState(startSnapshot, startStale);
    }

    this.refreshPromise = this.executeRefresh(force)
      .then((response) => {
        this.publish(response);
        return response;
      })
      .catch(async (error) => {
        const cache = await this.loadCache();
        const response = {
          snapshot: cache?.snapshot ?? null,
          isRefreshing: false,
          stale: cache?.snapshot != null,
          error: error instanceof Error ? error.message : String(error),
        } satisfies DashboardResponse;

        this.publish(response);
        return response;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  private async executeRefresh(force: boolean) {
    const cache = await this.loadCache();
    const now = this.now();
    const nowIso = now.toISOString();
    const todayKey = getDateKey(now, this.timezone);
    const weekStartKey = startOfIsoWeek(todayKey);
    const retentionStartKey = getRetentionStartKey(todayKey);
    const paths = resolveCodexPaths();
    const shouldSeedHistory =
      cache == null ||
      cache.retentionStartKey !== retentionStartKey ||
      !hasCurrentWeekHistory(cache, weekStartKey, todayKey) ||
      cache.days[todayKey] == null;

    if (
      !force &&
      cache &&
      !shouldSeedHistory &&
      isTodayFresh(cache, todayKey, now.getTime())
    ) {
      return {
        snapshot: normalizeCache(cache, todayKey, weekStartKey, nowIso)
          .snapshot,
        isRefreshing: false,
        stale: false,
      } satisfies DashboardResponse;
    }

    if (shouldSeedHistory) {
      const fullFiles = await collectRelevantFiles(
        paths,
        retentionStartKey,
        todayKey,
      );
      const coarseSentinel = await buildCoarseSentinel(paths, todayKey);
      const todayFingerprint = createPreciseFingerprint(
        fullFiles.filter((file) =>
          fileBelongsToDateKey(file, todayKey, this.timezone),
        ),
      );

      await rebuildMirror(this.mirrorRoot, fullFiles);

      const fullReport = await this.runner({
        codexHome: this.mirrorRoot,
        since: retentionStartKey,
        until: todayKey,
        timezone: this.timezone,
      });
      const codexWeeklyLimit = await extractCodexWeeklyLimit(fullFiles, now);
      const heavyLiftingWeights = await collectHeavyLiftingTokenWeights(
        fullFiles,
        this.timezone,
      );

      const fileCountsByDay = new Map<string, number>();
      for (const file of fullFiles) {
        const dayKey = getDateKey(new Date(file.mtimeMs), this.timezone);
        fileCountsByDay.set(dayKey, (fileCountsByDay.get(dayKey) ?? 0) + 1);
      }

      const fallbackStartKey = retentionStartKey;
      const days = Object.fromEntries(
        fullReport.daily.map((entry, index) => {
          const fallbackDateKey = new Date(
            Date.parse(`${fallbackStartKey}T00:00:00.000Z`) + index * 86400000,
          )
            .toISOString()
            .slice(0, 10);
          const dateKey = normalizeDayDateKey(
            entry.date,
            fallbackDateKey,
            this.timezone,
          );

          return [
            dateKey,
            dayRecordFromReport(
              dateKey,
              entry,
              buildHeavyLiftingModelBreakdown(
                entry.models,
                entry.totalTokens,
                heavyLiftingWeights[dateKey],
              ),
              fileCountsByDay.get(dateKey) ?? 0,
              this.timezone,
            ),
          ];
        }),
      );

      const nextCache: DashboardCacheDocument = {
        version: 4,
        timezone: this.timezone,
        weekStartKey,
        retentionStartKey,
        lastTodayRefreshAt: nowIso,
        todayFingerprint,
        coarseSentinel,
        mirrorBuiltAt: nowIso,
        codexWeeklyLimit,
        days,
        snapshot: buildSnapshotFromDays({
          days: Object.values(days),
          todayKey,
          weekStartKey,
          timezone: this.timezone,
          generatedAt: nowIso,
          mirrorBuiltAt: nowIso,
          codexWeeklyLimit,
        }),
      };

      this.persistCache(nextCache);

      return {
        snapshot: nextCache.snapshot,
        isRefreshing: false,
        stale: false,
      } satisfies DashboardResponse;
    }

    const todayFiles = await collectRelevantFiles(paths, todayKey, todayKey);
    const todayFingerprint = createPreciseFingerprint(todayFiles);
    const coarseSentinel = await buildCoarseSentinel(paths, todayKey);

    if (!force && cache.todayFingerprint === todayFingerprint) {
      const refreshedCache = normalizeCache(
        {
          ...cache,
          weekStartKey,
          retentionStartKey,
          lastTodayRefreshAt: nowIso,
          coarseSentinel,
        },
        todayKey,
        weekStartKey,
        nowIso,
      );

      this.persistCache(refreshedCache);

      return {
        snapshot: refreshedCache.snapshot,
        isRefreshing: false,
        stale: false,
      } satisfies DashboardResponse;
    }

    await rebuildMirror(this.mirrorRoot, todayFiles);

    const todayReport = await this.runner({
      codexHome: this.mirrorRoot,
      since: todayKey,
      until: todayKey,
      timezone: this.timezone,
    });
    const nextCodexWeeklyLimit = selectCurrentCodexWeeklyLimit(
      await extractCodexWeeklyLimit(todayFiles, now),
      cache.codexWeeklyLimit,
      now,
    );
    const heavyLiftingWeights = await collectHeavyLiftingTokenWeights(
      todayFiles,
      this.timezone,
    );

    const todayEntry = todayReport.daily[0];
    const nextDay =
      todayEntry == null
        ? {
            dateKey: todayKey,
            label: formatDayLabel(todayKey, this.timezone),
            totals: emptyTokenTotals(),
            models: {},
            heavyLiftingModels: [],
            relevantFileCount: todayFiles.length,
          }
        : dayRecordFromReport(
            todayKey,
            todayEntry,
            buildHeavyLiftingModelBreakdown(
              todayEntry.models,
              todayEntry.totalTokens,
              heavyLiftingWeights[todayKey],
            ),
            todayFiles.length,
            this.timezone,
          );

    const nextCache = normalizeCache(
      {
        ...cache,
        weekStartKey,
        retentionStartKey,
        lastTodayRefreshAt: nowIso,
        todayFingerprint,
        coarseSentinel,
        mirrorBuiltAt: nowIso,
        codexWeeklyLimit: nextCodexWeeklyLimit,
        days: {
          ...cache.days,
          [todayKey]: nextDay,
        },
      },
      todayKey,
      weekStartKey,
      nowIso,
    );

    this.persistCache(nextCache);

    return {
      snapshot: nextCache.snapshot,
      isRefreshing: false,
      stale: false,
    } satisfies DashboardResponse;
  }

  private publish(response: DashboardResponse) {
    for (const listener of this.listeners) {
      listener(response);
    }
  }
}
