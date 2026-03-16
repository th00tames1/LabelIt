import { readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { createImage, imageExistsByPath } from '../db/repositories/image.repo'
import { bulkCreate } from '../db/repositories/annotation.repo'
import { generateThumbnail, getImageDimensions } from './thumbnail.service'
import { createLabel, listLabels } from '../db/repositories/label.repo'
import type { CreateAnnotationDto, ImportResult } from '../db/schema'
import { createAnnotationResolver } from './import-resolver'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif'])
const PRESET_LABEL_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

interface LabelRegistry {
  idsByName: Map<string, string>
  nextColorIndex: number
}

function collectImagePaths(dir: string): string[] {
  const paths: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      // Skip hidden directories (.thumbnails, .git, etc.) and project DB files
      if (entry.isDirectory() && entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        paths.push(...collectImagePaths(fullPath))
      } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        paths.push(fullPath)
      }
    }
  } catch {
    // Ignore unreadable directories.
  }
  return paths
}

function createLabelRegistry(): LabelRegistry {
  const existingLabels = listLabels()
  return {
    idsByName: new Map(existingLabels.map((label) => [label.name, label.id])),
    nextColorIndex: existingLabels.length,
  }
}

function ensureLabelId(labelName: string, registry: LabelRegistry): string {
  const trimmed = labelName.trim()
  const existingId = registry.idsByName.get(trimmed)
  if (existingId) return existingId

  const created = createLabel({
    name: trimmed,
    color: PRESET_LABEL_COLORS[registry.nextColorIndex % PRESET_LABEL_COLORS.length],
  })
  registry.idsByName.set(trimmed, created.id)
  registry.nextColorIndex += 1
  return created.id
}

export async function importImages(
  filePaths: string[],
  thumbnailDir: string,
  onProgress?: (current: number, total: number) => void,
  annotationRoots: string[] = [],
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }
  const labelRegistry = createLabelRegistry()
  const annotationResolver = createAnnotationResolver(filePaths, annotationRoots)

  for (let i = 0; i < filePaths.length; i += 1) {
    const filePath = filePaths[i]
    onProgress?.(i, filePaths.length)

    if (imageExistsByPath(filePath)) {
      result.skipped += 1
      continue
    }

    try {
      const stat = statSync(filePath)
      const { width, height } = await getImageDimensions(filePath)
      const thumbnailPath = await generateThumbnail(filePath, thumbnailDir)

      const created = createImage({
        filename: basename(filePath),
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        width,
        height,
        file_size: stat.size,
        is_null: false,
        annotation_count: 0,
      })

      result.imported += 1

      try {
        const importedAnnotations = annotationResolver.resolveForImage(filePath, width, height)
        const dtos: CreateAnnotationDto[] = importedAnnotations.map((annotation) => ({
          label_class_id: ensureLabelId(annotation.labelName, labelRegistry),
          annotation_type: annotation.annotation_type,
          geometry: annotation.geometry,
          confidence: annotation.confidence ?? null,
          source: 'manual',
        }))

        if (dtos.length > 0) bulkCreate(created.id, dtos)
      } catch (err) {
        result.errors.push(`${basename(filePath)} annotations: ${(err as Error).message}`)
      }
    } catch (err) {
      result.errors.push(`${basename(filePath)}: ${(err as Error).message}`)
    }
  }

  return result
}

export async function importFolder(
  folderPath: string,
  thumbnailDir: string,
  onProgress?: (current: number, total: number) => void,
): Promise<ImportResult> {
  const filePaths = collectImagePaths(folderPath)
  return importImages(filePaths, thumbnailDir, onProgress, [folderPath])
}
