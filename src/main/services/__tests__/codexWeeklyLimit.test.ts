import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { FileSignature } from '../fingerprint'
import { expireCodexWeeklyLimit, extractCodexWeeklyLimit, selectCurrentCodexWeeklyLimit } from '../codexWeeklyLimit'

const tempRoots: string[] = []

async function makeTempRoot() {
  const root = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'codex-pulse-')))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

function makeTokenCountLine({
  timestamp,
  usedPercent,
  resetsAt,
  resetsInSeconds,
}: {
  timestamp: string
  usedPercent: number
  resetsAt?: number
  resetsInSeconds?: number
}) {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: {
        limit_id: 'codex',
        plan_type: 'pro',
        secondary: {
          used_percent: usedPercent,
          window_minutes: 10080,
          resets_at: resetsAt,
          resets_in_seconds: resetsInSeconds,
        },
      },
    },
  })
}

async function makeFile(root: string, relativePath: string, contents: string, mtimeMs: number): Promise<FileSignature> {
  const absolutePath = path.join(root, relativePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents, 'utf8')

  return {
    absolutePath,
    relativePath,
    source: 'sessions',
    mtimeMs,
    size: Buffer.byteLength(contents),
  }
}

describe('codexWeeklyLimit', () => {
  it('extracts the latest usable weekly sample from recent files', async () => {
    const root = await makeTempRoot()
    const older = await makeFile(
      root,
      'sessions/2026/03/26/older.jsonl',
      `${makeTokenCountLine({
        timestamp: '2026-03-26T09:00:00.000Z',
        usedPercent: 61,
        resetsAt: 1774774800,
      })}\n`,
      Date.parse('2026-03-26T09:00:00.000Z'),
    )
    const newer = await makeFile(
      root,
      'sessions/2026/03/26/newer.jsonl',
      `${makeTokenCountLine({
        timestamp: '2026-03-26T12:00:00.000Z',
        usedPercent: 76,
        resetsAt: 1774774800,
      })}\n`,
      Date.parse('2026-03-26T12:00:00.000Z'),
    )

    const limit = await extractCodexWeeklyLimit([older, newer], new Date('2026-03-26T12:30:00.000Z'))

    expect(limit).toEqual({
      limitId: 'codex',
      planType: 'pro',
      sampledAt: '2026-03-26T12:00:00.000Z',
      resetsAt: '2026-03-29T09:00:00.000Z',
      usedPercent: 76,
      remainingPercent: 24,
    })
  })

  it('supports older logs that store resets_in_seconds', async () => {
    const root = await makeTempRoot()
    const file = await makeFile(
      root,
      'sessions/2026/03/26/legacy.jsonl',
      `${makeTokenCountLine({
        timestamp: '2026-03-26T12:00:00.000Z',
        usedPercent: 40,
        resetsInSeconds: 7200,
      })}\n`,
      Date.parse('2026-03-26T12:00:00.000Z'),
    )

    const limit = await extractCodexWeeklyLimit([file], new Date('2026-03-26T12:30:00.000Z'))

    expect(limit?.resetsAt).toBe('2026-03-26T14:00:00.000Z')
    expect(limit?.remainingPercent).toBe(60)
  })

  it('drops expired data and prefers the freshest valid sample', () => {
    const expired = expireCodexWeeklyLimit(
      {
        limitId: 'codex',
        planType: 'pro',
        sampledAt: '2026-03-26T09:00:00.000Z',
        resetsAt: '2026-03-26T10:00:00.000Z',
        usedPercent: 88,
        remainingPercent: 12,
      },
      new Date('2026-03-26T10:01:00.000Z'),
    )
    const selected = selectCurrentCodexWeeklyLimit(
      {
        limitId: 'codex',
        planType: 'pro',
        sampledAt: '2026-03-26T12:00:00.000Z',
        resetsAt: '2026-03-29T09:00:00.000Z',
        usedPercent: 76,
        remainingPercent: 24,
      },
      expired,
      new Date('2026-03-26T12:30:00.000Z'),
    )

    expect(expired).toBeNull()
    expect(selected?.remainingPercent).toBe(24)
  })
})
