import { getDatabase } from '../db/database'

export interface ClassAnnotationCount {
  label_class_id: string
  name: string
  color: string
  annotation_count: number
}

export interface SplitCount {
  split: string
  count: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface DatasetStats {
  total_images: number
  labeled_images: number
  unlabeled_images: number
  total_annotations: number
  by_class: ClassAnnotationCount[]
  by_split: SplitCount[]
  by_status: StatusCount[]
}

export function getDatasetStats(): DatasetStats {
  const db = getDatabase()

  const totalImages = (
    db.prepare('SELECT COUNT(*) as c FROM images').get() as { c: number }
  ).c

  const labeledImages = (
    db.prepare("SELECT COUNT(*) as c FROM images WHERE status != 'unlabeled'").get() as { c: number }
  ).c

  const totalAnnotations = (
    db.prepare('SELECT COUNT(*) as c FROM annotations').get() as { c: number }
  ).c

  const byClass = db.prepare(`
    SELECT
      lc.id as label_class_id,
      lc.name,
      lc.color,
      COUNT(a.id) as annotation_count
    FROM label_classes lc
    LEFT JOIN annotations a ON a.label_class_id = lc.id
    GROUP BY lc.id
    ORDER BY lc.sort_order ASC
  `).all() as ClassAnnotationCount[]

  const bySplit = db.prepare(`
    SELECT split, COUNT(*) as count FROM images GROUP BY split
  `).all() as SplitCount[]

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM images GROUP BY status
  `).all() as StatusCount[]

  return {
    total_images: totalImages,
    labeled_images: labeledImages,
    unlabeled_images: totalImages - labeledImages,
    total_annotations: totalAnnotations,
    by_class: byClass,
    by_split: bySplit,
    by_status: byStatus,
  }
}
