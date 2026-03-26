import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { DashboardSnapshot } from '@shared/usage'

const cacheSchema = z.object({
  version: z.literal(1),
  coarseSentinel: z.string(),
  preciseFingerprint: z.string(),
  snapshot: z.custom<DashboardSnapshot>(),
})

export type DashboardCacheDocument = z.infer<typeof cacheSchema>

export async function readCacheDocument(cachePath: string) {
  try {
    const contents = await readFile(cachePath, 'utf8')
    return cacheSchema.parse(JSON.parse(contents))
  } catch {
    return null
  }
}

export async function writeCacheDocument(cachePath: string, document: DashboardCacheDocument) {
  await mkdir(path.dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(document, null, 2), 'utf8')
}

