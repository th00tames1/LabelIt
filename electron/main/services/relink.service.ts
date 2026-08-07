import { existsSync } from 'fs'
import { join, basename } from 'path'
import { getDatabase } from '../db/database'
import { generateThumbnail } from './thumbnail.service'
import { resolveAgainstDir } from './path-resolve'

export interface RelinkResult {
  checked: number
  relinked: number
  thumbnails_fixed: number
  missing: number
}

interface ImagePathRow {
  id: string
  file_path: string
  thumbnail_path: string | null
}

/**
 * Re-anchor stored absolute paths after a project folder has been copied or
 * moved, possibly to another machine.
 *
 * Images and thumbnails are recorded with absolute paths, so a copied project
 * keeps its annotations but every image path points at the old location and
 * the canvas/thumbnails come up empty. For each row whose file is missing we
 * look for the same file under the current project directory (longest path
 * suffix first, see resolveAgainstDir) and persist the healed path. Thumbnails
 * travel inside `<project>/.thumbnails`, so a stale thumbnail path is first
 * re-pointed at the copied file by basename; only genuinely absent thumbnails
 * are regenerated, in the background, so opening stays fast.
 *
 * Rows whose files cannot be found anywhere are left untouched: annotations
 * are never dropped, and the images reappear the moment the files are restored
 * and the project is reopened.
 */
// Result of the most recent relink pass, so the renderer can tell the user when
// images could not be found instead of just showing a black canvas.
let lastRelinkResult: RelinkResult | null = null

export function getLastRelinkResult(): RelinkResult | null {
  return lastRelinkResult
}

export function relinkProjectImages(projectDir: string): RelinkResult {
  const db = getDatabase()
  const rows = db.prepare('SELECT id, file_path, thumbnail_path FROM images').all() as ImagePathRow[]
  const thumbnailDir = join(projectDir, '.thumbnails')
  const updateFilePath = db.prepare('UPDATE images SET file_path = ? WHERE id = ?')
  const updateThumbnail = db.prepare('UPDATE images SET thumbnail_path = ? WHERE id = ?')

  const result: RelinkResult = { checked: rows.length, relinked: 0, thumbnails_fixed: 0, missing: 0 }
  const regenerate: { id: string; filePath: string }[] = []

  const pass = db.transaction(() => {
    for (const row of rows) {
      let filePath = row.file_path

      if (!existsSync(filePath)) {
        const resolved = resolveAgainstDir(filePath, projectDir)
        if (!resolved) {
          result.missing += 1
          continue
        }
        try {
          updateFilePath.run(resolved, row.id)
          filePath = resolved
          result.relinked += 1
        } catch {
          // file_path is UNIQUE — if another row already claims the resolved
          // path (duplicate imports from two machines), keep this row as-is.
          result.missing += 1
          continue
        }
      }

      const thumbnail = row.thumbnail_path
      if (thumbnail == null || !existsSync(thumbnail)) {
        // Thumbnails are copied along with the project folder; only the
        // directory prefix of the stored path is stale.
        const copied = thumbnail ? join(thumbnailDir, basename(thumbnail)) : null
        if (copied && existsSync(copied)) {
          updateThumbnail.run(copied, row.id)
          result.thumbnails_fixed += 1
        } else {
          regenerate.push({ id: row.id, filePath })
        }
      }
    }
  })
  pass()

  if (regenerate.length > 0) {
    void regenerateThumbnails(regenerate, thumbnailDir)
  }

  lastRelinkResult = result
  return result
}

/** Rebuild missing thumbnails without blocking project open; the sidebar fills
 *  in as rows are updated (placeholders show until then). Stops quietly if the
 *  project is closed mid-run. */
async function regenerateThumbnails(
  items: { id: string; filePath: string }[],
  thumbnailDir: string,
): Promise<void> {
  let done = 0
  for (const item of items) {
    try {
      const thumbnailPath = await generateThumbnail(item.filePath, thumbnailDir)
      getDatabase().prepare('UPDATE images SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, item.id)
      done += 1
    } catch (err) {
      if (err instanceof Error && /Database not open/.test(err.message)) break
      // Unreadable image — leave the placeholder.
    }
  }
  if (done > 0) console.log(`[relink] Regenerated ${done}/${items.length} thumbnails`)
}
