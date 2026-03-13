import { readdirSync, statSync, existsSync, readFileSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import { createImage, imageExistsByPath } from '../db/repositories/image.repo'
import { generateThumbnail, getImageDimensions } from './thumbnail.service'
import { createAnnotation } from '../db/repositories/annotation.repo'
import { createLabel, listLabels } from '../db/repositories/label.repo'
import type { ImportResult } from '../db/schema'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif'])
const PRESET_LABEL_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function collectImagePaths(dir: string): string[] {
  const paths: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        paths.push(...collectImagePaths(fullPath))
      } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        paths.push(fullPath)
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return paths
}

export async function importImages(
  filePaths: string[],
  thumbnailDir: string,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    onProgress?.(i, filePaths.length)

    if (imageExistsByPath(filePath)) {
      result.skipped++
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
      await importCompanionAnnotations(filePath, created.id, width, height)
      result.imported++
    } catch (err) {
      result.errors.push(`${basename(filePath)}: ${(err as Error).message}`)
    }
  }

  return result
}

export async function importFolder(
  folderPath: string,
  thumbnailDir: string,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  const filePaths = collectImagePaths(folderPath)
  return importImages(filePaths, thumbnailDir, onProgress)
}

async function importCompanionAnnotations(imagePath: string, imageId: string, width: number, height: number): Promise<void> {
  const labelPath = join(dirname(imagePath), `${basename(imagePath, extname(imagePath))}.txt`)
  if (!existsSync(labelPath)) return

  const classNames = loadCompanionClassNames(dirname(imagePath))
  const existingLabels = listLabels()
  const labelIdByIndex = new Map<number, string>()

  classNames.forEach((name, index) => {
    const existing = existingLabels.find((label) => label.name === name)
    const created = existing ?? createLabel({
      name,
      color: PRESET_LABEL_COLORS[index % PRESET_LABEL_COLORS.length],
    })
    labelIdByIndex.set(index, created.id)
  })

  const lines = readFileSync(labelPath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const tokens = line.split(/\s+/)
    if (tokens.length < 5) continue
    const classIndex = Number(tokens[0])
    const labelId = labelIdByIndex.get(classIndex)
    if (labelId == null) continue

    if (tokens.length === 5) {
      const [cx, cy, w, h] = tokens.slice(1).map(Number)
      createAnnotation(imageId, {
        label_class_id: labelId,
        annotation_type: 'bbox',
        geometry: {
          type: 'bbox',
          x: cx - w / 2,
          y: cy - h / 2,
          width: w,
          height: h,
        },
        source: 'manual',
      })
      continue
    }

    const coords = tokens.slice(1).map(Number)
    if (coords.length >= 6 && coords.length % 2 === 0) {
      const points: [number, number][] = []
      for (let index = 0; index < coords.length; index += 2) {
        points.push([coords[index], coords[index + 1]])
      }
      createAnnotation(imageId, {
        label_class_id: labelId,
        annotation_type: 'polygon',
        geometry: { type: 'polygon', points },
        source: 'manual',
      })
    }
  }
}

function loadCompanionClassNames(folderPath: string): string[] {
  const classesTxt = join(folderPath, 'classes.txt')
  if (existsSync(classesTxt)) {
    return readFileSync(classesTxt, 'utf-8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }

  const dataYaml = join(folderPath, 'data.yaml')
  if (existsSync(dataYaml)) {
    const text = readFileSync(dataYaml, 'utf-8')
    const match = text.match(/names:\s*\[(.*?)\]/s)
    if (match) {
      return match[1].split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    }
  }

  return []
}
