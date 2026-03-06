import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database'
import type { LabelClass, KeypointDefinition, KeypointSkeletonEdge, CreateLabelDto, UpdateLabelDto } from '../schema'

export function listLabels(): LabelClass[] {
  return getDatabase()
    .prepare('SELECT * FROM label_classes ORDER BY sort_order ASC, created_at ASC')
    .all() as LabelClass[]
}

export function createLabel(dto: CreateLabelDto): LabelClass {
  const db = getDatabase()
  const id = uuidv4()
  const now = Date.now()
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM label_classes').get() as { m: number }
  ).m

  db.prepare(
    `INSERT INTO label_classes (id, name, color, shortcut, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, dto.name, dto.color, dto.shortcut ?? null, maxOrder + 1, now)

  return db.prepare('SELECT * FROM label_classes WHERE id = ?').get(id) as LabelClass
}

export function updateLabel(id: string, dto: UpdateLabelDto): LabelClass {
  const db = getDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  if (dto.name !== undefined) { fields.push('name = ?'); values.push(dto.name) }
  if (dto.color !== undefined) { fields.push('color = ?'); values.push(dto.color) }
  if (dto.shortcut !== undefined) { fields.push('shortcut = ?'); values.push(dto.shortcut) }
  if (dto.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(dto.sort_order) }

  if (fields.length > 0) {
    db.prepare(`UPDATE label_classes SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
  }

  return db.prepare('SELECT * FROM label_classes WHERE id = ?').get(id) as LabelClass
}

export function deleteLabel(id: string): void {
  getDatabase().prepare('DELETE FROM label_classes WHERE id = ?').run(id)
}

export function reorderLabels(ids: string[]): void {
  const db = getDatabase()
  const update = db.prepare('UPDATE label_classes SET sort_order = ? WHERE id = ?')
  const tx = db.transaction(() => {
    ids.forEach((id, index) => update.run(index, id))
  })
  tx()
}

// ─── Keypoint definitions ────────────────────────────────────────────────────

export function listKeypointDefs(labelClassId: string): KeypointDefinition[] {
  return getDatabase()
    .prepare('SELECT * FROM keypoint_definitions WHERE label_class_id = ? ORDER BY sort_order ASC')
    .all(labelClassId) as KeypointDefinition[]
}

export function createKeypointDef(labelClassId: string, name: string, color: string, sortOrder: number): KeypointDefinition {
  const db = getDatabase()
  const id = uuidv4()
  db.prepare(
    `INSERT INTO keypoint_definitions (id, label_class_id, name, sort_order, color)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, labelClassId, name, sortOrder, color)
  return db.prepare('SELECT * FROM keypoint_definitions WHERE id = ?').get(id) as KeypointDefinition
}

export function deleteKeypointDef(id: string): void {
  getDatabase().prepare('DELETE FROM keypoint_definitions WHERE id = ?').run(id)
}

export function setSkeletonEdge(labelClassId: string, fromKpId: string, toKpId: string): void {
  getDatabase()
    .prepare(`INSERT OR IGNORE INTO keypoint_skeleton (label_class_id, from_kp_id, to_kp_id) VALUES (?, ?, ?)`)
    .run(labelClassId, fromKpId, toKpId)
}

export function removeSkeletonEdge(labelClassId: string, fromKpId: string, toKpId: string): void {
  getDatabase()
    .prepare(`DELETE FROM keypoint_skeleton WHERE label_class_id = ? AND from_kp_id = ? AND to_kp_id = ?`)
    .run(labelClassId, fromKpId, toKpId)
}

export function listSkeletonEdges(labelClassId: string): KeypointSkeletonEdge[] {
  return getDatabase()
    .prepare('SELECT * FROM keypoint_skeleton WHERE label_class_id = ?')
    .all(labelClassId) as KeypointSkeletonEdge[]
}
