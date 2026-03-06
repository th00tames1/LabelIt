import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { create } from 'xmlbuilder2'
import { listImages } from '../../db/repositories/image.repo'
import { listForImage } from '../../db/repositories/annotation.repo'
import { listLabels } from '../../db/repositories/label.repo'
import type { VOCExportOptions, ExportResult } from '../../db/schema'

export async function exportToVOC(options: VOCExportOptions): Promise<ExportResult> {
  const { output_dir, include_images, split } = options
  const labels = listLabels()
  const images = listImages(split && split !== 'unassigned' ? { split } : undefined)

  const annotationsDir = join(output_dir, 'Annotations')
  const imagesDir = join(output_dir, 'JPEGImages')
  mkdirSync(annotationsDir, { recursive: true })
  if (include_images) mkdirSync(imagesDir, { recursive: true })

  let annotationCount = 0
  let fileCount = 0

  for (const image of images) {
    const annotations = listForImage(image.id).filter((a) =>
      a.annotation_type === 'bbox' || a.annotation_type === 'polygon'
    )

    const baseName = basename(image.filename, extname(image.filename))

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('annotation')
        .ele('folder').txt('JPEGImages').up()
        .ele('filename').txt(image.filename).up()
        .ele('path').txt(image.file_path).up()
        .ele('size')
          .ele('width').txt(String(image.width)).up()
          .ele('height').txt(String(image.height)).up()
          .ele('depth').txt('3').up()
        .up()
        .ele('segmented').txt('0').up()

    for (const ann of annotations) {
      const label = labels.find((l) => l.id === ann.label_class_id)
      if (!label) continue

      const obj = root.ele('object')
        .ele('name').txt(label.name).up()
        .ele('pose').txt('Unspecified').up()
        .ele('truncated').txt('0').up()
        .ele('difficult').txt('0').up()

      if (ann.annotation_type === 'bbox' && ann.geometry.type === 'bbox') {
        const { x, y, width, height } = ann.geometry
        const xmin = Math.round(x * image.width)
        const ymin = Math.round(y * image.height)
        const xmax = Math.round((x + width) * image.width)
        const ymax = Math.round((y + height) * image.height)

        obj.ele('bndbox')
          .ele('xmin').txt(String(xmin)).up()
          .ele('ymin').txt(String(ymin)).up()
          .ele('xmax').txt(String(xmax)).up()
          .ele('ymax').txt(String(ymax)).up()
        .up()
        annotationCount++
      } else if (ann.annotation_type === 'polygon' && ann.geometry.type === 'polygon') {
        // VOC polygon: store as bndbox (bounding rectangle) + polygon element
        const pts = ann.geometry.points
        const xs = pts.map(([px]) => px * image.width)
        const ys = pts.map(([, py]) => py * image.height)
        const xmin = Math.round(Math.min(...xs))
        const ymin = Math.round(Math.min(...ys))
        const xmax = Math.round(Math.max(...xs))
        const ymax = Math.round(Math.max(...ys))

        obj.ele('bndbox')
          .ele('xmin').txt(String(xmin)).up()
          .ele('ymin').txt(String(ymin)).up()
          .ele('xmax').txt(String(xmax)).up()
          .ele('ymax').txt(String(ymax)).up()
        .up()

        const polyEl = obj.ele('polygon')
        pts.forEach(([px, py], i) => {
          polyEl
            .ele(`x${i + 1}`).txt(String(Math.round(px * image.width))).up()
            .ele(`y${i + 1}`).txt(String(Math.round(py * image.height))).up()
        })
        annotationCount++
      }

      obj.up()
    }

    const xml = root.end({ prettyPrint: true })
    writeFileSync(join(annotationsDir, `${baseName}.xml`), xml, 'utf-8')

    if (include_images && existsSync(image.file_path)) {
      copyFileSync(image.file_path, join(imagesDir, image.filename))
    }

    fileCount++
  }

  return {
    output_path: annotationsDir,
    file_count: fileCount,
    annotation_count: annotationCount,
  }
}
