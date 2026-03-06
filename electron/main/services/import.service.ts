import { readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { createImage, imageExistsByPath } from '../db/repositories/image.repo'
import { generateThumbnail, getImageDimensions } from './thumbnail.service'
import type { ImportResult } from '../db/schema'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif'])

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

      createImage({
        filename: basename(filePath),
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        width,
        height,
        file_size: stat.size,
      })
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
