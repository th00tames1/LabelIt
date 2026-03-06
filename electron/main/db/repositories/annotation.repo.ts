import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database'
import type {
  Annotation, AnnotationGeometry, AnnotationType, AnnotationSource,
  CreateAnnotationDto, UpdateAnnotationDto
} from '../schema'
import { ensureInProgress } from './image.repo'

interface AnnotationRow {
  id: string
  image_id: string
  label_class_id: string | null
  annotation_type: string
  geometry: string       // JSON string
  confidence: number | null
  source: string
  is_crowd: number
  created_at: number
  updated_at: number
}

function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    image_id: row.image_id,
    label_class_id: row.label_class_id,
    annotation_type: row.annotation_type as AnnotationType,
    geometry: JSON.parse(row.geometry) as AnnotationGeometry,
    confidence: row.confidence,
    source: row.source as AnnotationSource,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function listForImage(imageId: string): Annotation[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM annotations WHERE image_id = ? ORDER BY created_at ASC')
    .all(imageId) as AnnotationRow[]
  return rows.map(rowToAnnotation)
}

export function getAnnotation(id: string): Annotation | null {
  const row = getDatabase()
    .prepare('SELECT * FROM annotations WHERE id = ?')
    .get(id) as AnnotationRow | undefined
  return row ? rowToAnnotation(row) : null
}

export function createAnnotation(imageId: string, dto: CreateAnnotationDto): Annotation {
  const db = getDatabase()
  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    `INSERT INTO annotations
       (id, image_id, label_class_id, annotation_type, geometry, confidence, source, is_crowd, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    imageId,
    dto.label_class_id ?? null,
    dto.annotation_type,
    JSON.stringify(dto.geometry),
    dto.confidence ?? null,
    dto.source ?? 'manual',
    now,
    now
  )

  // Auto-progress image status from unlabeled
  ensureInProgress(imageId)

  return getAnnotation(id)!
}

export function updateAnnotation(id: string, dto: UpdateAnnotationDto): Annotation {
  const db = getDatabase()
  const fields: string[] = ['updated_at = ?']
  const values: unknown[] = [Date.now()]

  if (dto.label_class_id !== undefined) { fields.push('label_class_id = ?'); values.push(dto.label_class_id) }
  if (dto.geometry !== undefined) { fields.push('geometry = ?'); values.push(JSON.stringify(dto.geometry)) }
  if (dto.confidence !== undefined) { fields.push('confidence = ?'); values.push(dto.confidence) }

  db.prepare(`UPDATE annotations SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
  return getAnnotation(id)!
}

export function deleteAnnotation(id: string): void {
  getDatabase().prepare('DELETE FROM annotations WHERE id = ?').run(id)
}

export function bulkCreate(imageId: string, dtos: CreateAnnotationDto[]): Annotation[] {
  const db = getDatabase()
  const now = Date.now()
  const insert = db.prepare(
    `INSERT INTO annotations
       (id, image_id, label_class_id, annotation_type, geometry, confidence, source, is_crowd, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  )

  const ids: string[] = []
  const tx = db.transaction(() => {
    for (const dto of dtos) {
      const id = uuidv4()
      ids.push(id)
      insert.run(
        id, imageId, dto.label_class_id ?? null, dto.annotation_type,
        JSON.stringify(dto.geometry), dto.confidence ?? null, dto.source ?? 'manual', now, now
      )
    }
  })
  tx()

  if (ids.length > 0) ensureInProgress(imageId)

  return ids.map((id) => getAnnotation(id)!)
}

export function bulkDelete(ids: string[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  getDatabase().prepare(`DELETE FROM annotations WHERE id IN (${placeholders})`).run(...ids)
}

export function countByClass(): { label_class_id: string | null; count: number }[] {
  return getDatabase()
    .prepare('SELECT label_class_id, COUNT(*) as count FROM annotations GROUP BY label_class_id')
    .all() as { label_class_id: string | null; count: number }[]
}

/** Get all annotations for export — streams by image to avoid memory spikes */
export function* iterateByImage(split?: string): Generator<{ imageId: string; annotations: Annotation[] }> {
  const db = getDatabase()
  const imageQuery = split && split !== 'unassigned'
    ? db.prepare('SELECT id FROM images WHERE split = ? ORDER BY sort_order ASC')
    : db.prepare('SELECT id FROM images ORDER BY sort_order ASC')

  const images = (split && split !== 'unassigned'
    ? imageQuery.all(split)
    : imageQuery.all()) as { id: string }[]

  for (const { id } of images) {
    yield { imageId: id, annotations: listForImage(id) }
  }
}
