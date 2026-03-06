/**
 * Phase 4: YOLO auto-label IPC handlers
 *
 * Channel: yolo:autoLabel
 *   - Calls the sidecar /yolo/detect endpoint for one or more images
 *   - Auto-maps YOLO class names → project label_class_ids (fuzzy match / auto-create)
 *   - Bulk-creates annotations with source='yolo_auto' and confidence populated
 *   - Returns per-image results
 *
 * Channel: yolo:acceptAll
 *   - Converts all yolo_auto annotations for an image to source='manual'
 *
 * Channel: yolo:rejectAll
 *   - Deletes all yolo_auto annotations for an image
 */

import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import { listLabels, createLabel } from '../db/repositories/label.repo'
import { bulkCreate, bulkDelete, listForImage } from '../db/repositories/annotation.repo'
import { updateImageStatus } from '../db/repositories/image.repo'
import { sidecarService } from '../services/sidecar.service'
import type { CreateAnnotationDto } from '../db/schema'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Bright ANSI-palette colors for auto-created label classes */
const AUTO_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

function randomAutoColor(index: number): string {
  return AUTO_COLORS[index % AUTO_COLORS.length]
}

/**
 * Resolve YOLO class name → label_class_id.
 * 1. Case-insensitive match against existing labels
 * 2. Auto-create if not found
 * Returns a mutable map that accumulates across multiple images in a batch.
 */
function resolveClassMap(
  yoloClassNames: string[],
  classMap: Map<string, string>,  // className → label_class_id (mutated)
): void {
  const existing = listLabels()
  for (const className of yoloClassNames) {
    if (classMap.has(className)) continue

    const match = existing.find((l) => l.name.toLowerCase() === className.toLowerCase())
    if (match) {
      classMap.set(className, match.id)
    } else {
      // Auto-create a new label class
      const colorIdx = existing.length + classMap.size
      const created = createLabel({
        name: className,
        color: randomAutoColor(colorIdx),
      })
      // Add to existing list so subsequent names don't collide with same color index
      existing.push(created)
      classMap.set(className, created.id)
    }
  }
}

// ─── Types (shared with renderer via preload) ─────────────────────────────────

interface AutoLabelRequest {
  imageIds: string[]         // which images to process
  modelPath: string          // e.g. "yolo11n" or absolute path
  confidenceThreshold: number
  iouThreshold: number
}

interface ImageAutoLabelResult {
  imageId: string
  detectionCount: number
  newLabelClasses: string[]  // names of any auto-created label classes
  error?: string
}

interface AutoLabelResponse {
  results: ImageAutoLabelResult[]
  totalDetections: number
  processingTimeMs: number
}

// ─── Register handlers ────────────────────────────────────────────────────────

export function registerYoloIpc(): void {

  // ── yolo:autoLabel ────────────────────────────────────────────────────────
  ipcMain.handle('yolo:autoLabel', async (_event, req: AutoLabelRequest): Promise<AutoLabelResponse> => {
    const { imageIds, modelPath, confidenceThreshold, iouThreshold } = req
    const db = getDatabase()

    // Fetch all images in one query
    const images = db.prepare(
      `SELECT id, file_path, width, height FROM images WHERE id IN (${imageIds.map(() => '?').join(',')})`,
    ).all(...imageIds) as { id: string; file_path: string; width: number; height: number }[]

    const classMap = new Map<string, string>()  // className → label_class_id
    const results: ImageAutoLabelResult[] = []
    const startMs = Date.now()
    let totalDetections = 0

    const sidecarBaseUrl = sidecarService.baseUrl

    for (const image of images) {
      try {
        // 1. Read image as base64
        const { readFileSync } = await import('fs')
        const imgBuffer = readFileSync(image.file_path)
        // Pure base64 only — no data URL prefix (Python sidecar expects raw base64)
        const base64 = imgBuffer.toString('base64')

        // 2. Call sidecar
        const res = await fetch(`${sidecarBaseUrl}/yolo/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: base64,
            model_path: modelPath,
            confidence_threshold: confidenceThreshold,
            iou_threshold: iouThreshold,
          }),
        })

        if (!res.ok) {
          throw new Error(`Sidecar error ${res.status}: ${await res.text()}`)
        }

        const data = await res.json() as {
          detections: { class_name: string; confidence: number; bbox: [number, number, number, number] }[]
        }

        const detections = data.detections
        if (detections.length === 0) {
          results.push({ imageId: image.id, detectionCount: 0, newLabelClasses: [] })
          continue
        }

        // 3. Resolve class names → label_class_ids
        const classNamesBefore = new Set(classMap.keys())
        resolveClassMap(detections.map((d) => d.class_name), classMap)
        const newClassNames = [...classMap.keys()].filter((k) => !classNamesBefore.has(k))

        // 4. Build CreateAnnotationDto[] — YOLO bbox is [cx, cy, w, h] normalized
        const dtos: CreateAnnotationDto[] = detections.map((d) => {
          const [cx, cy, w, h] = d.bbox
          return {
            label_class_id: classMap.get(d.class_name) ?? null,
            annotation_type: 'bbox',
            geometry: {
              type: 'bbox',
              x: cx - w / 2,
              y: cy - h / 2,
              width: w,
              height: h,
            },
            confidence: d.confidence,
            source: 'yolo_auto',
          }
        })

        // 5. Delete existing yolo_auto annotations for this image before re-running
        const existingAutoIds = listForImage(image.id)
          .filter((a) => a.source === 'yolo_auto')
          .map((a) => a.id)
        if (existingAutoIds.length > 0) {
          bulkDelete(existingAutoIds)
        }

        // 6. Bulk-create new annotations
        bulkCreate(image.id, dtos)

        totalDetections += detections.length
        results.push({
          imageId: image.id,
          detectionCount: detections.length,
          newLabelClasses: newClassNames,
        })
      } catch (err) {
        results.push({
          imageId: image.id,
          detectionCount: 0,
          newLabelClasses: [],
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return {
      results,
      totalDetections,
      processingTimeMs: Date.now() - startMs,
    }
  })

  // ── yolo:acceptAll ────────────────────────────────────────────────────────
  // Convert all yolo_auto annotations for an image to source='manual'
  ipcMain.handle('yolo:acceptAll', (_event, imageId: string): number => {
    const db = getDatabase()
    const result = db.prepare(
      `UPDATE annotations SET source = 'manual', updated_at = ?
       WHERE image_id = ? AND source = 'yolo_auto'`,
    ).run(Date.now(), imageId)
    return result.changes
  })

  // ── yolo:acceptOne ────────────────────────────────────────────────────────
  ipcMain.handle('yolo:acceptOne', (_event, annotationId: string): void => {
    getDatabase()
      .prepare(`UPDATE annotations SET source = 'manual', updated_at = ? WHERE id = ?`)
      .run(Date.now(), annotationId)
  })

  // ── yolo:rejectAll ────────────────────────────────────────────────────────
  // Delete all yolo_auto annotations for an image
  ipcMain.handle('yolo:rejectAll', (_event, imageId: string): number => {
    const autoIds = listForImage(imageId)
      .filter((a) => a.source === 'yolo_auto')
      .map((a) => a.id)
    if (autoIds.length > 0) bulkDelete(autoIds)
    return autoIds.length
  })

  // ── yolo:rejectOne ────────────────────────────────────────────────────────
  ipcMain.handle('yolo:rejectOne', (_event, annotationId: string): void => {
    getDatabase()
      .prepare(`DELETE FROM annotations WHERE id = ? AND source = 'yolo_auto'`)
      .run(annotationId)
  })
}
