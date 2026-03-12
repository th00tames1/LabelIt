import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database'
import type { Image, ImageFilter, ImageStatus, SplitType, SplitRatios } from '../schema'

interface ImageRow extends Omit<Image, 'status' | 'split'> {
  status: string
  split: string
}

function rowToImage(row: ImageRow): Image {
  return {
    ...row,
    status: row.status as ImageStatus,
    split: row.split as SplitType,
  }
}

export function listImages(filter?: ImageFilter): Image[] {
  const db = getDatabase()
  let sql = `SELECT i.*,
    COALESCE((SELECT COUNT(*) FROM annotations a WHERE a.image_id = i.id), 0) AS annotation_count
    FROM images i WHERE 1=1`
  const params: unknown[] = []

  if (filter?.status) { sql += ' AND i.status = ?'; params.push(filter.status) }
  if (filter?.split && filter.split !== 'unassigned') { sql += ' AND i.split = ?'; params.push(filter.split) }
  if (filter?.search) { sql += ' AND i.filename LIKE ?'; params.push(`%${filter.search}%`) }
  if (filter?.label_class_id) {
    sql += ` AND i.id IN (
      SELECT DISTINCT image_id FROM annotations WHERE label_class_id = ?
    )`
    params.push(filter.label_class_id)
  }

  sql += ' ORDER BY i.sort_order ASC, i.imported_at ASC'
  return (db.prepare(sql).all(...params) as ImageRow[]).map(rowToImage)
}

export function getImage(id: string): Image | null {
  const row = getDatabase().prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined
  return row ? rowToImage(row) : null
}

export function createImage(data: Omit<Image, 'id' | 'status' | 'split' | 'imported_at' | 'sort_order'>): Image {
  const db = getDatabase()
  const id = uuidv4()
  const now = Date.now()
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM images').get() as { m: number }
  ).m

  db.prepare(
    `INSERT INTO images (id, filename, file_path, thumbnail_path, width, height, file_size,
                          status, split, imported_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'unlabeled', 'unassigned', ?, ?)`
  ).run(
    id, data.filename, data.file_path, data.thumbnail_path ?? null,
    data.width, data.height, data.file_size, now, maxOrder + 1
  )

  return getImage(id)!
}

export function updateImageStatus(id: string, status: ImageStatus): void {
  getDatabase().prepare('UPDATE images SET status = ? WHERE id = ?').run(status, id)
}

export function updateImageSplit(id: string, split: SplitType): void {
  getDatabase().prepare('UPDATE images SET split = ? WHERE id = ?').run(split, id)
}

export function updateThumbnailPath(id: string, thumbnailPath: string): void {
  getDatabase().prepare('UPDATE images SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, id)
}

/** Mark image as in_progress if it was unlabeled (called after first annotation) */
export function ensureInProgress(id: string): void {
  getDatabase()
    .prepare(`UPDATE images SET status = 'in_progress' WHERE id = ? AND status = 'unlabeled'`)
    .run(id)
}

export function autoSplit(ratios: SplitRatios): void {
  const db = getDatabase()
  const images = db.prepare('SELECT id FROM images ORDER BY sort_order ASC').all() as { id: string }[]
  const total = images.length
  if (total === 0) return

  const shuffled = [...images]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  const trainCount = Math.round(total * ratios.train)
  const valCount = Math.round(total * ratios.val)

  const updateSplit = db.prepare('UPDATE images SET split = ? WHERE id = ?')
  const tx = db.transaction(() => {
    shuffled.forEach(({ id }, idx) => {
      let split: SplitType
      if (idx < trainCount) split = 'train'
      else if (idx < trainCount + valCount) split = 'val'
      else split = 'test'
      updateSplit.run(split, id)
    })
  })
  tx()
}

export function countImages(): { total: number; by_status: Record<string, number> } {
  const db = getDatabase()
  const total = (db.prepare('SELECT COUNT(*) as c FROM images').get() as { c: number }).c
  const rows = db.prepare('SELECT status, COUNT(*) as c FROM images GROUP BY status').all() as { status: string; c: number }[]
  const by_status: Record<string, number> = {}
  rows.forEach(({ status, c }) => { by_status[status] = c })
  return { total, by_status }
}

export function imageExistsByPath(filePath: string): boolean {
  const row = getDatabase().prepare('SELECT id FROM images WHERE file_path = ?').get(filePath)
  return !!row
}
