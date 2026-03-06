import sharp from 'sharp'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'

const THUMBNAIL_SIZE = 256

export async function generateThumbnail(
  imagePath: string,
  thumbnailDir: string
): Promise<string> {
  if (!existsSync(thumbnailDir)) {
    mkdirSync(thumbnailDir, { recursive: true })
  }

  const filename = Buffer.from(imagePath).toString('base64url').slice(0, 64) + '.jpg'
  const thumbnailPath = join(thumbnailDir, filename)

  if (existsSync(thumbnailPath)) return thumbnailPath

  await sharp(imagePath)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath)

  return thumbnailPath
}

export async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(imagePath).metadata()
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  }
}
