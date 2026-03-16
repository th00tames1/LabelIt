import sharp from 'sharp'
import { createHash } from 'crypto'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const THUMBNAIL_SIZE = 256

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

  await sharp(imagePath)
    .rotate() // Apply EXIF orientation so thumbnail matches displayed orientation
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath)

  return thumbnailPath
}

export async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  // Apply EXIF auto-rotation so stored dimensions match what browsers display
  const meta = await sharp(imagePath).rotate().metadata()
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  }
}
