import { mkdir, readdir, readlink, rm, symlink } from 'node:fs/promises'
import path from 'node:path'

import type { FileSignature } from './fingerprint'

async function collectMirrorEntries(currentDir: string): Promise<string[]> {
  const entries: string[] = []

  let dirEntries

  try {
    dirEntries = await readdir(currentDir, { withFileTypes: true })
  } catch {
    return entries
  }

  for (const entry of dirEntries) {
    const entryPath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      entries.push(...(await collectMirrorEntries(entryPath)))
      continue
    }

    entries.push(entryPath)
  }

  return entries
}

async function pruneEmptyDirectories(currentDir: string, stopAt: string): Promise<boolean> {
  let dirEntries

  try {
    dirEntries = await readdir(currentDir, { withFileTypes: true })
  } catch {
    return false
  }

  let hasContent = false

  for (const entry of dirEntries) {
    const entryPath = path.join(currentDir, entry.name)

    if (!entry.isDirectory()) {
      hasContent = true
      continue
    }

    const childHasContent = await pruneEmptyDirectories(entryPath, stopAt)

    if (childHasContent) {
      hasContent = true
      continue
    }

    if (entryPath !== stopAt) {
      await rm(entryPath, { force: true, recursive: true })
    }
  }

  return hasContent
}

async function ensureSymlink(target: string, linkPath: string) {
  try {
    const existingTarget = await readlink(linkPath)

    if (existingTarget === target) {
      return
    }
  } catch {
    // If the path is missing or not a symlink, replace it below.
  }

  await rm(linkPath, { force: true, recursive: true })
  await mkdir(path.dirname(linkPath), { recursive: true })
  await symlink(target, linkPath)
}

export async function rebuildMirror(mirrorRoot: string, files: FileSignature[]) {
  const sessionsRoot = path.join(mirrorRoot, 'sessions')
  const desiredLinks = new Map<string, string>()

  await mkdir(sessionsRoot, { recursive: true })

  for (const file of files) {
    const relativeTarget = path.join(
      file.source === 'sessions' ? 'live' : 'archived',
      file.relativePath.replace(/^(live|archived)[/\\]?/, ''),
    )
    const linkPath = path.join(sessionsRoot, relativeTarget)

    desiredLinks.set(linkPath, file.absolutePath)
  }

  const existingEntries = await collectMirrorEntries(sessionsRoot)

  for (const existingPath of existingEntries) {
    if (!desiredLinks.has(existingPath)) {
      await rm(existingPath, { force: true, recursive: true })
    }
  }

  for (const [linkPath, target] of desiredLinks) {
    await ensureSymlink(target, linkPath)
  }

  await pruneEmptyDirectories(sessionsRoot, sessionsRoot)

  return sessionsRoot
}
