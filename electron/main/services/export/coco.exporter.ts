import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { listImages, getImage } from '../../db/repositories/image.repo'
import { listForImage } from '../../db/repositories/annotation.repo'
import { listLabels } from '../../db/repositories/label.repo'
import type { COCOExportOptions, ExportResult } from '../../db/schema'

export async function exportToCOCO(options: COCOExportOptions): Promise<ExportResult> {
  const { output_dir, split } = options
  mkdirSync(output_dir, { recursive: true })

  const labels = listLabels()
  const images = listImages(split && split !== 'unassigned' ? { split } : undefined)

  const categories = labels.map((l, i) => ({
    id: i + 1,
    name: l.name,
    supercategory: 'object',
  }))

  const cocoImages: object[] = []
  const cocoAnnotations: object[] = []
  let annId = 1
  let fileCount = 0

  for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
    const image = images[imgIdx]
    const imageId = imgIdx + 1

    cocoImages.push({
      id: imageId,
      file_name: image.filename,
      width: image.width,
      height: image.height,
    })

    const annotations = listForImage(image.id)
    for (const ann of annotations) {
      const labelIdx = labels.findIndex((l) => l.id === ann.label_class_id)
      if (labelIdx < 0) continue
      const categoryId = labelIdx + 1

      if (ann.annotation_type === 'bbox' && ann.geometry.type === 'bbox') {
        const { x, y, width, height } = ann.geometry
        const absX = x * image.width
        const absY = y * image.height
        const absW = width * image.width
        const absH = height * image.height

        cocoAnnotations.push({
          id: annId++,
          image_id: imageId,
          category_id: categoryId,
          bbox: [absX, absY, absW, absH],
          area: absW * absH,
          segmentation: [],
          iscrowd: 0,
        })
      } else if (
        ann.annotation_type === 'polygon' && ann.geometry.type === 'polygon'
      ) {
        const points: [number, number][] = ann.geometry.points

        const absPoints = points.flatMap(([nx, ny]: [number, number]) => [nx * image.width, ny * image.height])

        const xs = absPoints.filter((_: number, i: number) => i % 2 === 0)
        const ys = absPoints.filter((_: number, i: number) => i % 2 === 1)
        const bboxX = Math.min(...xs)
        const bboxY = Math.min(...ys)
        const bboxW = Math.max(...xs) - bboxX
        const bboxH = Math.max(...ys) - bboxY

        cocoAnnotations.push({
          id: annId++,
          image_id: imageId,
          category_id: categoryId,
          bbox: [bboxX, bboxY, bboxW, bboxH],
          area: bboxW * bboxH,
          segmentation: [absPoints],
          iscrowd: 0,
        })
      } else if (
        ann.annotation_type === 'mask' && ann.geometry.type === 'mask'
      ) {
        // Use the first contour as the primary segmentation polygon
        const pts: [number, number][] = ann.geometry.contours[0] ?? []
        if (pts.length >= 3) {
          const absPoints = pts.flatMap(([nx, ny]: [number, number]) => [nx * image.width, ny * image.height])
          const xs = absPoints.filter((_: number, i: number) => i % 2 === 0)
          const ys = absPoints.filter((_: number, i: number) => i % 2 === 1)
          const bboxX = Math.min(...xs)
          const bboxY = Math.min(...ys)
          const bboxW = Math.max(...xs) - bboxX
          const bboxH = Math.max(...ys) - bboxY

          cocoAnnotations.push({
            id: annId++,
            image_id: imageId,
            category_id: categoryId,
            bbox: [bboxX, bboxY, bboxW, bboxH],
            area: bboxW * bboxH,
            segmentation: [absPoints],
            iscrowd: 0,
          })
        }
      }
    }
    fileCount++
  }

  const coco = {
    info: { version: '1.0', description: 'Exported from LabelingTool', date_created: new Date().toISOString() },
    licenses: [],
    categories,
    images: cocoImages,
    annotations: cocoAnnotations,
  }

  const outputPath = join(output_dir, 'instances.json')
  writeFileSync(outputPath, JSON.stringify(coco, null, 2), 'utf-8')

  return { output_path: outputPath, file_count: fileCount, annotation_count: cocoAnnotations.length }
}
