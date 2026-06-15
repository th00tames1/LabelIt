import sharp from 'sharp'
import { createHash } from 'crypto'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const THUMBNAIL_SIZE = 256

// Translate sharp's raw error messages into something a user can act on.
// A single corrupt JPEG shouldn't crash the whole batch — but we also want to
// preserve the underlying cause so logs are useful.
function describeImageError(err: unknown, imagePath: string): Error {
  const message = err instanceof Error ? err.message : String(err)
  const file = imagePath.split(/[\\/]/).pop() ?? imagePath
  if (/Input file is missing|ENOENT/i.test(message)) {
    return new Error(`Image file not found on disk: ${file}`)
  }
  if (/unsupported image format|magic|Input buffer/i.test(message)) {
    return new Error(`Unsupported or corrupted image: ${file}`)
  }
  if (/maxDimension|Input image exceeds/i.test(message)) {
    return new Error(`Image too large to process: ${file}`)
  }
  if (/EACCES|permission denied/i.test(message)) {
    return new Error(`Permission denied reading image: ${file}`)
  }
  return new Error(`Failed to read image "${file}": ${message}`)
}

export async function generateThumbnail(
  imagePath: string,
  thumbnailDir: string
): Promise<string> {
  if (!existsSync(thumbnailDir)) {
    mkdirSync(thumbnailDir, { recursive: true })
  }

  // Use SHA-256 hash of the full path to avoid truncation collisions
  const hash = createHash('sha256').update(imagePath).digest('hex')
  const filename = hash + '.jpg'
  const thumbnailPath = join(thumbnailDir, filename)

  if (existsSync(thumbnailPath)) return thumbnailPath

  try {
    await sharp(imagePath, { failOn: 'none' })  // 'none' = best-effort decode of slightly malformed files
      .rotate() // Apply EXIF orientation so thumbnail matches displayed orientation
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath)
  } catch (err) {
    throw describeImageError(err, imagePath)
  }

  return thumbnailPath
}

export async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  try {
    // Apply EXIF auto-rotation so stored dimensions match what browsers display
    const meta = await sharp(imagePath, { failOn: 'none' }).rotate().metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    if (width <= 0 || height <= 0) {
      throw new Error(`Image has invalid dimensions (${width}x${height})`)
    }
    return { width, height }
  } catch (err) {
    throw describeImageError(err, imagePath)
  }
}
