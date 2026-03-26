import { lstat, mkdir, readlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { rebuildMirror } from '../mirrorBuilder'

const temporaryRoots: string[] = []

async function makeTempRoot() {
  const root = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'codex-pulse-')))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')

  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('rebuildMirror', () => {
  it('creates live and archived symlinks inside the synthetic Codex home', async () => {
    const root = await makeTempRoot()
    const liveFile = path.join(root, 'source', 'sessions', '2026', '03', '26', 'run.jsonl')
    const archivedFile = path.join(root, 'source', 'archived_sessions', 'finished.jsonl')
    const mirrorRoot = path.join(root, 'mirror-home')

    await mkdir(path.dirname(liveFile), { recursive: true })
    await mkdir(path.dirname(archivedFile), { recursive: true })
    await writeFile(liveFile, '{"type":"token_count"}\n', 'utf8')
    await writeFile(archivedFile, '{"type":"token_count"}\n', 'utf8')

    await rebuildMirror(mirrorRoot, [
      {
        absolutePath: liveFile,
        relativePath: path.join('live', '2026', '03', '26', 'run.jsonl'),
        source: 'sessions',
        mtimeMs: 1,
        size: 1,
      },
      {
        absolutePath: archivedFile,
        relativePath: path.join('archived', 'finished.jsonl'),
        source: 'archived',
        mtimeMs: 1,
        size: 1,
      },
    ])

    const linkedLiveTarget = await readlink(path.join(mirrorRoot, 'sessions', 'live', '2026', '03', '26', 'run.jsonl'))
    const linkedArchivedTarget = await readlink(path.join(mirrorRoot, 'sessions', 'archived', 'finished.jsonl'))

    expect(linkedLiveTarget).toBe(liveFile)
    expect(linkedArchivedTarget).toBe(archivedFile)
  })

  it('removes stale mirror entries without rebuilding the full tree', async () => {
    const root = await makeTempRoot()
    const liveFile = path.join(root, 'source', 'sessions', '2026', '03', '26', 'run.jsonl')
    const mirrorRoot = path.join(root, 'mirror-home')
    const staleFile = path.join(mirrorRoot, 'sessions', 'live', '2026', '03', '25', 'stale.jsonl')

    await mkdir(path.dirname(liveFile), { recursive: true })
    await writeFile(liveFile, '{"type":"token_count"}\n', 'utf8')

    await rebuildMirror(mirrorRoot, [
      {
        absolutePath: liveFile,
        relativePath: path.join('live', '2026', '03', '26', 'run.jsonl'),
        source: 'sessions',
        mtimeMs: 1,
        size: 1,
      },
    ])

    await mkdir(path.dirname(staleFile), { recursive: true })
    await writeFile(staleFile, '{"stale":true}\n', 'utf8')

    await rebuildMirror(mirrorRoot, [
      {
        absolutePath: liveFile,
        relativePath: path.join('live', '2026', '03', '26', 'run.jsonl'),
        source: 'sessions',
        mtimeMs: 1,
        size: 1,
      },
    ])

    await expect(lstat(staleFile)).rejects.toThrow()
    const linkedLiveTarget = await readlink(path.join(mirrorRoot, 'sessions', 'live', '2026', '03', '26', 'run.jsonl'))

    expect(linkedLiveTarget).toBe(liveFile)
  })
})
