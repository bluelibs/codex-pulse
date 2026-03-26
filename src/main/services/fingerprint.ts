import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { shiftDateKey, toUtcMs } from './dateRange'

export type FileSignature = {
  absolutePath: string
  relativePath: string
  source: 'sessions' | 'archived'
  mtimeMs: number
  size: number
}

export type CodexPaths = {
  root: string
  sessionsDir: string
  archivedDir: string
  historyFile: string
}

type StatSummary = {
  exists: boolean
  mtimeMs: number
  size: number
}

type DateParts = {
  year: number
  month: number
  day: number
}

export function resolveCodexPaths(codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')): CodexPaths {
  return {
    root: codexHome,
    sessionsDir: path.join(codexHome, 'sessions'),
    archivedDir: path.join(codexHome, 'archived_sessions'),
    historyFile: path.join(codexHome, 'history.jsonl'),
  }
}

async function summarizeStat(targetPath: string): Promise<StatSummary> {
  try {
    const targetStat = await stat(targetPath)

    return {
      exists: true,
      mtimeMs: targetStat.mtimeMs,
      size: targetStat.size,
    }
  } catch {
    return {
      exists: false,
      mtimeMs: 0,
      size: 0,
    }
  }
}

function parseDateKey(dateKey: string): DateParts {
  const [year, month, day] = dateKey.split('-').map(Number)

  return { year, month, day }
}

function shouldPruneDirectory(relativeDir: string, threshold: DateParts) {
  if (!relativeDir) {
    return false
  }

  const segments = relativeDir.split(path.sep).filter(Boolean)

  if (segments.length === 0) {
    return false
  }

  const [year, month, day] = segments.slice(0, 3).map(Number)

  if ([year, month, day].some(Number.isNaN)) {
    return false
  }

  if (year < threshold.year) {
    return true
  }

  if (year > threshold.year) {
    return false
  }

  if (segments.length === 1) {
    return false
  }

  if (month < threshold.month) {
    return true
  }

  if (month > threshold.month) {
    return false
  }

  if (segments.length === 2) {
    return false
  }

  if (day < threshold.day) {
    return true
  }

  return false
}

async function walkJsonlFiles(
  baseDir: string,
  prefix: string,
  pruneBefore?: DateParts,
): Promise<FileSignature[]> {
  const files: FileSignature[] = []

  async function walk(currentDir: string) {
    if (pruneBefore) {
      const relativeDir = path.relative(baseDir, currentDir)

      if (shouldPruneDirectory(relativeDir, pruneBefore)) {
        return
      }
    }

    let entries

    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
        continue
      }

      const entryStat = await stat(absolutePath)

      files.push({
        absolutePath,
        relativePath: path.join(prefix, path.relative(baseDir, absolutePath)),
        source: prefix === 'live' ? 'sessions' : 'archived',
        mtimeMs: entryStat.mtimeMs,
        size: entryStat.size,
      })
    }
  }

  await walk(baseDir)

  return files
}

export async function buildCoarseSentinel(paths: CodexPaths, todayKey: string) {
  const yesterdayKey = shiftDateKey(todayKey, -1)
  const todayDirectory = path.join(paths.sessionsDir, ...todayKey.split('-'))
  const yesterdayDirectory = path.join(paths.sessionsDir, ...yesterdayKey.split('-'))

  const [history, todayDir, yesterdayDir, archived] = await Promise.all([
    summarizeStat(paths.historyFile),
    summarizeStat(todayDirectory),
    summarizeStat(yesterdayDirectory),
    summarizeStat(paths.archivedDir),
  ])

  return JSON.stringify({
    history,
    todayDir,
    yesterdayDir,
    archived,
  })
}

export async function collectRelevantFiles(paths: CodexPaths, earliestDateKey: string) {
  const thresholdDateKey = shiftDateKey(earliestDateKey, -1)
  const thresholdParts = parseDateKey(thresholdDateKey)
  const thresholdMs = toUtcMs(thresholdDateKey)
  const [sessionFiles, archivedFiles] = await Promise.all([
    walkJsonlFiles(paths.sessionsDir, 'live', thresholdParts),
    walkJsonlFiles(paths.archivedDir, 'archived', thresholdParts),
  ])

  return [...sessionFiles, ...archivedFiles]
    .filter((file) => file.mtimeMs >= thresholdMs)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export function createPreciseFingerprint(files: FileSignature[]) {
  const hash = createHash('sha1')

  for (const file of files) {
    hash.update(`${file.relativePath}|${file.mtimeMs}|${file.size}\n`)
  }

  return hash.digest('hex')
}
