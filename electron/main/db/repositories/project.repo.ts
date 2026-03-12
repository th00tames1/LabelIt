import { getDatabase } from '../database'
import type { DatasetVersion, ProjectMeta } from '../schema'

const DATASET_VERSIONS_KEY = 'dataset_versions'

export function getProjectMeta(): ProjectMeta {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM project_meta').all() as { key: string; value: string }[]
  const meta: Record<string, string> = {}
  rows.forEach(({ key, value }) => { meta[key] = value })

  return {
    version: meta['version'] ?? '1.0.0',
    name: meta['name'] ?? 'Untitled Project',
    created_at: Number(meta['created_at'] ?? 0),
    image_storage_mode: (meta['image_storage_mode'] ?? 'linked') as 'linked' | 'copied',
  }
}

export function initProjectMeta(name: string): void {
  const db = getDatabase()
  const insert = db.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)')
  const tx = db.transaction(() => {
    insert.run('version', '1.0.0')
    insert.run('name', name)
    insert.run('created_at', String(Date.now()))
    insert.run('image_storage_mode', 'linked')
  })
  tx()
}

export function setProjectName(name: string): void {
  getDatabase().prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)').run('name', name)
}

export function getProjectMetaValue(key: string): string | null {
  const row = getDatabase()
    .prepare('SELECT value FROM project_meta WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setProjectMetaValue(key: string, value: string): void {
  getDatabase().prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)').run(key, value)
}

export function getDatasetVersions(): DatasetVersion[] {
  const raw = getProjectMetaValue(DATASET_VERSIONS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('Stored dataset versions are not in the expected array format.')
    }
    return parsed as DatasetVersion[]
  } catch {
    throw new Error('Stored dataset versions are corrupted. Please repair the project metadata before continuing.')
  }
}

export function setDatasetVersions(versions: DatasetVersion[]): void {
  setProjectMetaValue(DATASET_VERSIONS_KEY, JSON.stringify(versions))
}
